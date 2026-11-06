import type { JobMessage, JobType, Role } from '@builderdo/shared';
import { randomUUID } from 'node:crypto';
import { auditLog, domainEvents, outbox } from './schema';
import type { Database } from './client';

/** A transaction or the database itself: helpers accept either so callers decide the transaction boundary. */
export type Executor = Pick<Database, 'insert' | 'select' | 'update' | 'execute'>;

export interface NewEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /** Users who may see this event in their feed. */
  userIds?: string[];
  /** Roles whose members may all see this event (usually ['admin']). */
  roles?: Role[];
}

export async function recordEvent(tx: Executor, event: NewEvent): Promise<number> {
  const [row] = await tx
    .insert(domainEvents)
    .values({
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actorId: event.actorId ?? null,
      payload: event.payload ?? {},
      userIds: event.userIds ?? [],
      roles: event.roles ?? ['admin'],
    })
    .returning({ id: domainEvents.id });
  return row!.id;
}

type PayloadOf<T extends JobType> = Extract<JobMessage, { type: T }>['payload'];

/**
 * Adds a job to the outbox. Call it inside the same transaction as the change that needs the job,
 * so either both are saved or neither is. The relay delivers it to the queue afterwards.
 */
export async function enqueueJob<T extends JobType>(
  tx: Executor,
  type: T,
  payload: PayloadOf<T>,
  options: { jobId?: string } = {},
): Promise<string> {
  const jobId = options.jobId ?? randomUUID();
  await tx.insert(outbox).values({ jobId, jobType: type, payload });
  return jobId;
}

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export async function writeAudit(tx: Executor, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({ ...entry, details: entry.details ?? {} });
}
