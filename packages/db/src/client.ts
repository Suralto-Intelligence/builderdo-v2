import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  /** Returns true when the database answers a trivial query within the timeout. */
  ping(timeoutMs?: number): Promise<boolean>;
  close(): Promise<void>;
}

export interface CreateDbOptions {
  maxConnections?: number;
  applicationName?: string;
}

export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  const sql = postgres(url, {
    max: options.maxConnections ?? 10,
    idle_timeout: 30,
    connect_timeout: 5,
    connection: { application_name: options.applicationName ?? 'builderdo' },
    onnotice: () => undefined,
  });
  const db = drizzle(sql, { schema });

  return {
    db,
    async ping(timeoutMs = 2000) {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          sql`select 1`,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('database ping timed out')), timeoutMs);
          }),
        ]);
        return true;
      } catch {
        return false;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    close: () => sql.end({ timeout: 5 }),
  };
}
