import * as Sentry from '@sentry/node';
import type { ApiEnv } from '../config/env';

/** Sends errors to Sentry when SENTRY_DSN is set; does nothing otherwise (local and tests). */
export function initSentry(env: ApiEnv): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: process.env.APP_VERSION,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
