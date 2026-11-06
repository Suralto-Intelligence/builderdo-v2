import { schema } from '@builderdo/db';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await startTestApp()));
afterAll(async () => t?.close());
beforeEach(async () => t.reset());

const draft = { title: 'Fix leaking roof', description: 'Water comes through the ceiling when it rains.', zipCode: '94107' };

async function createProject(authorization: string) {
  const res = await t.app.inject({ method: 'POST', url: '/projects', headers: { authorization }, payload: draft });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

async function approvedContractorInvitedTo(projectId: string, email: string, introStatus: 'shortlisted' | 'requested') {
  const c = await t.login(email, 'contractor');
  const [business] = await t.dbh.db.insert(schema.businesses).values({ name: 'Acme Roofing', source: 'signup' }).returning();
  const [profile] = await t.dbh.db
    .insert(schema.contractorProfiles)
    .values({ userId: c.userId, businessId: business!.id, status: 'approved' })
    .returning();
  await t.dbh.db.insert(schema.introductions).values({ projectId, profileId: profile!.id, status: introStatus });
  return c;
}

describe('creating a project', () => {
  it('saves the project with its event, outbox job and audit entry', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const id = await createProject(ana.authorization);
    const db = t.dbh.db;
    const events = await db.select({ n: count() }).from(schema.domainEvents).where(eq(schema.domainEvents.aggregateId, id));
    const jobs = await db.select({ n: count() }).from(schema.outbox).where(eq(schema.outbox.jobType, 'project.created'));
    const audit = await db.select({ n: count() }).from(schema.auditLog).where(eq(schema.auditLog.entityId, id));
    expect([events[0]!.n, jobs[0]!.n, audit[0]!.n]).toEqual([1, 1, 1]);
  });

  it('validates input and explains what is wrong', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const res = await t.app.inject({
      method: 'POST', url: '/projects', headers: { authorization: ana.authorization },
      payload: { ...draft, zipCode: 'M5V 2T6' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'validation_failed', details: [{ path: 'zipCode' }] } });
  });

  it('is only allowed for homeowners', async () => {
    const c = await t.login('carl@example.com', 'contractor');
    const res = await t.app.inject({ method: 'POST', url: '/projects', headers: { authorization: c.authorization }, payload: draft });
    expect(res.statusCode).toBe(403);
  });
});

describe('who can see a project', () => {
  it('lets the owner and admins see it', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const admin = await t.login('admin@builderdo.com', 'admin');
    const id = await createProject(ana.authorization);
    for (const who of [ana, admin]) {
      const res = await t.app.inject({ method: 'GET', url: `/projects/${id}`, headers: { authorization: who.authorization } });
      expect(res.statusCode).toBe(200);
    }
  });

  it("hides it from another homeowner, as if it didn't exist", async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const ben = await t.login('ben@example.com', 'homeowner');
    const id = await createProject(ana.authorization);
    const res = await t.app.inject({ method: 'GET', url: `/projects/${id}`, headers: { authorization: ben.authorization } });
    expect(res.statusCode).toBe(404);
    const list = await t.app.inject({ method: 'GET', url: '/projects', headers: { authorization: ben.authorization } });
    expect(list.json()).toEqual([]);
  });

  it('hides it from contractors who were not invited', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const id = await createProject(ana.authorization);
    const carl = await t.login('carl@example.com', 'contractor');
    const res = await t.app.inject({ method: 'GET', url: `/projects/${id}`, headers: { authorization: carl.authorization } });
    expect(res.statusCode).toBe(404);
  });

  it('hides it from a shortlisted contractor until the homeowner requests an introduction', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const id = await createProject(ana.authorization);
    const shortlisted = await approvedContractorInvitedTo(id, 'short@example.com', 'shortlisted');
    const requested = await approvedContractorInvitedTo(id, 'req@example.com', 'requested');
    const a = await t.app.inject({ method: 'GET', url: `/projects/${id}`, headers: { authorization: shortlisted.authorization } });
    const b = await t.app.inject({ method: 'GET', url: `/projects/${id}`, headers: { authorization: requested.authorization } });
    expect(a.statusCode).toBe(404);
    expect(b.statusCode).toBe(200);
  });

  it('hides it from an invited contractor who is no longer approved', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const id = await createProject(ana.authorization);
    const c = await approvedContractorInvitedTo(id, 'sus@example.com', 'requested');
    await t.dbh.db.update(schema.contractorProfiles).set({ status: 'suspended' }).where(eq(schema.contractorProfiles.userId, c.userId));
    const res = await t.app.inject({ method: 'GET', url: `/projects/${id}`, headers: { authorization: c.authorization } });
    expect(res.statusCode).toBe(404);
  });

  it('rejects malformed ids', async () => {
    const ana = await t.login('ana@example.com', 'homeowner');
    const res = await t.app.inject({ method: 'GET', url: '/projects/not-a-uuid', headers: { authorization: ana.authorization } });
    expect(res.statusCode).toBe(400);
  });
});
