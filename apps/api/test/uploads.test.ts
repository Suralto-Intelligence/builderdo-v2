import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await startTestApp()));
afterAll(async () => t?.close());
beforeEach(async () => t.reset());

async function setup() {
  const ana = await t.login('ana@example.com', 'homeowner');
  const res = await t.app.inject({
    method: 'POST', url: '/projects', headers: { authorization: ana.authorization },
    payload: { title: 'New deck', description: 'A 12 by 16 foot deck in the backyard.', zipCode: '60601' },
  });
  return { ana, projectId: res.json<{ id: string }>().id };
}

const presign = (authorization: string, payload: object) =>
  t.app.inject({ method: 'POST', url: '/uploads/presign', headers: { authorization }, payload });

describe('photo uploads', () => {
  it('refuses file types other than images', async () => {
    const { ana, projectId } = await setup();
    const res = await presign(ana.authorization, { purpose: 'project_photo', projectId, contentType: 'application/pdf', sizeBytes: 1000 });
    expect(res.statusCode).toBe(400);
  });

  it('refuses files over 10 MB', async () => {
    const { ana, projectId } = await setup();
    const res = await presign(ana.authorization, { purpose: 'project_photo', projectId, contentType: 'image/jpeg', sizeBytes: 11 * 1024 * 1024 });
    expect(res.statusCode).toBe(400);
  });

  it("refuses uploads to someone else's project", async () => {
    const { projectId } = await setup();
    const ben = await t.login('ben@example.com', 'homeowner');
    const res = await presign(ben.authorization, { purpose: 'project_photo', projectId, contentType: 'image/jpeg', sizeBytes: 1000 });
    expect(res.statusCode).toBe(404);
  });

  it('uploads through the signed link and confirms the file', async () => {
    const { ana, projectId } = await setup();
    const bytes = new Uint8Array(2048).fill(7);
    const res = await presign(ana.authorization, { purpose: 'project_photo', projectId, contentType: 'image/png', sizeBytes: bytes.length });
    expect(res.statusCode).toBe(201);
    const { uploadId, upload } = res.json<{ uploadId: string; upload: { url: string; headers: Record<string, string> } }>();

    const early = await t.app.inject({ method: 'POST', url: `/uploads/${uploadId}/complete`, headers: { authorization: ana.authorization } });
    expect(early.statusCode).toBe(400);

    const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes });
    expect(put.ok).toBe(true);

    const done = await t.app.inject({ method: 'POST', url: `/uploads/${uploadId}/complete`, headers: { authorization: ana.authorization } });
    expect(done.statusCode).toBe(200);
  });
});
