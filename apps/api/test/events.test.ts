import type { EventsPage } from '@builderdo/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await startTestApp()));
afterAll(async () => t?.close());
beforeEach(async () => t.reset());

const draft = { title: 'Paint the fence', description: 'About 40 feet of wooden fence.', zipCode: '10001' };

async function feed(authorization: string, after = 0) {
  const res = await t.app.inject({ method: 'GET', url: `/events?after=${after}`, headers: { authorization } });
  expect(res.statusCode).toBe(200);
  return res.json<EventsPage>();
}

describe('GET /events', () => {
  it('shows each user only their own events, and admins everything', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const ben = await t.login('ben@example.com', 'homeowner');
    const admin = await t.login('admin@builderdo.com', 'admin');
    await t.app.inject({ method: 'POST', url: '/projects', headers: { authorization: ana.authorization }, payload: draft });

    expect((await feed(ana.authorization)).events.map((e) => e.type)).toEqual(['project.created']);
    expect((await feed(ben.authorization)).events).toEqual([]);
    expect((await feed(admin.authorization)).events).toHaveLength(1);
  });

  it('returns only events after the cursor, so a reconnecting screen catches up', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    await t.app.inject({ method: 'POST', url: '/projects', headers: { authorization: ana.authorization }, payload: draft });
    const first = await feed(ana.authorization);
    await t.app.inject({ method: 'POST', url: '/projects', headers: { authorization: ana.authorization }, payload: draft });
    const next = await feed(ana.authorization, first.nextCursor);
    expect(next.events).toHaveLength(1);
    expect(next.events[0]!.id).toBeGreaterThan(first.nextCursor);
    const empty = await feed(ana.authorization, next.nextCursor);
    expect(empty).toEqual({ events: [], nextCursor: next.nextCursor });
  });
});
