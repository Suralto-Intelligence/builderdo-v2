import { CreateQueueCommand, GetQueueAttributesCommand, GetQueueUrlCommand, SQSClient } from '@aws-sdk/client-sqs';
import { createDb, enqueueJob, prepareTestDatabase, schema, truncateAll, type DbHandle } from '@builderdo/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadWorkerEnv } from './env';
import { OutboxRelay } from './relay';
import { QueueWorker } from './worker';

/**
 * Phase 1 gate, end to end against real PostgreSQL and the local SQS stand-in:
 * API-side change -> outbox -> relay -> queue -> worker -> event in the change feed,
 * and a failing job -> retries -> dead-letter queue -> admin re-run -> success.
 */
const logger = pino({ level: 'silent' });
const endpoint = process.env.QUEUE_ENDPOINT ?? 'http://localhost:9324';
const sqs = new SQSClient({ endpoint, region: 'us-east-1', credentials: { accessKeyId: 'x', secretAccessKey: 'x' } });
const MAX_ATTEMPTS = 2;

let dbh: DbHandle;
let queueUrl: string;
let dlqUrl: string;

async function makeQueues(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  await sqs.send(new CreateQueueCommand({ QueueName: `test-dlq-${suffix}` }));
  dlqUrl = (await sqs.send(new GetQueueUrlCommand({ QueueName: `test-dlq-${suffix}` }))).QueueUrl!;
  const dlqArn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['QueueArn'] }))).Attributes!.QueueArn!;
  const created = await sqs.send(
    new CreateQueueCommand({
      QueueName: `test-jobs-${suffix}`,
      Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: MAX_ATTEMPTS }) },
    }),
  );
  queueUrl = created.QueueUrl!;
}

const requester = randomUUID();
const parts = () => ({
  relay: new OutboxRelay({ dbh, sqs, queueUrl, logger }),
  worker: new QueueWorker({ dbh, sqs, queueUrl, waitSeconds: 1, maxAttempts: MAX_ATTEMPTS, logger, retryDelay: () => 0 }),
});

async function jobStatus(jobId: string) {
  return (await dbh.db.select().from(schema.jobRuns).where(eq(schema.jobRuns.jobId, jobId)))[0];
}

beforeAll(async () => {
  dbh = createDb(await prepareTestDatabase('worker'));
});
afterAll(async () => dbh?.close());
beforeEach(async () => {
  await truncateAll(dbh);
  await makeQueues();
});

describe('job pipeline', () => {
  it('delivers a job from the outbox to the worker and back to the change feed', async () => {
    const { relay, worker } = parts();
    const jobId = await enqueueJob(dbh.db, 'system.ping', { requestedBy: requester });

    expect(await relay.relayOnce()).toBe(1);
    expect(await relay.relayOnce()).toBe(0); // never sent twice
    expect(await worker.pollOnce()).toBe(1);

    expect((await jobStatus(jobId))?.status).toBe('succeeded');
    const events = await dbh.db.select().from(schema.domainEvents).where(eq(schema.domainEvents.type, 'system.pong'));
    expect(events).toHaveLength(1);
    expect(events[0]!.userIds).toContain(requester);
  });

  it('retries a failing job, marks it dead, moves it to the dead-letter queue, and succeeds when re-run', async () => {
    const { relay, worker } = parts();
    const jobId = await enqueueJob(dbh.db, 'system.fail', { requestedBy: requester, reason: 'gate test' });
    await relay.relayOnce();

    await worker.pollOnce();
    expect((await jobStatus(jobId))?.status).toBe('retrying');
    await worker.pollOnce();
    const dead = await jobStatus(jobId);
    expect(dead?.status).toBe('dead');
    expect(dead?.attempts).toBe(MAX_ATTEMPTS);

    // Next receive: the queue moves the message to the dead-letter queue instead of delivering it.
    expect(await worker.pollOnce()).toBe(0);
    const dlq = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['ApproximateNumberOfMessages'] }));
    expect(Number(dlq.Attributes!.ApproximateNumberOfMessages)).toBe(1);

    // Admin re-run (same writes as POST /admin/jobs/:id/rerun).
    const rerunId = await dbh.db.transaction(async (tx) => {
      const id = await enqueueJob(tx, 'system.fail', dead!.payload as { requestedBy: string; reason: string });
      await tx.insert(schema.jobRuns).values({ jobId: id, jobType: 'system.fail', payload: dead!.payload, rerunOf: jobId });
      return id;
    });
    await relay.relayOnce();
    await worker.pollOnce();
    expect((await jobStatus(rerunId))?.status).toBe('succeeded');
  });

  it('keeps jobs in the outbox while the queue is unreachable', async () => {
    const down = new SQSClient({ endpoint: 'http://127.0.0.1:1', region: 'us-east-1', credentials: { accessKeyId: 'x', secretAccessKey: 'x' }, maxAttempts: 1 });
    const relay = new OutboxRelay({ dbh, sqs: down, queueUrl, logger });
    const jobId = await enqueueJob(dbh.db, 'system.ping', { requestedBy: requester });
    expect(await relay.relayOnce()).toBe(0);
    const [row] = await dbh.db.select().from(schema.outbox).where(eq(schema.outbox.jobId, jobId));
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBeTruthy();
  });

  it('sends a malformed message to retries instead of crashing the worker', async () => {
    const { worker } = parts();
    const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: '{"type":"unknown"}' }));
    expect(await worker.pollOnce()).toBe(1);
    expect(await worker.pollOnce()).toBe(1);
    expect(await worker.pollOnce()).toBe(0); // now in the dead-letter queue
  });
});

describe('worker env', () => {
  it('requires the database and queue settings', () => {
    expect(() => loadWorkerEnv({})).toThrow(/DATABASE_URL[\s\S]*QUEUE_JOBS_URL|QUEUE_JOBS_URL[\s\S]*DATABASE_URL/);
  });
});
