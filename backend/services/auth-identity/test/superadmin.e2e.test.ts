// Phase 11 packet 1: deterministic, idempotent superadmin bootstrap + the self-demotion guard.
// Runs the whole Hono app against DynamoDB Local (vitest env sets SUPERADMIN_EMAIL).
import { beforeAll, describe, expect, it } from 'vitest';
import { auditRepo } from '@sc/shared';
import { app } from '../src/app';
import { authAs, ensureUsersTable, ensureAuditTable, resetUsers } from './helpers';

const json = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  await ensureUsersTable();
  await ensureAuditTable();
  await resetUsers(['sa_1', 'sa_case', 'sa_unverified', 'sa_lookalike', 'sa_plus', 'stu_9']);
});

describe('superadmin bootstrap (Phase 11 packet 1)', () => {
  it('promotes the configured account when its VERIFIED email matches exactly', async () => {
    const me = authAs({ sub: 'sa_1', email: 'owner.person@example.com', email_verified: true, 'custom:role': 'student' });
    const r = await (await app.request('/auth/bootstrap', { method: 'POST' }, me)).json();
    expect(r.role).toBe('superadmin');
    expect(r.permissions).toContain('mentors.manage');
    expect(r.permissions).toContain('broadcast.send');
    // Audited under the promoted user's own trail.
    const trail = await auditRepo.recent('sa_1', 5);
    expect(trail.some((e) => e.action === 'superadmin.bootstrap')).toBe(true);
  });

  it('is idempotent — a second bootstrap is a no-op (no second audit row)', async () => {
    const me = authAs({ sub: 'sa_1', email: 'owner.person@example.com', email_verified: true, 'custom:role': 'superadmin' });
    const before = await auditRepo.count('sa_1');
    const r = await (await app.request('/auth/bootstrap', { method: 'POST' }, me)).json();
    expect(r.role).toBe('superadmin');
    expect(await auditRepo.count('sa_1')).toBe(before);
  });

  it('matches case-insensitively (different casing is still promoted)', async () => {
    const me = authAs({ sub: 'sa_case', email: 'OWNER.PERSON@example.COM', email_verified: 'true', 'custom:role': 'student' });
    const r = await (await app.request('/auth/bootstrap', { method: 'POST' }, me)).json();
    expect(r.role).toBe('superadmin');
  });

  it('does NOT promote an UNVERIFIED email, even if the address matches', async () => {
    const me = authAs({ sub: 'sa_unverified', email: 'owner.person@example.com', email_verified: false, 'custom:role': 'student' });
    const r = await (await app.request('/auth/bootstrap', { method: 'POST' }, me)).json();
    expect(r.role).toBe('student');
    expect(r.permissions ?? []).toHaveLength(0);
  });

  it('does NOT promote lookalike addresses (subaddress / different domain)', async () => {
    const plus = authAs({ sub: 'sa_plus', email: 'owner.person+admin@example.com', email_verified: true, 'custom:role': 'student' });
    expect((await (await app.request('/auth/bootstrap', { method: 'POST' }, plus)).json()).role).toBe('student');
    const domain = authAs({ sub: 'sa_lookalike', email: 'owner.person@example.co', email_verified: true, 'custom:role': 'student' });
    expect((await (await app.request('/auth/bootstrap', { method: 'POST' }, domain)).json()).role).toBe('student');
  });

  it('a superadmin cannot demote themselves via POST /me/role (403) — token role or stored role', async () => {
    // Token says superadmin.
    const tokenSuper = authAs({ sub: 'sa_1', email: 'owner.person@example.com', email_verified: true, 'custom:role': 'superadmin' });
    expect((await app.request('/me/role', json('POST', { role: 'student' }), tokenSuper)).status).toBe(403);
    // Stale token still says student, but the stored row is superadmin → still 403.
    const staleToken = authAs({ sub: 'sa_1', email: 'owner.person@example.com', email_verified: true, 'custom:role': 'student' });
    expect((await app.request('/me/role', json('POST', { role: 'mentor' }), staleToken)).status).toBe(403);
    const me = await (await app.request('/me', { method: 'GET' }, tokenSuper)).json();
    expect(me.role).toBe('superadmin');
  });

  it('GET /admin/users needs users.view: scoped admin 200 · unscoped admin 403 · superadmin 200', async () => {
    const scoped = authAs({ sub: 'adm_scoped', 'custom:role': 'admin', 'custom:scopes': 'users.view,mentors.manage' });
    const unscoped = authAs({ sub: 'adm_unscoped', 'custom:role': 'admin', 'custom:scopes': '' });
    const superA = authAs({ sub: 'sa_1', 'custom:role': 'superadmin' });
    expect((await app.request('/admin/users', { method: 'GET' }, scoped)).status).toBe(200);
    expect((await app.request('/admin/users', { method: 'GET' }, unscoped)).status).toBe(403);
    expect((await app.request('/admin/users', { method: 'GET' }, superA)).status).toBe(200);
  });

  it('an ordinary student can still switch to mentor', async () => {
    const stu = authAs({ sub: 'stu_9', email: 'stu9@example.com', email_verified: true, 'custom:role': 'student' });
    await app.request('/auth/bootstrap', { method: 'POST' }, stu);
    expect((await (await app.request('/me/role', json('POST', { role: 'mentor' }), stu)).json()).role).toBe('mentor');
  });
});
