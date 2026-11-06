import { schema, type DbHandle } from '@builderdo/db';
import { presignUploadRequest, uploadLimits, type AuthUser, type PresignUploadRequest } from '@builderdo/shared';
import { BadRequestException, Body, Controller, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DB_HANDLE } from '../db/db.module';
import { OBJECT_STORAGE, type ObjectStorage, type SignedUpload } from '../storage/object-storage';

const { projects, projectPhotos } = schema;
const extension: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

/**
 * Two-step upload: ask for a short-lived signed link, upload straight to storage, then confirm.
 * Files never pass through the API, and only allowed types and sizes get a link.
 */
@Controller('uploads')
export class UploadsController {
  constructor(
    @Inject(DB_HANDLE) private readonly dbh: DbHandle,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Post('presign')
  @Roles('homeowner')
  async presign(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(presignUploadRequest)) body: PresignUploadRequest,
  ): Promise<{ uploadId: string; upload: SignedUpload }> {
    const [project] = await this.dbh.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, body.projectId), eq(projects.homeownerId, user.id)));
    if (!project) throw new NotFoundException('project not found');

    const uploadId = randomUUID();
    const key = `projects/${project.id}/photos/${uploadId}.${extension[body.contentType]}`;
    await this.dbh.db.insert(projectPhotos).values({
      id: uploadId,
      projectId: project.id,
      storageKey: key,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
    });
    const upload = await this.storage.signUpload(key, body.contentType, body.sizeBytes, uploadLimits.linkTtlSeconds);
    return { uploadId, upload };
  }

  @Post(':id/complete')
  @Roles('homeowner')
  @HttpCode(200)
  async complete(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<{ status: 'uploaded' }> {
    const [photo] = await this.dbh.db
      .select({ id: projectPhotos.id, key: projectPhotos.storageKey, size: projectPhotos.sizeBytes })
      .from(projectPhotos)
      .innerJoin(projects, eq(projects.id, projectPhotos.projectId))
      .where(and(eq(projectPhotos.id, id), eq(projects.homeownerId, user.id)));
    if (!photo) throw new NotFoundException('upload not found');

    const actual = await this.storage.sizeOf(photo.key);
    if (actual === null) throw new BadRequestException({ code: 'upload_missing', message: 'The file has not been uploaded yet' });
    if (actual !== photo.size) {
      await this.dbh.db.update(projectPhotos).set({ status: 'rejected' }).where(eq(projectPhotos.id, id));
      throw new BadRequestException({ code: 'upload_mismatch', message: 'The uploaded file does not match what was requested' });
    }
    await this.dbh.db.update(projectPhotos).set({ status: 'uploaded' }).where(eq(projectPhotos.id, id));
    return { status: 'uploaded' };
  }
}
