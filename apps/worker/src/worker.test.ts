import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { loadWorkerEnv } from './env';
import { QueueWorker } from './worker';

const logger = pino({ level: 'silent' });

function fakeSqs(messages: { MessageId: string; ReceiptHandle: string }[]) {
  const sent: unknown[] = [];
  return {
    sent,
    send: vi.fn(async (command: unknown) => {
      sent.push(command);
      return command instanceof ReceiveMessageCommand ? { Messages: messages } : {};
    }),
  };
}

describe('QueueWorker.pollOnce', () => {
  it('deletes a message only after its handler succeeds', async () => {
    const sqs = fakeSqs([{ MessageId: 'm1', ReceiptHandle: 'r1' }]);
    const worker = new QueueWorker({ sqs, queueUrl: 'q', waitSeconds: 0, logger, handle: async () => undefined });
    expect(await worker.pollOnce()).toBe(1);
    expect(sqs.sent.some((c) => c instanceof DeleteMessageCommand)).toBe(true);
  });

  it('leaves a failed message on the queue for retry', async () => {
    const sqs = fakeSqs([{ MessageId: 'm1', ReceiptHandle: 'r1' }]);
    const worker = new QueueWorker({
      sqs, queueUrl: 'q', waitSeconds: 0, logger,
      handle: async () => { throw new Error('boom'); },
    });
    await worker.pollOnce();
    expect(sqs.sent.some((c) => c instanceof DeleteMessageCommand)).toBe(false);
  });
});

describe('worker env', () => {
  it('requires the queue URL', () => {
    expect(() => loadWorkerEnv({})).toThrow(/QUEUE_JOBS_URL/);
  });
  it('treats an empty endpoint as unset', () => {
    const env = loadWorkerEnv({ QUEUE_JOBS_URL: 'http://localhost:9324/000000000000/builderdo-jobs', QUEUE_ENDPOINT: '' });
    expect(env.QUEUE_ENDPOINT).toBeUndefined();
  });
});
