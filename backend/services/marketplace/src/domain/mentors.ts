// Mentor profile + availability edits, and the PUBLIC surfaces (search, slots).
// The application lifecycle lives in application.ts (mentor side) and verification.ts (admin).
import { NotFoundError, ValidationError } from '@sc/shared';
import { mentorsRepo, type MentorProfile } from '../repo/mentors.repo';
import type { UpdateProfile, Availability } from '../types';

const now = () => new Date().toISOString();

/**
 * PUBLIC projection — the ONLY shape a student/anonymous browser ever sees. Never add
 * essays, documents, phone, email, roll number, reviewer notes, OTPs or verification state.
 */
export function publicView(m: MentorProfile) {
  return {
    userId: m.userId, name: m.name, college: m.college, branch: m.branch, year: m.year,
    bio: m.bio, topics: m.topics ?? [], priceINR: m.priceINR, languages: m.languages ?? [],
    ratingAvg: m.ratingAvg, ratingCount: m.ratingCount,
  };
}

async function loadOwn(userId: string): Promise<MentorProfile> {
  const m = await mentorsRepo.get(userId);
  if (!m) throw NotFoundError('No mentor application yet — POST /mentor/apply first.');
  return m;
}

// ── Profile + availability (self) ───────────────────────────────────────────────
/**
 * Editable any time: bio, topics, languages, name (pre-approval). LOCKED after approval:
 * college/branch/year/roll number (not in the DTO at all) and price + name (rejected here).
 */
export async function updateProfile(userId: string, input: UpdateProfile) {
  const m = await loadOwn(userId);
  const locked = m.status === 'APPROVED' || m.status === 'SUSPENDED';
  if (locked && input.priceINR !== undefined && input.priceINR !== m.priceINR) throw ValidationError('Price is locked after approval — ask support to change it.');
  if (locked && input.name !== undefined && input.name !== m.name) throw ValidationError('Your name is locked after approval — ask support to change it.');
  const patch = { name: input.name, bio: input.bio, topics: input.topics, priceINR: input.priceINR, languages: input.languages };
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

// ── Public search ───────────────────────────────────────────────────────────────
export async function search(q: Record<string, string | undefined>) {
  let list = (await mentorsRepo.listApproved()).map(publicView);
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

// ── Public: a mentor's OPEN, future slots (drives the student's booking screen) ──
export async function publicSlots(mentorId: string) {
  const m = await mentorsRepo.get(mentorId);
  if (!m || m.status !== 'APPROVED') throw NotFoundError('Mentor not available.');
  const { slots } = await mentorsRepo.getAvailability(mentorId);
  const nowMs = Date.now();
  const open = slots
    .filter((s) => s.open && new Date(s.startsAt).getTime() > nowMs)
    .map((s) => ({ id: s.id, startsAt: s.startsAt, durationMin: s.durationMin }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { mentorId, priceINR: m.priceINR, slots: open };
}
