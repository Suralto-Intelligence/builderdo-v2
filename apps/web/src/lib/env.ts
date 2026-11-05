import 'server-only';
import { envFields, loadEnv } from '@builderdo/shared';
import { z } from 'zod';

const webEnvSchema = z.object({
  NODE_ENV: envFields.nodeEnv,
  API_URL: envFields.url.default('http://localhost:4000'),
});

/** Server-side settings, validated on first use. */
export const serverEnv = () => loadEnv(webEnvSchema);
