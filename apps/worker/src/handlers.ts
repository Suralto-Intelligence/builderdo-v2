import { recordEvent, type DbHandle } from '@builderdo/db';
import type { JobMessage } from '@builderdo/shared';
import type { Logger } from 'pino';

export interface HandlerContext {
  dbh: DbHandle;
  logger: Logger;
  /** Set when an admin re-ran a dead job. */
  rerunOf?: string;
}

type Handlers = { [T in JobMessage['type']]: (job: Extract<JobMessage, { type: T }>, ctx: HandlerContext) => Promise<void> };

/** One handler per job type. Handlers must be safe to run twice: the queue delivers at least once. */
export const handlers: Handlers = {
  'system.ping': async (job, { dbh }) => {
    await recordEvent(dbh.db, {
      type: 'system.pong',
      aggregateType: 'job',
      aggregateId: job.jobId,
      payload: { jobId: job.jobId },
      userIds: [job.payload.requestedBy],
      roles: ['admin'],
    });
  },

  // Test job for the dead-letter path: fails every attempt until an admin re-runs it.
  'system.fail': async (job, ctx) => {
    if (!ctx.rerunOf) throw new Error(`test failure: ${job.payload.reason}`);
    await handlers['system.ping']({ type: 'system.ping', jobId: job.jobId, payload: { requestedBy: job.payload.requestedBy } }, ctx);
  },

  // Phase 2 adds AI classification here. For now it confirms the job pipeline end to end.
  'project.created': async (job, { logger }) => {
    logger.info({ projectId: job.payload.projectId }, 'project received');
  },
};
