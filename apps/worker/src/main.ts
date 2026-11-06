import { SQSClient } from '@aws-sdk/client-sqs';
import { createDb } from '@builderdo/db';
import { EnvValidationError } from '@builderdo/shared';
import * as Sentry from '@sentry/node';
import pino from 'pino';
import { loadWorkerEnv } from './env';
import { OutboxRelay } from './relay';
import { QueueWorker } from './worker';

function main(): void {
  const env = loadWorkerEnv();
  const logger = pino({ level: env.LOG_LEVEL, base: { service: 'worker' } });
  if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, release: process.env.APP_VERSION });

  const dbh = createDb(env.DATABASE_URL, { applicationName: 'builderdo-worker', maxConnections: 5 });
  const sqs = new SQSClient({ region: env.QUEUE_REGION, endpoint: env.QUEUE_ENDPOINT });

  const relay = new OutboxRelay({ dbh, sqs, queueUrl: env.QUEUE_JOBS_URL, logger: logger.child({ part: 'relay' }) });
  const worker = new QueueWorker({
    dbh,
    sqs,
    queueUrl: env.QUEUE_JOBS_URL,
    waitSeconds: env.WORKER_POLL_WAIT_SECONDS,
    maxAttempts: env.WORKER_MAX_ATTEMPTS,
    logger,
    onError: (error, context) => Sentry.captureException(error, { extra: context }),
  });

  let relaying = true;
  const relayLoop = (async () => {
    while (relaying) {
      try {
        const sent = await relay.relayOnce();
        if (sent > 0) continue; // more may be waiting
      } catch (error) {
        logger.error({ err: error }, 'relay batch failed');
      }
      await new Promise((r) => setTimeout(r, env.OUTBOX_POLL_MS));
    }
  })();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    relaying = false;
    Promise.all([worker.stop(), relayLoop])
      .then(() => dbh.close())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  worker.start();
  logger.info({ queue: env.QUEUE_JOBS_URL }, 'worker started');
}

try {
  main();
} catch (error) {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
}
