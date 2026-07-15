// Business logic for marketplace-mentors: the apply → verify → review lifecycle,
// profile/availability edits, and public search. Emits domain events (local-safe).
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  requireRole,
  publish,
  type Principal,
} from '@sc/shared';
import { getEnv } from '@sc/config';
import { mentorsRepo, gsiPkFor, type MentorProfile } from '../repo/mentors.repo';
import type { Apply, VerifyEmail, UpdateProfile, Availability, Review } from '../types';

const OTP_TTL_SEC = 10 * 60;
const now = () => new Date().toISOString();
// 6-digit OTP without Math.random bias concerns for a dev flow.
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const isProd = () => getEnv().STAGE === 'prod';

/** Public projection — never leak OTP/verification internals to browsers. */
export function publicView(m: MentorProfile) {
  return {
    userId: m.userId, name: m.name, college: m.college, branch: m.branch, year: m.year,
    bio: m.bio, topics: m.topics ?? [], priceINR: m.priceINR,
    ratingAvg: m.ratingAvg, ratingCount: m.ratingCount,
  };
}

async function loadOwn(userId: string): Promise<MentorProfile> {
  const m = await mentorsRepo.get(userId);
  if (!m) throw NotFoundError('No mentor application yet — POST /mentor/apply first.');
  return m;
}

// ── Apply ─────────────────────────────────────────────────────────────────────
export async function apply(p: Principal, input: Apply): Promise<MentorProfile> {
  const existing = await mentorsRepo.get(p.userId);
  if (existing?.status === 'APPROVED') throw ForbiddenError('You are already an approved mentor.');
  let profile: MentorProfile;
  if (!existing) {
    profile = {
      userId: p.userId, name: input.name, college: input.college, branch: input.branch, year: input.year,
      bio: input.bio, topics: input.topics, priceINR: input.priceINR,
      status: 'DRAFT', emailVerified: false, idVerified: false,
      email: p.email, ratingAvg: 0, ratingCount: 0, createdAt: now(), updatedAt: now(),
    };
    await mentorsRepo.create(profile);
    await publish({ type: 'mentor.applied', source: 'marketplace', detail: { userId: p.userId } });
  } else {
    // Re-applying while DRAFT/PENDING/REJECTED refreshes the details, resets to DRAFT.
    profile = await mentorsRepo.update(p.userId, {
      name: input.name, college: input.college, branch: input.branch, year: input.year,
      bio: input.bio, topics: input.topics, priceINR: input.priceINR, status: 'DRAFT',
      gsi1pk: null, gsi1sk: null,
    }, now());
  }
  return profile;
}

// ── Email verification (.ac.in OTP) ─────────────────────────────────────────────
export async function verifyEmail(p: Principal, input: VerifyEmail) {
  const profile = await loadOwn(p.userId);
  if (!/\.ac\.in$/i.test(input.email)) throw ValidationError('Use your college .ac.in email to verify.');

  if (!input.code) {
    const code = genOtp();
    await mentorsRepo.putOtp(p.userId, input.email, code, Math.floor(Date.now() / 1000) + OTP_TTL_SEC);
    // TODO(owner): send the OTP via SES/SNS. In non-prod we return it so the flow is testable.
    return { sent: true, ...(isProd() ? {} : { devOtp: code }) };
  }

  const otp = await mentorsRepo.getOtp(p.userId);
  if (!otp || otp.email !== input.email) throw ValidationError('Request an OTP for this email first.');
  if (otp.ttl < Math.floor(Date.now() / 1000)) throw ValidationError('OTP expired — request a new one.');
  if (otp.code !== input.code) throw ValidationError('Incorrect OTP.');

  const updated = await mentorsRepo.update(p.userId, { emailVerified: true, email: input.email }, now());
  return { verified: true, mentor: await maybeSubmit(updated) };
}

// ── ID verification (student-ID proof) ──────────────────────────────────────────
export async function verifyId(p: Principal, docRef?: string) {
  const profile = await loadOwn(p.userId);
  void profile;
  // TODO(owner): issue an S3 presigned PUT for the ID doc, store `docRef`, and have a
  // human/OCR check confirm it. For now, recording a docRef marks the ID step done so
  // the review workflow is exercisable end-to-end.
  const updated = await mentorsRepo.update(p.userId, { idVerified: true, idDocRef: docRef ?? 'stub' }, now());
  return { verified: true, mentor: await maybeSubmit(updated) };
}

/** When both proofs are in and still a DRAFT, advance to PENDING_REVIEW. */
async function maybeSubmit(m: MentorProfile): Promise<MentorProfile> {
  if (m.status === 'DRAFT' && m.emailVerified && m.idVerified) {
    const submitted = await mentorsRepo.update(m.userId, {
      status: 'PENDING_REVIEW', gsi1pk: gsiPkFor('PENDING_REVIEW'), gsi1sk: m.userId,
    }, now());
    await publish({ type: 'mentor.verification.submitted', source: 'marketplace', detail: { userId: m.userId } });
    return submitted;
  }
  return m;
}

// ── Profile + availability (self) ───────────────────────────────────────────────
export async function getProfile(userId: string) {
  return loadOwn(userId);
}

export async function updateProfile(userId: string, input: UpdateProfile) {
  await loadOwn(userId); // college/branch/year aren't in the DTO, so they can't change here
  const patch = { name: input.name, bio: input.bio, topics: input.topics, priceINR: input.priceINR };
  return mentorsRepo.update(userId, patch, now());
}

export async function getAvailability(userId: string) {
  await loadOwn(userId);
  return mentorsRepo.getAvailability(userId);
}

export async function putAvailability(userId: string, input: Availability) {
  await loadOwn(userId);
  return mentorsRepo.putAvailability(userId, input.slots, input.version);
}

// ── Admin review (verification queue) ───────────────────────────────────────────
export async function listPending(p: Principal) {
  requireRole(p, 'admin');
  return (await mentorsRepo.listByGsi(gsiPkFor('PENDING_REVIEW'))).map((m) => ({
    userId: m.userId, name: m.name, college: m.college, branch: m.branch, year: m.year, email: m.email, createdAt: m.createdAt,
  }));
}

export async function review(p: Principal, targetUserId: string, input: Review) {
  requireRole(p, 'admin');
  const target = await mentorsRepo.get(targetUserId);
  if (!target) throw NotFoundError('Mentor not found.');
  if (target.status !== 'PENDING_REVIEW') throw ConflictError(`Cannot review a ${target.status} application.`);

  if (input.decision === 'approve') {
    const approved = await mentorsRepo.update(targetUserId, {
      status: 'APPROVED', gsi1pk: gsiPkFor('APPROVED'), gsi1sk: `${target.college}#${targetUserId}`,
      reviewNote: input.note,
    }, now());
    await publish({ type: 'mentor.approved', source: 'marketplace', detail: { userId: targetUserId } });
    return approved;
  }
  const rejected = await mentorsRepo.update(targetUserId, {
    status: 'REJECTED', gsi1pk: null, gsi1sk: null, reviewNote: input.note,
  }, now());
  await publish({ type: 'mentor.rejected', source: 'marketplace', detail: { userId: targetUserId } });
  return rejected;
}

// ── Public search ───────────────────────────────────────────────────────────────
export async function search(q: Record<string, string | undefined>) {
  let list = (await mentorsRepo.listByGsi(gsiPkFor('APPROVED'))).map(publicView);
  const like = (s: string | undefined, needle: string) => (s ?? '').toLowerCase().includes(needle);
  if (q.college) list = list.filter((m) => like(m.college, q.college!.toLowerCase()));
  if (q.branch) list = list.filter((m) => like(m.branch, q.branch!.toLowerCase()));
  if (q.topic) { const t = q.topic.toLowerCase(); list = list.filter((m) => m.topics.some((x) => x.toLowerCase().includes(t))); }
  if (q.maxPrice) { const cap = Number(q.maxPrice); if (!Number.isNaN(cap)) list = list.filter((m) => m.priceINR <= cap); }

  const sort = q.sort ?? 'rating';
  if (sort === 'price') list.sort((a, b) => a.priceINR - b.priceINR);
  else list.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);

  return { count: list.length, mentors: list };
}
