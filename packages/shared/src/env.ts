import { z } from 'zod';

/** Thrown when required configuration is missing or invalid. Never includes secret values. */
export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates environment variables against a schema at startup.
 * Services call this once and refuse to start on failure, so a missing or
 * wrong setting is caught at deploy time instead of at the first request.
 * Error messages name the variable and the problem, never the value.
 */
export function loadEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

/** Shared building blocks for service env schemas. */
export const envFields = {
  nodeEnv: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  port: (fallback: number) => z.coerce.number().int().min(1).max(65535).default(fallback),
  url: z.url(),
  postgresUrl: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  optionalString: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
};
