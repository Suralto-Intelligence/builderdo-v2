import type { DbHandle } from '@builderdo/db';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import type { ApiEnv } from './config/env';

/** Builds the API app. Used by main.ts and by tests, so both run the same setup. */
export async function createApp(env: ApiEnv, overrides: { dbHandle?: DbHandle } = {}): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    trustProxy: true,
    bodyLimit: 1_048_576,
  });
  // Echo the request id so clients and logs can be correlated.
  adapter.getInstance().addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(env, overrides), adapter, {
    bufferLogs: true,
    logger: env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  app.enableCors({ origin: env.API_CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true });
  app.enableShutdownHooks();
  return app;
}
