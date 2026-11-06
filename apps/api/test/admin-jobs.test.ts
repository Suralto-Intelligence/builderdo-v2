import { schema } from '@builderdo/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await startTestApp()));
afterAll(async () => t?.close());
beforeEach(async () => t.reset());

describe('admin job tools', () => {
  it('are closed to homeowners and contractors', async () => {
    for (const role of ['homeowner', 'contractor'] as const) {
      const u = await t.login(`${role}@example.com`, role);
      const res = await t.app.inject({ method: 'GET', url: '/admin/jobs', headers: { authorization: u.authorization } });
      expect(res.statusCode).toBe(403);
    }
  });

  it('re-runs a dead job as a new linked job and audits it', async () => {
    const admin = await t.login('admin@builderdo.com', 'admin');
    const deadId = '00000000-0000-4000-8000-0000000000aa';
    await t.dbh.db.insert(schema.jobRuns).values({
      jobId: deadId, jobType: 'system.fail', payload: { requestedBy: admin.userId, reason: 'x' }, status: 'dead', attempts: 5,
    });
    const listed = await t.app.inject({ method: 'GET', url: '/admin/jobs?status=dead', headers: { authorization: admin.authorization } });
    expect(listed.json()).toHaveLength(1);

    const res = await t.app.inject({ method: 'POST', url: `/admin/jobs/${deadId}/rerun`, headers: { authorization: admin.authorization } });
    expect(res.statusCode).toBe(202);
    const { jobId } = res.json<{ jobId: string }>();
    const [run] = await t.dbh.db.select().from(schema.jobRuns).where(eq(schema.jobRuns.jobId, jobId));
    expect(run?.rerunOf).toBe(deadId);
    const [queued] = await t.dbh.db.select().from(schema.outbox).where(eq(schema.outbox.jobId, jobId));
    expect(queued?.status).toBe('pending');
    const audit = await t.dbh.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'job.rerun'));
    expect(audit).toHaveLength(1);
  });

  it('only re-runs dead jobs', async () => {
    const admin = await t.login('admin@builderdo.com', 'admin');
    const id = '00000000-0000-4000-8000-0000000000bb';
    await t.dbh.db.insert(schema.jobRuns).values({ jobId: id, jobType: 'system.ping', payload: {}, status: 'succeeded' });
    const res = await t.app.inject({ method: 'POST', url: `/admin/jobs/${id}/rerun`, headers: { authorization: admin.authorization } });
    expect(res.statusCode).toBe(409);
  });
});
