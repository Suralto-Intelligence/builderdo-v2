import { z } from 'zod';

/**
 * Every background job type and its payload. The API writes jobs to the outbox,
 * the relay sends them to the queue, and the worker routes them by `type`.
 */
export const jobMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('system.ping'), jobId: z.uuid(), payload: z.object({ requestedBy: z.uuid() }) }),
  z.object({
    type: z.literal('system.fail'),
    jobId: z.uuid(),
    payload: z.object({ requestedBy: z.uuid(), reason: z.string() }),
  }),
  z.object({ type: z.literal('project.created'), jobId: z.uuid(), payload: z.object({ projectId: z.uuid() }) }),
]);
export type JobMessage = z.infer<typeof jobMessage>;
export type JobType = JobMessage['type'];
