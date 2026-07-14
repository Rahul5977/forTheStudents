// Business logic for identity/profile. Handlers call these; repos do the I/O.
// >>> This is where you (owner) write the real rules. Each function documents
// >>> its input and output; the // TODO(owner) blocks mark the decisions.
import { NotFoundError } from '@sc/shared';
import type { Principal, RankPrefs, Role, UserProfile } from '@sc/shared';
import { usersRepo } from '../repo/users.repo';

const nowIso = () => new Date().toISOString();

/**
 * Ensure a profile row exists for the freshly-authenticated caller (first login).
 * Called by POST /auth/bootstrap right after Cognito sign-in.
 *
 * @param p  verified principal (from the JWT: userId, email, phone, role)
 * @returns  the user's profile (created if it was absent)
 */
export async function bootstrap(p: Principal): Promise<UserProfile> {
  await usersRepo.createIfAbsent({
    userId: p.userId,
    role: p.role,
    email: p.email,
    phone: p.phone,
    // From the OIDC `name` claim: set for Google sign-in, undefined for phone/OTP
    // sign-up (those users add their name later via PATCH /me during onboarding).
    // The repo drops undefined values, so a missing name simply isn't written.
    name: p.name,
    now: nowIso(),
  });
  const profile = await usersRepo.get(p.userId);
  if (!profile) throw NotFoundError('Profile could not be created');
  // TODO(owner): emit `user.bootstrapped` event for analytics/welcome notification.
  return profile;
}

/**
 * Return the caller's own profile.
 * @param userId  from JWT
 * @returns       UserProfile
 * @throws        NotFoundError if the row doesn't exist (caller should bootstrap first)
 */
export async function getMe(userId: string): Promise<UserProfile> {
  const profile = await usersRepo.get(userId);
  if (!profile) throw NotFoundError('Profile not found — call /auth/bootstrap');
  return profile;
}

/**
 * Update self-editable profile fields.
 * @param userId  from JWT
 * @param patch   { name? } (extend as you allow more fields)
 * @returns       the updated UserProfile
 */
export async function updateMe(userId: string, patch: { name?: string }): Promise<UserProfile> {
  // TODO(owner): validate/normalize (trim, profanity, length) beyond zod; decide
  // which fields are editable here vs locked (e.g. email/phone change = re-verify).
  return usersRepo.updateProfile(userId, patch, nowIso());
}

/**
 * Set the student's rank & preferences (the inputs the predictor reads).
 * @param userId    from JWT
 * @param rankPrefs validated RankPrefs
 * @returns         the updated UserProfile
 */
export async function updateRankPrefs(userId: string, rankPrefs: RankPrefs): Promise<UserProfile> {
  // TODO(owner): any cross-field rules? (e.g. advRank required only if exam includes Advanced).
  // NOTE: predictor cache is keyed by inputs, not user id, so NO cache invalidation needed here.
  return usersRepo.setRankPrefs(userId, rankPrefs, nowIso());
}

/**
 * Switch the caller's role (student <-> mentor). Admin is never self-assigned.
 * @param userId  from JWT
 * @param role    'student' | 'mentor'
 * @returns       the updated UserProfile
 */
export async function switchRole(userId: string, role: Role): Promise<UserProfile> {
  // TODO(owner): to make the new role effective in the JWT you must also update the
  // Cognito user attribute `custom:role` (AdminUpdateUserAttributes) so future tokens
  // carry it. Decide: do it here (needs cognito-idp permission on the fn) or via an
  // event consumer. Also gate mentor role behind verification (marketplace service).
  return usersRepo.setRole(userId, role, nowIso());
}
