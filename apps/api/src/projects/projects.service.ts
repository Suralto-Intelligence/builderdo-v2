import { enqueueJob, recordEvent, schema, writeAudit, type DbHandle } from '@builderdo/db';
import type { AuthUser, CreateProjectDraft, ProjectStatus } from '@builderdo/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, exists, ne } from 'drizzle-orm';
import { DB_HANDLE } from '../db/db.module';

export interface ProjectDto {
  id: string;
  status: ProjectStatus;
  title: string;
  description: string;
  zipCode: string;
  createdAt: string;
  updatedAt: string;
}

const { projects, introductions, contractorProfiles } = schema;

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB_HANDLE) private readonly dbh: DbHandle) {}

  /** Creates a draft. The project, its event and its background job are saved together or not at all. */
  async createDraft(user: AuthUser, input: CreateProjectDraft, requestId?: string): Promise<ProjectDto> {
    return this.dbh.db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ homeownerId: user.id, title: input.title, description: input.description, zipCode: input.zipCode })
        .returning();
      const p = project!;
      await recordEvent(tx, {
        type: 'project.created',
        aggregateType: 'project',
        aggregateId: p.id,
        actorId: user.id,
        payload: { status: p.status, title: p.title },
        userIds: [user.id],
        roles: ['admin'],
      });
      await enqueueJob(tx, 'project.created', { projectId: p.id });
      await writeAudit(tx, { actorId: user.id, action: 'project.create', entityType: 'project', entityId: p.id, requestId });
      return toDto(p);
    });
  }

  /** Projects the user may see: their own (homeowner), invited ones (contractor), or all (admin). */
  async list(user: AuthUser): Promise<ProjectDto[]> {
    const rows = await this.dbh.db
      .select()
      .from(projects)
      .where(this.visibleTo(user))
      .orderBy(desc(projects.createdAt))
      .limit(50);
    return rows.map(toDto);
  }

  /** Returns 404 rather than 403 for projects the user may not see, so ids cannot be probed. */
  async get(user: AuthUser, id: string): Promise<ProjectDto> {
    const [row] = await this.dbh.db.select().from(projects).where(and(eq(projects.id, id), this.visibleTo(user)));
    if (!row) throw new NotFoundException('project not found');
    return toDto(row);
  }

  private visibleTo(user: AuthUser) {
    switch (user.role) {
      case 'admin':
        return undefined;
      case 'homeowner':
        return eq(projects.homeownerId, user.id);
      case 'contractor':
        // Only approved contractors, and only for projects the homeowner asked to be introduced to.
        return exists(
          this.dbh.db
            .select({ one: introductions.id })
            .from(introductions)
            .innerJoin(contractorProfiles, eq(contractorProfiles.id, introductions.profileId))
            .where(
              and(
                eq(introductions.projectId, projects.id),
                eq(contractorProfiles.userId, user.id),
                eq(contractorProfiles.status, 'approved'),
                ne(introductions.status, 'shortlisted'),
              ),
            ),
        );
    }
  }
}

function toDto(p: typeof projects.$inferSelect): ProjectDto {
  return {
    id: p.id,
    status: p.status,
    title: p.title,
    description: p.description,
    zipCode: p.zipCode,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
