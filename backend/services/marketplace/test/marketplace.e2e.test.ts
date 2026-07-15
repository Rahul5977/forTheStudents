// Integration test: the whole marketplace app (routes → domain → repo → DynamoDB
// Local). Walks the mentor lifecycle apply → verify → review → search.
import { beforeAll, describe, expect, it } from 'vitest';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '@sc/shared';
import { app } from '../src/app';
import { ensureMentorsTable } from '../src/dev/local-table';

const authAs = (sub: string, role = 'student') =>
  ({ event: { requestContext: { authorizer: { jwt: { claims: { sub, email: `${sub}@x.com`, 'custom:role': role } } } } } }) as unknown as Parameters<typeof app.request>[2];

const M = authAs('mentor_1');
const ADMIN = authAs('admin_1', 'admin');
const jpost = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const jput = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body) });

beforeAll(async () => {
  await ensureMentorsTable();
  for (const sub of ['mentor_1', 'mentor_2']) {
    for (const sk of ['PROFILE', 'AVAILABILITY', 'EMAILOTP']) {
      await ddb.send(new DeleteCommand({ TableName: process.env.TABLE_MENTORS!, Key: { PK: `MENTOR#${sub}`, SK: sk } }));
    }
  }
});

const APPLY = { name: 'Aarav S', college: 'IIT Bombay', branch: 'Computer Science', year: 3, bio: 'CSE senior', topics: ['CSE vs ECE', 'Placements'], priceINR: 100 };

describe('marketplace-mentors (local DynamoDB)', () => {
  it('apply creates a DRAFT profile', async () => {
    const r = await (await app.request('/mentor/apply', jpost(APPLY), M)).json();
    expect(r.status).toBe('DRAFT');
    expect(r.emailVerified).toBe(false);
    expect(r.college).toBe('IIT Bombay');
  });

  it('rejects a non-.ac.in email', async () => {
    const res = await app.request('/mentor/verify/email', jpost({ email: 'aarav@gmail.com' }), M);
    expect(res.status).toBe(400);
  });

  it('email OTP: request returns devOtp, confirm verifies', async () => {
    const req = await (await app.request('/mentor/verify/email', jpost({ email: 'aarav@iitb.ac.in' }), M)).json();
    expect(req.sent).toBe(true);
    expect(req.devOtp).toMatch(/^\d{6}$/);
    const wrong = await app.request('/mentor/verify/email', jpost({ email: 'aarav@iitb.ac.in', code: '000000' }), M);
    expect(wrong.status).toBe(400);
    const ok = await (await app.request('/mentor/verify/email', jpost({ email: 'aarav@iitb.ac.in', code: req.devOtp }), M)).json();
    expect(ok.verified).toBe(true);
    expect(ok.mentor.emailVerified).toBe(true);
    expect(ok.mentor.status).toBe('DRAFT'); // ID still pending
  });

  it('ID verify advances to PENDING_REVIEW', async () => {
    const r = await (await app.request('/mentor/verify/id', jpost({ docRef: 'ids/mentor_1.jpg' }), M)).json();
    expect(r.mentor.idVerified).toBe(true);
    expect(r.mentor.status).toBe('PENDING_REVIEW');
  });

  it('a pending mentor is NOT yet in public search', async () => {
    const r = await (await app.request('/mentors', {}, authAs('anon'))).json();
    expect(r.mentors.find((m: { userId: string }) => m.userId === 'mentor_1')).toBeUndefined();
  });

  it('admin sees the pending queue; non-admin is forbidden', async () => {
    const forbidden = await app.request('/admin/mentors/pending', {}, M);
    expect(forbidden.status).toBe(403);
    const q = await (await app.request('/admin/mentors/pending', {}, ADMIN)).json();
    expect(q.find((m: { userId: string }) => m.userId === 'mentor_1')).toBeTruthy();
  });

  it('non-admin cannot review; admin approves', async () => {
    const forbidden = await app.request('/admin/mentors/mentor_1/review', jpost({ decision: 'approve' }), M);
    expect(forbidden.status).toBe(403);
    const r = await (await app.request('/admin/mentors/mentor_1/review', jpost({ decision: 'approve' }), ADMIN)).json();
    expect(r.status).toBe('APPROVED');
  });

  it('approved mentor appears in public search WITHOUT leaking email/otp', async () => {
    const r = await (await app.request('/mentors?college=bombay', {}, authAs('anon'))).json();
    const m = r.mentors.find((x: { userId: string }) => x.userId === 'mentor_1');
    expect(m).toBeTruthy();
    expect(m.email).toBeUndefined();
    expect(m.emailVerified).toBeUndefined();
    expect(m.topics).toContain('Placements');
  });

  it('search filters by branch + maxPrice', async () => {
    expect((await (await app.request('/mentors?branch=computer', {}, authAs('a'))).json()).count).toBeGreaterThanOrEqual(1);
    expect((await (await app.request('/mentors?maxPrice=50', {}, authAs('a'))).json()).count).toBe(0); // price 100 > 50
  });

  it('re-applying after approval is forbidden (locked)', async () => {
    const res = await app.request('/mentor/apply', jpost(APPLY), M);
    expect(res.status).toBe(403);
  });

  it('availability round-trips with optimistic concurrency (409 on stale)', async () => {
    const slots = [{ id: 's1', startsAt: '2026-07-20T10:00:00.000Z', durationMin: 25, open: true }];
    const put = await (await app.request('/mentor/availability', jput({ slots }), M)).json();
    expect(put.version).toBe(1);
    expect(put.slots).toHaveLength(1);
    const stale = await app.request('/mentor/availability', jput({ slots: [], version: 0 }), M);
    expect(stale.status).toBe(409);
  });

  it('profile update changes price', async () => {
    const r = await (await app.request('/mentor/profile', jput({ priceINR: 150 }), M)).json();
    expect(r.priceINR).toBe(150);
  });
});
