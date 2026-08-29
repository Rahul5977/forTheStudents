// Phase 11 packet 2: scope helpers are pure — test the matrix without any I/O.
import { describe, expect, it } from 'vitest';
import { hasScope, parseScopes, requireScope, serializeScopes, type Principal } from './auth';

const p = (role: Principal['role'], scopes: Principal['scopes'] = []): Principal =>
  ({ userId: 'u', role, scopes, emailVerified: true, claims: {} });

describe('parseScopes / serializeScopes', () => {
  it('parses a comma list, trims, de-dupes and drops unknown scopes', () => {
    expect(parseScopes(' mentors.manage, users.view ,mentors.manage,bogus.scope')).toEqual(['mentors.manage', 'users.view']);
    expect(parseScopes(undefined)).toEqual([]);
    expect(parseScopes('')).toEqual([]);
    expect(parseScopes(42)).toEqual([]);
  });
  it('serialises to a stable, sorted, de-duped string', () => {
    expect(serializeScopes(['users.view', 'mentors.manage', 'users.view', 'nope'])).toBe('mentors.manage,users.view');
    expect(serializeScopes([])).toBe('');
  });
});

describe('hasScope / requireScope', () => {
  it('superadmin holds every scope without carrying any', () => {
    expect(hasScope(p('superadmin'), 'broadcast.send')).toBe(true);
    expect(() => requireScope(p('superadmin'), 'mentors.interview')).not.toThrow();
  });
  it('an admin needs the explicit scope', () => {
    expect(hasScope(p('admin', ['mentors.manage']), 'mentors.manage')).toBe(true);
    expect(hasScope(p('admin', ['mentors.manage']), 'broadcast.send')).toBe(false);
    expect(() => requireScope(p('admin', []), 'users.view')).toThrow(/Requires permission: users.view/);
  });
  it('a non-admin is refused even if a scope somehow rides in the token', () => {
    expect(() => requireScope(p('student', ['users.view']), 'users.view')).toThrow(/Requires role/);
    expect(() => requireScope(p('mentor', ['mentors.manage']), 'mentors.manage')).toThrow(/Requires role/);
  });
});
