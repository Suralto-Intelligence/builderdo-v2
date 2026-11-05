import 'reflect-metadata';
import type { DbHandle } from '@builderdo/db';
import { healthResponse } from '@builderdo/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory';
import { loadApiEnv } from '../src/config/env';

const env = loadApiEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused@localhost/unused' });

function fakeDb(up: boolean): DbHandle {
  return { db: {} as DbHandle['db'], ping: async () => up, close: async () => undefined };
}

describe('GET /health', () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => app?.close());

  async function start(up: boolean) {
    app = await createApp(env, { dbHandle: fakeDb(up) });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  it('returns 200 and ok when the database is up', async () => {
    const res = await (await start(true)).inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = healthResponse.parse(res.json());
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('up');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns 503 and degraded when the database is down', async () => {
    const res = await (await start(false)).inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });

  it('liveness does not depend on the database', async () => {
    const res = await (await start(false)).inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
  });

  it('keeps an incoming request id', async () => {
    const res = await (await start(true)).inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'abc-123' } });
    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});

describe('API env', () => {
  it('refuses to start without DATABASE_URL', () => {
    expect(() => loadApiEnv({})).toThrow(/DATABASE_URL/);
  });
});
