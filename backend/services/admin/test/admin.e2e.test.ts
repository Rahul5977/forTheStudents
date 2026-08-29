// Integration test: the whole admin-ops app (routes → domain → repo → DynamoDB Local).
// Seeds 2 approved + 1 pending mentor + a clean audit trail, then exercises stats,
// moderation (suspend drops from the approved GSI, reinstate restores), audit, broadcast,
// and the role=admin guard.
import { beforeAll, describe, expect, it } from 'vitest';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '@sc/shared';
import { app } from '../src/app';
import { ensureAdminTables } from '../src/dev/local-table';
import { mentorsModRepo } from '../src/repo/mentors.repo';
import { auditRepo } from '../src/repo/audit.repo';

const MENTORS = process.env.TABLE_MENTORS!;
const AUDIT = process.env.TABLE_AUDIT!;

// Phase 11: admins carry permission scopes in the token (`custom:scopes`); the default ADMIN
// has every scope, NOADMIN is an admin with none (must be 403 on every scoped route).
const ALL_SCOPES = ['mentors.manage','mentors.interview','sessions.view','payments.view','users.view','broadcast.send','content.manage'];
const authAs = (sub: string, role = 'student', scopes: string[] = role === 'admin' ? ALL_SCOPES : []) =>
  ({ event: { requestContext: { authorizer: { jwt: { claims: { sub, email: `${sub}@x.com`, 'custom:role': role, 'custom:scopes': scopes.join(',') } } } } } }) as unknown as Parameters<typeof app.request>[2];

const ADMIN = authAs('admin_1', 'admin');
const STUDENT = authAs('student_1', 'student');
const NOSCOPE = authAs('admin_noscope', 'admin', []);
const SUPER = authAs('super_1', 'superadmin', []);
const jpost = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

const seedMentor = (userId: string, college: string, status: 'APPROVED' | 'PENDING_REVIEW') =>
  ddb.send(new PutCommand({
    TableName: MENTORS,
    Item: {
      PK: `MENTOR#${userId}`, SK: 'PROFILE',
      userId, name: `Mentor ${userId}`, college, branch: 'Computer Science', status,
      gsi1pk: `MENTOR#${status}`, gsi1sk: status === 'APPROVED' ? `${college}#${userId}` : userId,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    },
  }));

beforeAll(async () => {
  await ensureAdminTables();
  // Clean seeded mentor rows.
  for (const sub of ['m_appr1', 'm_appr2', 'm_pend1']) {
    await ddb.send(new DeleteCommand({ TableName: MENTORS, Key: { PK: `MENTOR#${sub}`, SK: 'PROFILE' } }));
  }
  // Clean this admin's audit trail (append-only → delete rows directly for a fresh assert).
  for (const e of await auditRepo.recent('admin_1', 200)) {
    await ddb.send(new DeleteCommand({ TableName: AUDIT, Key: { PK: 'ADMIN#admin_1', SK: `ACT#${e.at}` } }));
  }
  await seedMentor('m_appr1', 'IIT Delhi', 'APPROVED');
  await seedMentor('m_appr2', 'IIT Bombay', 'APPROVED');
  await seedMentor('m_pend1', 'IIT Madras', 'PENDING_REVIEW');
});

describe('admin-ops (local DynamoDB)', () => {
  it('non-admin (student) is forbidden on every route', async () => {
    expect((await app.request('/admin/stats', {}, STUDENT)).status).toBe(403);
    expect((await app.request('/admin/audit', {}, STUDENT)).status).toBe(403);
    expect((await app.request('/admin/mentors/m_appr1/suspend', jpost({}), STUDENT)).status).toBe(403);
    expect((await app.request('/admin/broadcast', jpost({ title: 'Hi', body: 'Yo', userIds: ['u1'] }), STUDENT)).status).toBe(403);
  });

  it('scope enforcement (packet 2): an admin with NO scopes reads stats but cannot act; superadmin can', async () => {
    expect((await app.request('/admin/stats', {}, NOSCOPE)).status).toBe(200); // any admin
    expect((await app.request('/admin/mentors/m_appr2/suspend', jpost({}), NOSCOPE)).status).toBe(403);
    expect((await app.request('/admin/broadcast', jpost({ title: 'Hi', body: 'Yo', userIds: ['u1'] }), NOSCOPE)).status).toBe(403);
    const r = await (await app.request('/admin/broadcast', jpost({ title: 'Hi', body: 'Yo', userIds: ['u1'] }), SUPER)).json();
    expect(r.ok).toBe(true);
  });

  it('stats reports mentor counts from the status GSI', async () => {
    const s = await (await app.request('/admin/stats', {}, ADMIN)).json();
    expect(s.mentors.approved).toBe(2);
    expect(s.mentors.pendingReview).toBe(1);
    expect(s.rollups.note).toMatch(/Phase 8/);
  });

  it('suspend drops an approved mentor out of the public (approved) GSI + audits it', async () => {
    const r = await (await app.request('/admin/mentors/m_appr1/suspend', jpost({ reason: 'policy breach' }), ADMIN)).json();
    expect(r.status).toBe('SUSPENDED');
    // Re-query the approved GSI → one fewer.
    expect(await mentorsModRepo.countByStatus('APPROVED')).toBe(1);
    const after = await (await app.request('/admin/stats', {}, ADMIN)).json();
    expect(after.mentors.approved).toBe(1);
  });

  it('suspending a non-approved mentor is a 409', async () => {
    expect((await app.request('/admin/mentors/m_pend1/suspend', jpost({}), ADMIN)).status).toBe(409);
  });

  it('audit trail returns recent entries newest-first', async () => {
    const a = await (await app.request('/admin/audit?limit=10', {}, ADMIN)).json();
    expect(a.count).toBeGreaterThanOrEqual(1);
    expect(a.entries[0].action).toBe('mentor.suspend');
    expect(a.entries[0].target).toBe('m_appr1');
  });

  it('reinstate restores the mentor to the approved GSI', async () => {
    const r = await (await app.request('/admin/mentors/m_appr1/reinstate', jpost({}), ADMIN)).json();
    expect(r.status).toBe('APPROVED');
    expect(await mentorsModRepo.countByStatus('APPROVED')).toBe(2);
  });

  it('broadcast returns ok + writes an audit entry', async () => {
    const before = (await (await app.request('/admin/audit', {}, ADMIN)).json()).count;
    const r = await (await app.request('/admin/broadcast', jpost({ title: 'Round 2 open', body: 'Choice filling starts today.', userIds: ['u1', 'u2', 'u3'] }), ADMIN)).json();
    expect(r.ok).toBe(true);
    expect(r.recipients).toBe(3);
    const after = (await (await app.request('/admin/audit', {}, ADMIN)).json()).count;
    expect(after).toBe(before + 1);
  });

  it('rejects an invalid broadcast (missing userIds)', async () => {
    expect((await app.request('/admin/broadcast', jpost({ title: 'x', body: 'y' }), ADMIN)).status).toBe(400);
  });
});
