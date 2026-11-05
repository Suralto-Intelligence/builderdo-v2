import { envFields, loadEnv } from '@builderdo/shared';
import { z } from 'zod';

export const apiEnvSchema = z.object({
  NODE_ENV: envFields.nodeEnv,
  LOG_LEVEL: envFields.logLevel,
  API_PORT: envFields.port(4000),
  API_CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  DATABASE_URL: envFields.postgresUrl,
  SENTRY_DSN: envFields.optionalString,
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const API_ENV = Symbol('API_ENV');

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return loadEnv(apiEnvSchema, source);
}
