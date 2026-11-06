import 'reflect-metadata';
import { createDb, prepareTestDatabase, truncateAll, type DbHandle } from '@builderdo/db';
import type { Role } from '@builderdo/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/app.factory';
import type { AppOverrides } from '../src/app.module';
import { loadApiEnv, type ApiEnv } from '../src/config/env';

export interface TestContext {
  app: NestFastifyApplication;
  dbh: DbHandle;
  env: ApiEnv;
  /** Signs in through the local test sign-in and returns an Authorization header. */
  login(email: string, role: Role): Promise<{ authorization: string; userId: string }>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function startTestApp(overrides: Omit<AppOverrides, 'dbHandle'> = {}): Promise<TestContext> {
  const url = await prepareTestDatabase('api');
  const env = loadApiEnv({
    NODE_ENV: 'test',
    DATABASE_URL: url,
    AUTH_MODE: 'local',
    AUTH_LOCAL_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000',
    STORAGE_BUCKET: 'builderdo-uploads',
  });
  const dbh = createDb(url, { maxConnections: 5 });
  const app = await createApp(env, { ...overrides, dbHandle: dbh });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    dbh,
    env,
    async login(email, role) {
      const res = await app.inject({ method: 'POST', url: '/auth/dev/login', payload: { email, role } });
      if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
      const authorization = `Bearer ${res.json<{ token: string }>().token}`;
      // First authenticated call creates the user; read it back for its id.
      const me = await app.inject({ method: 'GET', url: '/events', headers: { authorization } });
      if (me.statusCode !== 200) throw new Error(`first call failed: ${me.body}`);
      const row = await dbh.db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, email.toLowerCase()) });
      return { authorization, userId: row!.id };
    },
    reset: () => truncateAll(dbh),
    async close() {
      await app.close(); // closes dbh through DbModule shutdown
    },
  };
}
