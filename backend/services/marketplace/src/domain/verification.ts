// The ADMIN side: the queue, the full application, per-field manual verification,
// DOCS_VERIFIED, the Calendar/Meet interview, and the post-interview decision. Every action is
// scope-gated (packet 2), audited, emits an event, and moves through the shared state machine.
import {
  NotFoundError, ValidationError, ConflictError, requireScope, publish, auditRepo, createLogger,
  assertTransition, canTransition, normalizeMentorStatus, verificationProgress, isVerificationField,
  getCalendarProvider, QUEUE_STATUSES, MENTOR_STATUSES,
  type Principal, type MentorStatus, type FieldVerifications, type VerificationField,
} from '@sc/shared';
import { mentorsRepo, type MentorProfile, type InterviewInfo } from '../repo/mentors.repo';
import { getDocumentStore } from '../repo/documents.store';
import type { Review, FieldVerify, Interview, Reschedule, Queue, DocType } from '../types';

const logger = createLogger('marketplace.verification');
const now = () => new Date().toISOString();
const DEFAULT_INTERVIEW_MIN = 15;

async function load(userId: string): Promise<MentorProfile> {
  const m = await mentorsRepo.get(userId);
  if (!m) throw NotFoundError('Mentor not found.');
  return m;
}

/** Admin projection: the FULL application. Documents = metadata only; URLs come from documentUrl() (audited). */
export function adminView(m: MentorProfile) {
  const docs: Record<string, { docType: string; contentType: string; sizeBytes: number; uploadedAt: string }> = {};
  for (const [t, d] of Object.entries(m.documents ?? {})) if (d) docs[t] = { docType: t, contentType: d.contentType, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt };
  const waitingSince = m.statusChangedAt ?? m.submittedAt ?? m.updatedAt;
  return { ...m, documents: docs, progress: verificationProgress(m.fields), waitingSince, legalActions: legalActionsFor(m) };
}

/** Which admin actions are legal RIGHT NOW (the console disables the rest). */
export function legalActionsFor(m: MentorProfile) {
  const progress = verificationProgress(m.fields);
  return {
    verifyFields: (QUEUE_STATUSES as readonly string[]).includes(m.status) && m.status !== 'INTERVIEW_SCHEDULED',
    verifyDocs: m.status === 'PENDING_REVIEW' && progress.complete,
    scheduleInterview: m.status === 'DOCS_VERIFIED',
    rescheduleInterview: m.status === 'INTERVIEW_SCHEDULED',
    cancelInterview: m.status === 'INTERVIEW_SCHEDULED',
    approve: canTransition(m.status, 'APPROVED'),
    reject: canTransition(m.status, 'REJECTED'),
    softReject: canTransition(m.status, 'DRAFT') && m.status !== 'DRAFT',
  };
}

// ── Queue / directory ───────────────────────────────────────────────────────────
export async function queue(p: Principal, q: Queue) {
  requireScope(p, 'mentors.manage');
  const status = normalizeMentorStatus(q.status ?? 'PENDING_REVIEW');
  if (!status) throw ValidationError(`Unknown status. One of: ${MENTOR_STATUSES.join(', ')}`);
  const page = await mentorsRepo.queryByStatus(status, { limit: q.limit, cursor: q.cursor, q: q.q });
  return { status, items: page.items.map(adminView), nextCursor: page.nextCursor ?? null };
}

export async function counts(p: Principal) {
  requireScope(p, 'mentors.manage');
  const entries = await Promise.all(MENTOR_STATUSES.map(async (s) => [s, await mentorsRepo.countByStatus(s)] as const));
  return Object.fromEntries(entries) as Record<MentorStatus, number>;
}

/** LEGACY (one release): the old flat queue for the deployed console — all queue statuses, oldest-first. */
export async function listPending(p: Principal) {
  requireScope(p, 'mentors.manage');
  const pages = await Promise.all(QUEUE_STATUSES.map((s) => mentorsRepo.queryByStatus(s, { limit: 100 })));
  return pages.flatMap((pg) => pg.items).map((m) => ({
    userId: m.userId, name: m.name, college: m.college, branch: m.branch, year: m.year, email: m.email,
    status: m.status, interviewAt: m.interview?.interviewAt ?? m.interviewAt, interviewLink: m.interview?.meetUrl ?? m.interviewLink,
    createdAt: m.createdAt, submittedAt: m.submittedAt, progress: verificationProgress(m.fields),
  }));
}

export async function getApplication(p: Principal, userId: string) {
  requireScope(p, 'mentors.manage');
  return adminView(await load(userId));
}

/** A short-TTL presigned GET, minted per request and AUDITED (who looked at whose ID, when). */
export async function documentUrl(p: Principal, userId: string, docType: DocType) {
  requireScope(p, 'mentors.manage');
  const m = await load(userId);
  const doc = m.documents?.[docType];
  if (!doc) throw NotFoundError('No such document on this application.');
  const signed = await getDocumentStore().presignGet(doc.key);
  await auditRepo.append(p.userId, 'mentor.document.access', { target: userId, detail: { docType } });
  return { docType, contentType: doc.contentType, sizeBytes: doc.sizeBytes, ...signed };
}

// ── Per-field verification ──────────────────────────────────────────────────────
export async function setField(p: Principal, userId: string, field: string, input: FieldVerify) {
  requireScope(p, 'mentors.manage');
  if (!isVerificationField(field)) throw ValidationError(`Unknown field "${field}".`);
  const m = await load(userId);
  if (m.status === 'INTERVIEW_SCHEDULED') throw ConflictError('Cancel the interview before changing verification.');
  if (!(QUEUE_STATUSES as readonly string[]).includes(m.status)) throw ConflictError(`A ${m.status} application is not under verification.`);
  const fields: FieldVerifications = { ...(m.fields ?? {}), [field]: { status: input.status, by: p.userId, at: now(), ...(input.note ? { note: input.note } : {}) } };
  // Un-verifying/flagging AFTER docs were verified drops the application back to PENDING_REVIEW.
  const regress = m.status === 'DOCS_VERIFIED' && input.status !== 'VERIFIED' && (verificationProgress(fields).remaining as string[]).includes(field);
  const updated = regress
    ? await mentorsRepo.transition(userId, ['DOCS_VERIFIED'], 'PENDING_REVIEW', p.userId, { patch: { fields, docsVerifiedAt: null }, note: `${field} ${input.status.toLowerCase()}` })
    : await mentorsRepo.update(userId, { fields }, now());
  await auditRepo.append(p.userId, 'mentor.field.verify', { target: userId, detail: { field, status: input.status, note: input.note } });
  if (regress) await publish({ type: 'mentor.docs.unverified', source: 'marketplace', detail: { userId, field } });
  return adminView(updated);
}

export async function verifyDocs(p: Principal, userId: string) {
  requireScope(p, 'mentors.manage');
  const m = await load(userId);
  assertTransition(m.status, 'DOCS_VERIFIED');
  const progress = verificationProgress(m.fields);
  if (!progress.complete) throw ConflictError(`Not every required item is verified yet: ${progress.remaining.join(', ')}.`);
  const updated = await mentorsRepo.transition(userId, ['PENDING_REVIEW'], 'DOCS_VERIFIED', p.userId, { patch: { docsVerifiedAt: now() } });
  await auditRepo.append(p.userId, 'mentor.docs.verified', { target: userId });
  await publish({ type: 'mentor.docs.verified', source: 'marketplace', detail: { userId } });
  return adminView(updated);
}

// ── Interview (Calendar + Meet) ─────────────────────────────────────────────────
const interviewRequestId = (userId: string, interviewAt: string) => `iv-${userId}-${interviewAt}`.replace(/[^a-zA-Z0-9-]/g, '');

export async function scheduleInterview(p: Principal, userId: string, input: Interview) {
  requireScope(p, 'mentors.interview');
  const m = await load(userId);
  const durationMin = input.durationMin ?? DEFAULT_INTERVIEW_MIN;

  // Idempotent: the same (mentor, interviewAt) is the same interview — never a second event.
  if (m.status === 'INTERVIEW_SCHEDULED' && m.interview?.interviewAt === input.interviewAt) return adminView(m);
  assertTransition(m.status, 'INTERVIEW_SCHEDULED'); // DOCS_VERIFIED only

  let info: InterviewInfo;
  if (input.interviewLink) {
    // LEGACY shape: honour the supplied link, skip Calendar. Dropped next release.
    info = { eventId: `ext_${Date.now()}`, meetUrl: input.interviewLink, provider: 'external', interviewAt: input.interviewAt, durationMin, scheduledBy: p.userId, scheduledAt: now(), note: input.note };
  } else {
    const cal = await getCalendarProvider();
    const attendees = [m.email, p.email].filter((e): e is string => !!e);
    const ev = await cal.create({
      summary: `Mentor interview — ${m.name} (${m.college})`,
      description: `Student-Counselor mentor screening interview.${input.note ? `\n\n${input.note}` : ''}`,
      startsAt: input.interviewAt, durationMin, attendees, requestId: interviewRequestId(userId, input.interviewAt),
    });
    info = { eventId: ev.eventId, meetUrl: ev.meetUrl, provider: ev.provider, interviewAt: input.interviewAt, durationMin, scheduledBy: p.userId, scheduledAt: now(), note: input.note };
  }

  let updated: MentorProfile;
  try {
    updated = await mentorsRepo.transition(userId, ['DOCS_VERIFIED'], 'INTERVIEW_SCHEDULED', p.userId, {
      patch: { interview: info, interviewAt: info.interviewAt, interviewLink: info.meetUrl, reviewNote: input.note },
    });
  } catch (err) {
    // Never orphan a Calendar event: the DB write failed → delete what we just created.
    if (info.provider !== 'external') await (await getCalendarProvider()).cancel(info.eventId).catch((e) => logger.error('compensating cancel failed', e as Error));
    throw err;
  }
  await auditRepo.append(p.userId, 'mentor.interview.schedule', { target: userId, detail: { interviewAt: info.interviewAt, provider: info.provider } });
  await publish({ type: 'mentor.interview.scheduled', source: 'marketplace', detail: { userId, interviewAt: info.interviewAt, interviewLink: info.meetUrl, durationMin } });
  return adminView(updated);
}

export async function rescheduleInterview(p: Principal, userId: string, input: Reschedule) {
  requireScope(p, 'mentors.interview');
  const m = await load(userId);
  if (m.status !== 'INTERVIEW_SCHEDULED' || !m.interview) throw ConflictError('No interview is scheduled for this application.');
  const durationMin = input.durationMin ?? m.interview.durationMin;
  let meetUrl = m.interview.meetUrl;
  if (m.interview.provider !== 'external') {
    const ev = await (await getCalendarProvider()).update(m.interview.eventId, { startsAt: input.interviewAt, durationMin });
    meetUrl = ev.meetUrl || meetUrl;
  }
  const interview: InterviewInfo = { ...m.interview, interviewAt: input.interviewAt, durationMin, meetUrl, note: input.note ?? m.interview.note };
  const updated = await mentorsRepo.update(userId, { interview, interviewAt: interview.interviewAt, interviewLink: meetUrl }, now());
  await auditRepo.append(p.userId, 'mentor.interview.reschedule', { target: userId, detail: { interviewAt: input.interviewAt } });
  await publish({ type: 'mentor.interview.rescheduled', source: 'marketplace', detail: { userId, interviewAt: input.interviewAt, interviewLink: meetUrl, durationMin } });
  return adminView(updated);
}

export async function cancelInterview(p: Principal, userId: string) {
  requireScope(p, 'mentors.interview');
  const m = await load(userId);
  assertTransition(m.status, 'DOCS_VERIFIED');
  if (m.status !== 'INTERVIEW_SCHEDULED') throw ConflictError('No interview is scheduled for this application.');
  if (m.interview && m.interview.provider !== 'external') await (await getCalendarProvider()).cancel(m.interview.eventId);
  const updated = await mentorsRepo.transition(userId, ['INTERVIEW_SCHEDULED'], 'DOCS_VERIFIED', p.userId, {
    patch: { interview: null, interviewAt: null, interviewLink: null },
  });
  await auditRepo.append(p.userId, 'mentor.interview.cancel', { target: userId });
  await publish({ type: 'mentor.interview.cancelled', source: 'marketplace', detail: { userId } });
  return adminView(updated);
}

// ── Decision ────────────────────────────────────────────────────────────────────
export async function review(p: Principal, userId: string, input: Review) {
  requireScope(p, 'mentors.manage');
  const m = await load(userId);
  const note = input.note?.trim();

  if (input.decision === 'approve') {
    assertTransition(m.status, 'APPROVED'); // INTERVIEW_SCHEDULED only
    const approved = await mentorsRepo.transition(userId, ['INTERVIEW_SCHEDULED'], 'APPROVED', p.userId, { patch: { reviewNote: note ?? null, rejection: null }, note });
    await auditRepo.append(p.userId, 'mentor.review.approve', { target: userId, detail: { note } });
    await publish({ type: 'mentor.approved', source: 'marketplace', detail: { userId } });
    return adminView(approved);
  }

  const kind = input.kind ?? 'hard';
  const to: MentorStatus = kind === 'soft' ? 'DRAFT' : 'REJECTED';
  assertTransition(m.status, to);
  const from = m.status;
  // A scheduled interview is cancelled with the decision (never orphan a Calendar event).
  if (m.interview && m.interview.provider !== 'external') await (await getCalendarProvider()).cancel(m.interview.eventId).catch((e) => logger.warn('calendar cancel on reject failed', { err: String(e) }));
  const rejection = { kind, reason: note!, by: p.userId, at: now() };
  const updated = await mentorsRepo.transition(userId, [from], to, p.userId, {
    patch: { rejection, reviewNote: note, interview: null, interviewAt: null, interviewLink: null },
    note: `${kind} reject: ${note}`,
  });
  if (kind === 'hard') {
    // Lifecycle rule (data-stack) expires objects tagged status=rejected.
    const store = getDocumentStore();
    for (const d of Object.values(updated.documents ?? {})) if (d) await store.tag(d.key, { status: 'rejected' }).catch((e) => logger.warn('tagging rejected doc failed', { err: String(e) }));
  }
  await auditRepo.append(p.userId, 'mentor.review.reject', { target: userId, detail: { kind, note } });
  await publish({ type: kind === 'soft' ? 'mentor.revision_requested' : 'mentor.rejected', source: 'marketplace', detail: { userId, kind, reason: note } });
  return adminView(updated);
}

/** exported for tests */
export const _internal = { interviewRequestId };
export type { VerificationField };
