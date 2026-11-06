import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApiEnv } from '../src/config/env';
import { startTestApp, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await startTestApp()));
afterAll(async () => t?.close());
beforeEach(async () => t.reset());

describe('sign-in', () => {
  it('rejects requests without a token, with the standard error shape', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/projects' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'unauthorized', requestId: expect.any(String) } });
  });

  it('rejects a forged token', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/projects', headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(res.statusCode).toBe(401);
  });

  it('creates the user on first sign-in and keeps their role', async () => {
    const { userId } = await t.login('Ana@Example.com', 'homeowner');
    const again = await t.login('ana@example.com', 'homeowner');
    expect(again.userId).toBe(userId);
  });

  it('does not let a later token change an existing role', async () => {
    const { authorization } = await t.login('bo@example.com', 'homeowner');
    const promoted = await t.login('bo@example.com', 'admin');
    const res = await t.app.inject({ method: 'GET', url: '/admin/jobs', headers: { authorization: promoted.authorization } });
    expect(res.statusCode).toBe(403);
    expect(authorization).toBeTruthy();
  });

  it('keeps health checks public', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
  });
});

describe('API settings', () => {
  const base = { DATABASE_URL: 'postgres://u@localhost/db', AUTH_LOCAL_SECRET: 'x'.repeat(32) };

  it('refuses local sign-in in production', () => {
    expect(() => loadApiEnv({ ...base, NODE_ENV: 'production' })).toThrow(/AUTH_MODE/);
  });

  it('requires a strong local secret', () => {
    expect(() => loadApiEnv({ ...base, AUTH_LOCAL_SECRET: 'short' })).toThrow(/AUTH_LOCAL_SECRET/);
  });

  it('requires Cognito settings in cognito mode', () => {
    expect(() => loadApiEnv({ ...base, AUTH_MODE: 'cognito' })).toThrow(/COGNITO_USER_POOL_ID/);
  });
});
