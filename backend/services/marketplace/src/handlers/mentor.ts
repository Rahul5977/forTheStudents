// Mentor self-service endpoints (behind the Cognito authorizer — the caller acts
// on their own MENTOR#<sub> record).
import type { Context } from 'hono';
import { getPrincipal, ValidationError, type AppEnv } from '@sc/shared';
import { ApplyInput, VerifyEmailInput, VerifyIdInput, UpdateProfileInput, AvailabilityInput } from '../types';
import * as mentors from '../domain/mentors';

const readBody = (c: Context) => c.req.json().catch(() => ({}));

/** POST /mentor/apply */
export async function apply(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = ApplyInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid application', parsed.error.flatten());
  return c.json(await mentors.apply(p, parsed.data));
}

/** POST /mentor/verify/email — request an OTP (no code) or confirm it (with code). */
export async function verifyEmail(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = VerifyEmailInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid email verification', parsed.error.flatten());
  return c.json(await mentors.verifyEmail(p, parsed.data));
}

/** POST /mentor/verify/id */
export async function verifyId(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = VerifyIdInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid ID verification', parsed.error.flatten());
  return c.json(await mentors.verifyId(p, parsed.data.docRef));
}

/** GET /mentor/profile */
export async function getProfile(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await mentors.getProfile(p.userId));
}

/** PUT /mentor/profile */
export async function putProfile(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = UpdateProfileInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid profile update', parsed.error.flatten());
  return c.json(await mentors.updateProfile(p.userId, parsed.data));
}

/** GET /mentor/availability */
export async function getAvailability(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  return c.json(await mentors.getAvailability(p.userId));
}

/** PUT /mentor/availability */
export async function putAvailability(c: Context<AppEnv>) {
  const p = getPrincipal(c);
  const parsed = AvailabilityInput.safeParse(await readBody(c));
  if (!parsed.success) throw ValidationError('Invalid availability', parsed.error.flatten());
  return c.json(await mentors.putAvailability(p.userId, parsed.data));
}
