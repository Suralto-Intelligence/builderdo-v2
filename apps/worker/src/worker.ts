import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { Logger } from 'pino';

export type JobHandler = (message: Message) => Promise<void>;

export interface WorkerOptions {
  sqs: Pick<SQSClient, 'send'>;
  queueUrl: string;
  waitSeconds: number;
  logger: Logger;
  handle: JobHandler;
}

/**
 * Long-polls the job queue. A message is deleted only after its handler succeeds;
 * on failure it becomes visible again and SQS retries it, moving it to the
 * dead-letter queue after the configured number of attempts.
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

  /** Processes one batch. Exposed for tests. */
  async pollOnce(): Promise<number> {
    const { sqs, queueUrl, waitSeconds, logger, handle } = this.options;
    const result = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: waitSeconds }),
      { abortSignal: this.abort.signal },
    );
    const messages = result.Messages ?? [];
    for (const message of messages) {
      const log = logger.child({ messageId: message.MessageId });
      try {
        await handle(message);
        await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
        log.info('job done');
      } catch (error) {
        // Leave the message on the queue; SQS makes it visible again for a retry.
        log.error({ err: error }, 'job failed, will retry');
      }
    }
    return messages.length;
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
