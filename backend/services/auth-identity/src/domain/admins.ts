// Superadmin-only management of the admin team: list admins, promote a user to admin
// with a set of permission scopes, edit those scopes, and demote back to student.
// The superadmin (rahul) is set out-of-band; regular admins can never reach these routes.
import { requireSuperadmin, ForbiddenError, NotFoundError, ValidationError, ADMIN_SCOPES, auditRepo, type Principal } from '@sc/shared';
import { usersRepo } from '../repo/users.repo';
import { setUserRoleAttribute } from '../cognito';

const nowIso = () => new Date().toISOString();
const VALID = new Set<string>(ADMIN_SCOPES as readonly string[]);

/** Keep only recognised scopes (drop typos / unknown scopes). */
function cleanScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) throw ValidationError('permissions must be an array of scope strings');
  return [...new Set(scopes.filter((s): s is string => typeof s === 'string' && VALID.has(s)))];
}

/** GET /admin/admins — list every admin + superadmin with their scopes. Superadmin only. */
export async function listAdmins(p: Principal) {
  requireSuperadmin(p);
  const { rows } = await usersRepo.scanUsers(5000);
  const admins = rows
    .filter((u) => u.role === 'admin' || u.role === 'superadmin')
    .map((u) => ({ userId: u.userId, name: u.name, email: u.email, role: u.role, permissions: u.permissions ?? [] }))
    .sort((a, b) => (a.role === 'superadmin' ? -1 : 1) - (b.role === 'superadmin' ? -1 : 1));
  return { admins, scopes: ADMIN_SCOPES };
}

/** Promote a user to admin (or update their scopes). Superadmin only. */
export async function setAdmin(p: Principal, targetUserId: string, permissions: unknown) {
  requireSuperadmin(p);
  const scopes = cleanScopes(permissions);
  const target = await usersRepo.get(targetUserId);
  if (!target) throw NotFoundError('User not found — they must sign in at least once first.');
  if (target.role === 'superadmin') throw ForbiddenError('The superadmin is managed out-of-band.');
  // Cognito custom:role + custom:scopes → take effect on the target's NEXT token (ADR-011).
  await setUserRoleAttribute(targetUserId, 'admin', scopes);
  const updated = await usersRepo.setRoleAndPermissions(targetUserId, 'admin', scopes, nowIso());
  await auditRepo.append(p.userId, target.role === 'admin' ? 'admin.scopes' : 'admin.promote', { target: targetUserId, detail: { scopes } });
  return updated;
}

/** Demote an admin back to student. Superadmin only; cannot demote self or another superadmin. */
export async function demoteAdmin(p: Principal, targetUserId: string) {
  requireSuperadmin(p);
  if (targetUserId === p.userId) throw ForbiddenError('You cannot demote yourself.');
  const target = await usersRepo.get(targetUserId);
  if (!target) throw NotFoundError('User not found.');
  if (target.role === 'superadmin') throw ForbiddenError('Cannot demote a superadmin.');
  await setUserRoleAttribute(targetUserId, 'student', []);
  const updated = await usersRepo.setRoleAndPermissions(targetUserId, 'student', [], nowIso());
  await auditRepo.append(p.userId, 'admin.demote', { target: targetUserId });
  return updated;
}
