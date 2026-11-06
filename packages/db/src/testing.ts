import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { runMigrations } from './migrate';
import type { DbHandle } from './client';

/**
 * Test helpers. Each package's tests use their own database (builderdo_test_<name>) so test runs
 * can happen in parallel, and nothing ever touches the development database.
 */
export async function prepareTestDatabase(name: string): Promise<string> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://builderdo:builderdo@localhost:5432/postgres';
  const dbName = `builderdo_test_${name}`;
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error('invalid test database name');
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  try {
    const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (exists.length === 0) await admin.unsafe(`create database ${dbName}`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  await runMigrations(url.toString());
  return url.toString();
}

/** Empties every application table between tests. */
export async function truncateAll(dbh: DbHandle): Promise<void> {
  const rows = (await dbh.db.execute(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename <> 'spatial_ref_sys'`,
  )) as unknown as { tablename: string }[];
  if (rows.length === 0) return;
  await dbh.db.execute(sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`));
}
