import { enqueueJob, schema, writeAudit, type DbHandle } from '@builderdo/db';
import type { AuthUser, JobType } from '@builderdo/shared';
import { Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DB_HANDLE } from '../db/db.module';

const { jobRuns } = schema;
const listQuery = z.object({ status: z.enum(['queued', 'running', 'succeeded', 'retrying', 'dead']).default('dead') });
const testJob = z.object({ fail: z.boolean().default(false) });

/** Admin tools for background jobs: see failed ones and re-run them after a fix. */
@Controller('admin/jobs')
@Roles('admin')
export class AdminJobsController {
  constructor(@Inject(DB_HANDLE) private readonly dbh: DbHandle) {}

  @Get()
  list(@Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return this.dbh.db.select().from(jobRuns).where(eq(jobRuns.status, query.status)).orderBy(desc(jobRuns.updatedAt)).limit(100);
  }

  /** Re-runs a dead job as a new job (new id, same payload), linked back to the original. */
  @Post(':jobId/rerun')
  @HttpCode(202)
  async rerun(
    @CurrentUser() user: AuthUser,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() req: FastifyRequest,
  ): Promise<{ jobId: string }> {
    return this.dbh.db.transaction(async (tx) => {
      const [job] = await tx.select().from(jobRuns).where(eq(jobRuns.jobId, jobId)).for('update');
      if (!job) throw new NotFoundException('job not found');
      if (job.status !== 'dead') throw new ConflictException('only dead jobs can be re-run');
      const newId = await enqueueJob(tx, job.jobType as JobType, job.payload as never);
      await tx.insert(jobRuns).values({ jobId: newId, jobType: job.jobType, payload: job.payload, rerunOf: job.jobId });
      await writeAudit(tx, { actorId: user.id, action: 'job.rerun', entityType: 'job', entityId: jobId, details: { newJobId: newId }, requestId: req.id });
      return { jobId: newId };
    });
  }

  /** Sends a test job through the whole pipeline. `fail: true` fails until re-run, to exercise the dead-letter path. */
  @Post('test')
  @HttpCode(202)
  async test(@CurrentUser() user: AuthUser, @Body(new ZodPipe(testJob)) body: z.infer<typeof testJob>): Promise<{ jobId: string }> {
    const jobId = body.fail
      ? await enqueueJob(this.dbh.db, 'system.fail', { requestedBy: user.id, reason: 'admin test' })
      : await enqueueJob(this.dbh.db, 'system.ping', { requestedBy: user.id });
    return { jobId };
  }
}
