import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import postgres from 'postgres';

export const migrationsFolder = path.join(__dirname, '..', 'migrations');

/** Applies pending migrations. Safe to run on every deploy: applied ones are skipped. */
export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  runMigrations(url).then(
    () => console.warn('migrations applied'),
    (error: unknown) => {
      console.error('migration failed', error);
      process.exit(1);
    },
  );
}
