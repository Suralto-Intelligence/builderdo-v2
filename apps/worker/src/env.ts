import { envFields, loadEnv } from '@builderdo/shared';
import { z } from 'zod';

export const workerEnvSchema = z.object({
  NODE_ENV: envFields.nodeEnv,
  LOG_LEVEL: envFields.logLevel,
  QUEUE_REGION: z.string().min(1).default('us-east-1'),
  /** Set locally to point at ElasticMQ; leave unset in AWS to use real SQS. */
  QUEUE_ENDPOINT: envFields.optionalString.pipe(z.url().optional()),
  QUEUE_JOBS_URL: envFields.url,
  WORKER_POLL_WAIT_SECONDS: z.coerce.number().int().min(0).max(20).default(20),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const loadWorkerEnv = (source: Record<string, string | undefined> = process.env): WorkerEnv =>
  loadEnv(workerEnvSchema, source);
