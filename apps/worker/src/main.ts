import { SQSClient } from '@aws-sdk/client-sqs';
import { EnvValidationError } from '@builderdo/shared';
import pino from 'pino';
import { loadWorkerEnv } from './env';
import { QueueWorker } from './worker';

function main(): void {
  const env = loadWorkerEnv();
  const logger = pino({ level: env.LOG_LEVEL, base: { service: 'worker' } });
  const sqs = new SQSClient({ region: env.QUEUE_REGION, endpoint: env.QUEUE_ENDPOINT });

  const worker = new QueueWorker({
    sqs,
    queueUrl: env.QUEUE_JOBS_URL,
    waitSeconds: env.WORKER_POLL_WAIT_SECONDS,
    logger,
    // Phase 1 replaces this with the job router (AI, discovery, email, SMS).
    handle: async (message) => {
      logger.info({ messageId: message.MessageId }, 'received job (no handlers registered yet)');
    },
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    worker.stop().then(
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
