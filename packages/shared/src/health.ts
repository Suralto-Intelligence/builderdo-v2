import { z } from 'zod';

export const dependencyStatus = z.enum(['up', 'down']);
export type DependencyStatus = z.infer<typeof dependencyStatus>;

/** Response body of GET /health on every BuilderDo service. */
export const healthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.record(z.string(), dependencyStatus),
});
export type HealthResponse = z.infer<typeof healthResponse>;

export function overallStatus(checks: Record<string, DependencyStatus>): HealthResponse['status'] {
  return Object.values(checks).every((s) => s === 'up') ? 'ok' : 'degraded';
}
