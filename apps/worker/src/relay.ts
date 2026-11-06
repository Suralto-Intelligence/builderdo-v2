import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { schema, type DbHandle } from '@builderdo/db';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Logger } from 'pino';

const { outbox, jobRuns } = schema;

export interface RelayOptions {
  dbh: DbHandle;
  sqs: Pick<SQSClient, 'send'>;
  queueUrl: string;
  logger: Logger;
  batchSize?: number;
}

/**
 * Moves jobs from the outbox table to the queue. Rows are locked with SKIP LOCKED, so several
 * workers can relay at once without sending a job twice. If the queue is down, rows stay pending
 * and are retried with backoff: a saved change never loses its job.
 */
export class OutboxRelay {
  constructor(private readonly options: RelayOptions) {}

  /** Relays one batch; returns how many jobs were sent. */
  async relayOnce(): Promise<number> {
    const { dbh, sqs, queueUrl, logger, batchSize = 25 } = this.options;
    return dbh.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outbox)
        .where(and(eq(outbox.status, 'pending'), lte(outbox.availableAt, sql`now()`)))
        .orderBy(asc(outbox.id))
        .limit(batchSize)
        .for('update', { skipLocked: true });

      let sent = 0;
      for (const row of rows) {
        const rerunOf = await tx
          .select({ rerunOf: jobRuns.rerunOf })
          .from(jobRuns)
          .where(eq(jobRuns.jobId, row.jobId))
          .then((r) => r[0]?.rerunOf ?? undefined);
        try {
          await sqs.send(
            new SendMessageCommand({
              QueueUrl: queueUrl,
              MessageBody: JSON.stringify({ type: row.jobType, jobId: row.jobId, payload: row.payload, rerunOf }),
            }),
          );
          await tx.update(outbox).set({ status: 'dispatched', dispatchedAt: new Date(), attempts: row.attempts + 1 }).where(eq(outbox.id, row.id));
          await tx
            .insert(jobRuns)
            .values({ jobId: row.jobId, jobType: row.jobType, payload: row.payload })
            .onConflictDoNothing();
          sent++;
        } catch (error) {
          const attempts = row.attempts + 1;
          const delaySeconds = Math.min(2 ** attempts, 300);
          await tx
            .update(outbox)
            .set({ attempts, lastError: String(error), availableAt: sql`now() + make_interval(secs => ${delaySeconds})` })
            .where(eq(outbox.id, row.id));
          logger.warn({ err: error, jobId: row.jobId, retryInSeconds: delaySeconds }, 'outbox relay failed');
        }
      }
      return sent;
    });
  }
}
