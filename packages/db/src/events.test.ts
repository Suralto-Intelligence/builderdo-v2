import { count } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from './client';
import { enqueueJob, recordEvent } from './events';
import { domainEvents, outbox } from './schema';
import { prepareTestDatabase, truncateAll } from './testing';

let dbh: DbHandle;

beforeAll(async () => {
  dbh = createDb(await prepareTestDatabase('db'));
});
afterAll(async () => dbh?.close());
beforeEach(async () => truncateAll(dbh));

const aggregateId = '00000000-0000-4000-8000-000000000001';
const requestedBy = '00000000-0000-4000-8000-000000000002';

describe('event log and outbox', () => {
  it('saves the event and the job together', async () => {
    await dbh.db.transaction(async (tx) => {
      await recordEvent(tx, { type: 'test.happened', aggregateType: 'test', aggregateId });
      await enqueueJob(tx, 'system.ping', { requestedBy });
    });
    expect((await dbh.db.select({ n: count() }).from(domainEvents))[0]!.n).toBe(1);
    expect((await dbh.db.select({ n: count() }).from(outbox))[0]!.n).toBe(1);
  });

  it('saves neither when the transaction fails', async () => {
    await expect(
      dbh.db.transaction(async (tx) => {
        await recordEvent(tx, { type: 'test.happened', aggregateType: 'test', aggregateId });
        await enqueueJob(tx, 'system.ping', { requestedBy });
        throw new Error('change failed');
      }),
    ).rejects.toThrow('change failed');
    expect((await dbh.db.select({ n: count() }).from(domainEvents))[0]!.n).toBe(0);
    expect((await dbh.db.select({ n: count() }).from(outbox))[0]!.n).toBe(0);
  });

  it('gives events increasing ids for the change feed', async () => {
    const a = await recordEvent(dbh.db, { type: 'a', aggregateType: 'test', aggregateId });
    const b = await recordEvent(dbh.db, { type: 'b', aggregateType: 'test', aggregateId });
    expect(b).toBeGreaterThan(a);
  });
});
