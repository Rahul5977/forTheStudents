// End-to-end-ish test for auth-identity, running the WHOLE Hono app in-process
// (middleware -> handler -> zod -> domain -> repo -> DynamoDB Local). No AWS, no
// server: hono's app.request(path, init, bindings) drives the app directly.
//
// Run it:  pnpm dev:db           (once, starts DynamoDB Local)
//          pnpm --filter @sc/auth-identity test
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { authAs, ensureUsersTable, resetUsers } from './helpers';

beforeAll(async () => {
  await ensureUsersTable();
  // Deterministic clean start — clear any profiles a prior run left behind.
  await resetUsers(['stu_1', 'stu_2', 'ghost_1']);
});

// A stand-in for "a student who just signed in with Cognito".
const student = authAs({ sub: 'stu_1', email: 'aarav@example.com', 'custom:role': 'student' });

describe('auth-identity (local DynamoDB)', () => {
  it('POST /auth/bootstrap creates the profile on first login, idempotently', async () => {
    const res = await app.request('/auth/bootstrap', { method: 'POST' }, student);
    expect(res.status).toBe(200);

    const profile = await res.json();
    expect(profile.userId).toBe('stu_1');
    expect(profile.role).toBe('student');
    expect(profile.email).toBe('aarav@example.com');
    expect(profile.createdAt).toBeTruthy();
    // This student signed in with phone/OTP → no `name` claim → name not stored yet.
    expect(profile.name).toBeUndefined();

    // Second call must NOT create a second row or clobber the first.
    const res2 = await app.request('/auth/bootstrap', { method: 'POST' }, student);
    const again = await res2.json();
    expect(again.createdAt).toBe(profile.createdAt); // unchanged => idempotent
  });

  it('bootstrap stores the name from the OIDC claim for a Google sign-in', async () => {
    const googleUser = authAs({
      sub: 'stu_2',
      email: 'diya@gmail.com',
      name: 'Diya Sharma', // Cognito populates this from the Google profile
      'custom:role': 'student',
    });
    const res = await app.request('/auth/bootstrap', { method: 'POST' }, googleUser);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Diya Sharma');
  });

  it('GET /me returns the caller’s own profile', async () => {
    const res = await app.request('/me', { method: 'GET' }, student);
    expect(res.status).toBe(200);
    expect((await res.json()).userId).toBe('stu_1');
  });

  it('GET /me for a user who never bootstrapped 404s', async () => {
    const stranger = authAs({ sub: 'ghost_1', 'custom:role': 'student' });
    const res = await app.request('/me', { method: 'GET' }, stranger);
    expect(res.status).toBe(404);
  });

  const json = (method: string, body: unknown) => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('PATCH /me updates and normalizes the name; persists to the DB', async () => {
    const res = await app.request('/me', json('PATCH', { name: '  Aarav   Kumar  ' }), student);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Aarav Kumar'); // trimmed + collapsed

    const me = await (await app.request('/me', { method: 'GET' }, student)).json();
    expect(me.name).toBe('Aarav Kumar'); // read-back from DynamoDB Local
  });

  it('PATCH /me rejects a blank name (400)', async () => {
    const res = await app.request('/me', json('PATCH', { name: '   ' }), student);
    expect(res.status).toBe(400);
  });

  it('PATCH /me/rank-prefs stores the predictor inputs; GET /me reflects them', async () => {
    const rankPrefs = {
      advRank: 850, mainRank: 4200, category: 'Open', home: ' Maharashtra ',
      gender: 'Male', pwd: false, branches: ['CSE', 'CSE', ' ECE '], priority: 'branch',
    };
    const res = await app.request('/me/rank-prefs', json('PATCH', rankPrefs), student);
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.rankPrefs.advRank).toBe(850);
    expect(p.rankPrefs.home).toBe('Maharashtra'); // trimmed
    expect(p.rankPrefs.branches).toEqual(['CSE', 'ECE']); // trimmed + de-duped
  });

  it('PATCH /me/rank-prefs rejects an out-of-range rank (400)', async () => {
    const bad = {
      advRank: 9_999_999, mainRank: 4200, category: 'Open', home: 'Delhi',
      gender: 'Male', pwd: false, branches: ['CSE'], priority: 'branch',
    };
    const res = await app.request('/me/rank-prefs', json('PATCH', bad), student);
    expect(res.status).toBe(400);
  });

  it('POST /me/role switches student -> mentor (Cognito sync is a no-op locally)', async () => {
    const res = await app.request('/me/role', json('POST', { role: 'mentor' }), student);
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('mentor');

    const me = await (await app.request('/me', { method: 'GET' }, student)).json();
    expect(me.role).toBe('mentor');
  });
});
