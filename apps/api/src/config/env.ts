import { envFields, loadEnv } from '@builderdo/shared';
import { z } from 'zod';

export const apiEnvSchema = z
  .object({
    NODE_ENV: envFields.nodeEnv,
    LOG_LEVEL: envFields.logLevel,
    API_PORT: envFields.port(4000),
    API_CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
    DATABASE_URL: envFields.postgresUrl,
    SENTRY_DSN: envFields.optionalString,

    /** `local` issues test tokens from POST /auth/dev/login. `cognito` verifies Amazon Cognito tokens. */
    AUTH_MODE: z.enum(['local', 'cognito']).default('local'),
    AUTH_LOCAL_SECRET: envFields.optionalString,
    COGNITO_REGION: envFields.optionalString,
    COGNITO_USER_POOL_ID: envFields.optionalString,
    COGNITO_CLIENT_ID: envFields.optionalString,

    STORAGE_ENDPOINT: envFields.optionalString,
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_BUCKET: z.string().min(1).default('builderdo-uploads'),
    STORAGE_ACCESS_KEY_ID: z.string().min(1).default('local'),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1).default('local'),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_MODE === 'local') {
      if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
        ctx.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'local sign-in is not allowed in staging or production' });
      }
      if (!env.AUTH_LOCAL_SECRET || env.AUTH_LOCAL_SECRET.length < 32) {
        ctx.addIssue({ code: 'custom', path: ['AUTH_LOCAL_SECRET'], message: 'must be at least 32 characters when AUTH_MODE=local' });
      }
    }
    if (env.AUTH_MODE === 'cognito') {
      for (const key of ['COGNITO_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'is required when AUTH_MODE=cognito' });
      }
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const API_ENV = Symbol('API_ENV');

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return loadEnv(apiEnvSchema, source);
}
