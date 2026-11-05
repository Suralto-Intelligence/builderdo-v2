import 'reflect-metadata';
import { EnvValidationError } from '@builderdo/shared';
import { createApp } from './app.factory';
import { loadApiEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  const app = await createApp(env);
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  app.getHttpAdapter().getInstance().log.info({ port: env.API_PORT }, 'api listening');
}

bootstrap().catch((error: unknown) => {
  // Configuration errors are expected operator mistakes: print them plainly and exit.
  if (error instanceof EnvValidationError) {
    console.error(error.message);
  } else {
    console.error('api failed to start', error);
  }
  process.exit(1);
});
