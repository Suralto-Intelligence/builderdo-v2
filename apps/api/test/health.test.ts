import { healthResponse } from '@builderdo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await startTestApp()));
afterAll(async () => t?.close());

describe('GET /health', () => {
  it('reports ok with the database up, and echoes a request id', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'abc-123' } });
    expect(res.statusCode).toBe(200);
    expect(healthResponse.parse(res.json()).checks.database).toBe('up');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('reports 503 when the database does not answer', async () => {
    const original = t.dbh.ping;
    t.dbh.ping = async () => false;
    try {
      const res = await t.app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ status: 'degraded' });
    } finally {
      t.dbh.ping = original;
    }
  });
});
