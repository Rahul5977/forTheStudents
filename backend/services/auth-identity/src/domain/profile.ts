// Business logic for identity/profile. Handlers call these; repos do the I/O.
// Every function documents its input and output.
import { NotFoundError, ValidationError, publish } from '@sc/shared';
import type { Principal, RankPrefs, Role, UserProfile } from '@sc/shared';
import { usersRepo } from '../repo/users.repo';
import { setUserRoleAttribute } from '../cognito';

const nowIso = () => new Date().toISOString();

/** Collapse runs of whitespace and trim. */
const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();

// Sanity bounds for JEE ranks — a data-quality guard beyond zod's "positive int".
const MAX_RANK = 2_000_000;

/**
 * Ensure a profile row exists for the freshly-authenticated caller (first login).
 * Called by POST /auth/bootstrap right after Cognito sign-in. Idempotent.
 *
 * @param p  verified principal (from the JWT: userId, email, phone, name?, role)
 * @returns  the user's profile (created if it was absent)
 */
export async function bootstrap(p: Principal): Promise<UserProfile> {
  const before = await usersRepo.get(p.userId);
  await usersRepo.createIfAbsent({
    userId: p.userId,
    role: p.role,
    email: p.email,
    phone: p.phone,
    // OIDC `name` claim: present for Google sign-in, undefined for phone/OTP
    // (those users add their name later via PATCH /me). Repo drops undefined.
    name: p.name ? cleanName(p.name) : undefined,
    now: nowIso(),
  });
  // Record presence — bootstrap runs on every session hydrate, so this doubles as a
  // "last seen" heartbeat that powers the admin live/active view. Best-effort.
  await usersRepo.touchLastSeen(p.userId, nowIso());

  const profile = await usersRepo.get(p.userId);
  if (!profile) throw NotFoundError('Profile could not be created');

  // Emit once, only on the FIRST bootstrap (before === null), for the welcome
  // notification (Phase 6) and funnel analytics (Phase 8). Never throws.
  if (!before) {
    await publish({
      type: 'user.bootstrapped',
      source: 'auth-identity',
      detail: { userId: profile.userId, role: profile.role, email: profile.email, at: profile.createdAt },
    });
  }
  return profile;
}

/**
 * Return the caller's own profile.
 * @param userId  from JWT
 * @throws NotFoundError if the row doesn't exist (caller should bootstrap first)
 */
export async function getMe(userId: string): Promise<UserProfile> {
  const profile = await usersRepo.get(userId);
  if (!profile) throw NotFoundError('Profile not found — call /auth/bootstrap');
  return profile;
}

/**
 * Update self-editable profile fields.
 *
 * Editable here: `name` (free text, normalized).
 * LOCKED (deliberately not editable via this route): `email`, `phone` — changing a
 * verified contact must re-run OTP/verification, and `role` — use POST /me/role.
 *
 * @param userId  from JWT
 * @param patch   { name? }
 * @returns       the updated UserProfile
 */
export async function updateMe(userId: string, patch: { name?: string }): Promise<UserProfile> {
  const next: { name?: string } = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (name.length < 1) throw ValidationError('Name cannot be blank');
    next.name = name;
  }
  if (Object.keys(next).length === 0) throw ValidationError('Nothing to update');
  return usersRepo.updateProfile(userId, next, nowIso());
}

/**
 * Set the student's rank & preferences (the inputs the predictor reads).
 * @param userId    from JWT
 * @param rankPrefs validated RankPrefs
 * @returns         the updated UserProfile
 */
export async function updateRankPrefs(userId: string, rankPrefs: RankPrefs): Promise<UserProfile> {
  // Cross-field / data-quality rules beyond zod's per-field checks.
  if (rankPrefs.advRank > MAX_RANK || rankPrefs.mainRank > MAX_RANK) {
    throw ValidationError(`Ranks look out of range (max ${MAX_RANK})`);
  }
  const normalized: RankPrefs = {
    ...rankPrefs,
    home: rankPrefs.home.trim(),
    branches: [...new Set(rankPrefs.branches.map((b) => b.trim()).filter(Boolean))],
  };
  // NOTE: the predictor cache is keyed by INPUTS, not user id, so there is nothing
  // to invalidate here — a new rank simply maps to a different cache slice.
  return usersRepo.setRankPrefs(userId, normalized, nowIso());
}

/**
 * Switch the caller's role (student <-> mentor). Admin is never self-assigned.
 *
 * Order matters: write Cognito FIRST (authoritative for the next JWT), then the DB
 * (our read model). If Cognito fails we abort and nothing changes.
 *
 * NOTE: becoming `mentor` here only flips the role — a mentor is not *verified* (and
 * so not bookable) until they pass the verification workflow in the marketplace
 * service (Phase 4). That gate lives there, not here.
 *
 * The caller's CURRENT token still carries the old role until it refreshes; the
 * frontend should refresh the Cognito session after this call.
 *
 * @param userId  from JWT (== Cognito username/sub)
 * @param role    'student' | 'mentor'
 * @returns       the updated UserProfile
 */
export async function switchRole(userId: string, role: Role): Promise<UserProfile> {
  await setUserRoleAttribute(userId, role); // no-op locally / when no pool configured
  const profile = await usersRepo.setRole(userId, role, nowIso());
  await publish({ type: 'user.role_changed', source: 'auth-identity', detail: { userId, role, at: profile.updatedAt } });
  return profile;
}
