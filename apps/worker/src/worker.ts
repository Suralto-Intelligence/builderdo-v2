import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { schema, type DbHandle } from '@builderdo/db';
import { jobMessage } from '@builderdo/shared';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import { z } from 'zod';
import { handlers } from './handlers';

const { jobRuns } = schema;
const envelope = z.object({ rerunOf: z.uuid().optional() }).passthrough();

export interface WorkerOptions {
  dbh: DbHandle;
  sqs: Pick<SQSClient, 'send'>;
  queueUrl: string;
  waitSeconds: number;
  maxAttempts: number;
  logger: Logger;
  onError?: (error: unknown, context: Record<string, unknown>) => void;
  /** Override for tests. */
  retryDelay?: (attempt: number) => number;
}

/** Retry delay before attempt n+1: 5s, 20s, 45s, 80s... capped at 15 minutes. */
export const retryDelaySeconds = (attempt: number) => Math.min(5 * attempt * attempt, 900);

/**
 * Long-polls the job queue. A message is deleted only after its handler succeeds. On failure it is
 * made visible again after a backoff; on the last allowed attempt the job is marked dead, and the queue
 * moves the message to the dead-letter queue. Admins re-run dead jobs from the admin console.
 */
export class QueueWorker {
  private running = false;
  private loop: Promise<void> | undefined;
  private readonly abort = new AbortController();

  constructor(private readonly options: WorkerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abort.abort();
    await this.loop;
  }

  async pollOnce(): Promise<number> {
    const { sqs, queueUrl, waitSeconds } = this.options;
    const result = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: waitSeconds,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
      { abortSignal: this.abort.signal },
    );
    const messages = result.Messages ?? [];
    for (const message of messages) await this.process(message);
    return messages.length;
  }

  private async process(message: Message): Promise<void> {
    const { dbh, sqs, queueUrl, maxAttempts, logger } = this.options;
    const attempt = Number(message.Attributes?.ApproximateReceiveCount ?? 1);
    let jobId: string | undefined;
    try {
      const raw: unknown = JSON.parse(message.Body ?? '');
      const job = jobMessage.parse(raw);
      const { rerunOf } = envelope.parse(raw);
      jobId = job.jobId;
      await dbh.db.update(jobRuns).set({ status: 'running', attempts: attempt }).where(eq(jobRuns.jobId, job.jobId));

      const log = logger.child({ jobId: job.jobId, jobType: job.type, attempt });
      await (handlers[job.type] as (j: typeof job, c: object) => Promise<void>)(job, { dbh, logger: log, rerunOf });

      await dbh.db.update(jobRuns).set({ status: 'succeeded', lastError: null }).where(eq(jobRuns.jobId, job.jobId));
      await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
      log.info('job succeeded');
    } catch (error) {
      const dead = attempt >= maxAttempts;
      logger.error({ err: error, jobId, attempt, dead }, dead ? 'job failed for the last time' : 'job failed, will retry');
      this.options.onError?.(error, { jobId, attempt });
      if (jobId) {
        await dbh.db
          .update(jobRuns)
          .set({ status: dead ? 'dead' : 'retrying', lastError: String(error).slice(0, 2000) })
          .where(eq(jobRuns.jobId, jobId))
          .catch((e: unknown) => logger.error({ err: e }, 'could not record job failure'));
      }
      if (!dead) {
        await sqs
          .send(new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle, VisibilityTimeout: (this.options.retryDelay ?? retryDelaySeconds)(attempt) }))
          .catch((e: unknown) => logger.warn({ err: e }, 'could not set retry delay'));
      } else {
        // Make it visible now so the queue hands it to the dead-letter queue on the next receive.
        await sqs
          .send(new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle, VisibilityTimeout: 0 }))
          .catch((e: unknown) => logger.warn({ err: e }, 'could not release dead message'));
      }
    }
  }

  private async run(): Promise<void> {
    let backoffMs = 1000;
    while (this.running) {
      try {
        await this.pollOnce();
        backoffMs = 1000;
      } catch (error) {
        if (!this.running) break;
        this.options.logger.error({ err: error, retryInMs: backoffMs }, 'queue poll failed');
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 30_000);
      }
    }
  }
}
