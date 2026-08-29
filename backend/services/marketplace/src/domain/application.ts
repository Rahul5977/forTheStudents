// The MENTOR side of the application: apply (DRAFT), verify the college email (OTP), upload
// documents (presign → browser PUT → confirm), and SUBMIT (DRAFT → PENDING_REVIEW, only when
// complete). Admin-side verification lives in verification.ts.
import {
  NotFoundError, ValidationError, ForbiddenError, ConflictError, ServiceUnavailableError,
  publish, newId, assertTransition, freshFieldVerifications,
  REQUIRED_VERIFICATION_FIELDS, OPTIONAL_VERIFICATION_FIELDS, type Principal, type VerificationField,
} from '@sc/shared';
import { getEnv } from '@sc/config';
import { mentorsRepo, type MentorProfile, type DocumentRef } from '../repo/mentors.repo';
import { getDocumentStore } from '../repo/documents.store';
import { getOtpMailer } from '../repo/email';
import { DOC_MAX_BYTES, type Apply, type VerifyEmail, type Presign, type DocType } from '../types';

const OTP_TTL_SEC = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SENDS_PER_HOUR_USER = 5;
const OTP_SENDS_PER_HOUR_EMAIL = 5;
const PRESIGNS_PER_HOUR = 20; // an application needs 2 uploads; retries are cheap, floods are not
const ESSAY_MIN = 100;
const ESSAY_MAX = 800;
export const CONSENT_VERSION = '2026-08';

const now = () => new Date().toISOString();
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const isProd = () => getEnv().STAGE === 'prod';

export async function loadOwn(userId: string): Promise<MentorProfile> {
  const m = await mentorsRepo.get(userId);
  if (!m) throw NotFoundError('No mentor application yet — POST /mentor/apply first.');
  return m;
}

/** What the mentor themself may read: everything except the OTP; documents as metadata only (no URLs). */
export function ownerView(m: MentorProfile) {
  const { documents, ...rest } = m;
  const docs: Record<string, Omit<DocumentRef, 'key'> & { docType: string }> = {};
  for (const [t, d] of Object.entries(documents ?? {})) if (d) docs[t] = { docType: t, contentType: d.contentType, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt };
  return { ...rest, documents: docs, completeness: validateSubmission(m) };
}

// ── Apply (DRAFT) ───────────────────────────────────────────────────────────────
export async function apply(p: Principal, input: Apply): Promise<MentorProfile> {
  const existing = await mentorsRepo.get(p.userId);
  if (existing?.status === 'APPROVED' || existing?.status === 'SUSPENDED') throw ForbiddenError('You are already an approved mentor — edit your profile instead.');
  if (existing?.status === 'REJECTED') throw ForbiddenError('This application was declined and cannot be re-opened.');
  if (existing && existing.status !== 'DRAFT') throw ConflictError(`Your application is ${existing.status} — it can be edited only while it is a draft.`);

  const consent = input.consent ? { acceptedAt: now(), version: input.consent.version } : undefined;
  const fields = {
    name: input.name, college: input.college, branch: input.branch, year: input.year,
    gradYear: input.gradYear, rollNumber: input.rollNumber, phone: input.phone,
    bio: input.bio, topics: input.topics, priceINR: input.priceINR, languages: input.languages,
    jeeRank: input.jeeRank, jeeYear: input.jeeYear, essays: input.essays,
    ...(consent ? { consent } : {}),
  };
  if (!existing) {
    const profile: MentorProfile = {
      userId: p.userId, ...fields, status: 'DRAFT', emailVerified: false, idVerified: false,
      ratingAvg: 0, ratingCount: 0, createdAt: now(), updatedAt: now(),
    };
    await mentorsRepo.create(profile);
    await publish({ type: 'mentor.applied', source: 'marketplace', detail: { userId: p.userId } });
    return profile;
  }
  return mentorsRepo.update(p.userId, fields, now());
}

// ── Email verification (.ac.in OTP, bound to the signed-in user) ────────────────
export async function verifyEmail(p: Principal, input: VerifyEmail) {
  await loadOwn(p.userId);
  const email = input.email.trim().toLowerCase();
  if (!/\.ac\.in$/i.test(email)) throw ValidationError('Use your college .ac.in email to verify.');

  if (!input.code) {
    // Rate limits: per signed-in user AND per target email (a stranger's address can't be spammed).
    const [byUser, byEmail] = await Promise.all([
      mentorsRepo.bumpSendCount(`user:${p.userId}`, 3600),
      mentorsRepo.bumpSendCount(email, 3600),
    ]);
    if (byUser > OTP_SENDS_PER_HOUR_USER || byEmail > OTP_SENDS_PER_HOUR_EMAIL) {
      throw ValidationError('Too many codes requested — try again in an hour.');
    }
    const code = genOtp();
    await mentorsRepo.putOtp(p.userId, email, code, Math.floor(Date.now() / 1000) + OTP_TTL_SEC);
    const sent = await getOtpMailer().send(email, code);
    if (isProd() && !sent) throw ServiceUnavailableError('Email delivery is not configured — please try again later.');
    return { sent: true, ...(isProd() ? {} : { devOtp: code }) };
  }

  const otp = await mentorsRepo.getOtp(p.userId);
  if (!otp || otp.email !== email) throw ValidationError('Request an OTP for this email first.');
  if (otp.ttl < Math.floor(Date.now() / 1000)) throw ValidationError('OTP expired — request a new one.');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw ValidationError('Too many wrong attempts — request a new code.');
  if (otp.code !== input.code) {
    await mentorsRepo.bumpOtpAttempts(p.userId);
    throw ValidationError('Incorrect OTP.');
  }
  const updated = await mentorsRepo.update(p.userId, { emailVerified: true, email }, now());
  return { verified: true, mentor: ownerView(updated) };
}

// ── Documents: presign → (browser PUT) → confirm ───────────────────────────────
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
export const docKeyPrefix = (userId: string) => `mentors/${userId}/`;

export async function presignDocument(p: Principal, input: Presign) {
  const m = await loadOwn(p.userId);
  if (m.status !== 'DRAFT') throw ConflictError(`Documents can only be added while the application is a draft (it is ${m.status}).`);
  if ((await mentorsRepo.bumpSendCount(`presign:${p.userId}`, 3600)) > PRESIGNS_PER_HOUR) throw ValidationError('Too many upload attempts — try again in an hour.');
  const key = `${docKeyPrefix(p.userId)}${input.docType}/${newId()}.${EXT[input.contentType]}`;
  const signed = await getDocumentStore().presignPut(key, input.contentType);
  return { key, docType: input.docType, ...signed, maxBytes: DOC_MAX_BYTES };
}

export async function confirmDocument(p: Principal, key: string) {
  const m = await loadOwn(p.userId);
  if (m.status !== 'DRAFT') throw ConflictError(`Documents can only be added while the application is a draft (it is ${m.status}).`);
  // The key must be one WE minted for THIS mentor — never another mentor's prefix.
  if (!key.startsWith(docKeyPrefix(p.userId))) throw ForbiddenError('That document does not belong to your application.');
  const docType = key.slice(docKeyPrefix(p.userId).length).split('/')[0] as DocType;
  if (docType !== 'id_card' && docType !== 'supporting') throw ValidationError('Unknown document type.');
  const store = getDocumentStore();
  const meta = await store.head(key);
  if (!meta) throw ValidationError('Upload not found — upload the file to the presigned URL first.');
  if (meta.sizeBytes > DOC_MAX_BYTES) {
    await store.remove(key).catch(() => {});
    throw ValidationError(`File too large (max ${DOC_MAX_BYTES / 1024 / 1024} MB).`);
  }
  const ref: DocumentRef = { key, contentType: meta.contentType ?? 'application/octet-stream', sizeBytes: meta.sizeBytes, uploadedAt: now() };
  const documents = { ...(m.documents ?? {}), [docType]: ref };
  const updated = await mentorsRepo.update(p.userId, { documents, idVerified: !!documents.id_card }, now());
  return { ok: true, docType, mentor: ownerView(updated) };
}

// ── Submit (DRAFT → PENDING_REVIEW) ─────────────────────────────────────────────
export interface MissingItem { field: string; message: string }

/** PURE completeness check. Returns EVERY missing item — never just the first. */
export function validateSubmission(m: MentorProfile): { complete: boolean; missing: MissingItem[] } {
  const missing: MissingItem[] = [];
  const need = (ok: unknown, field: string, message: string) => { if (!ok) missing.push({ field, message }); };
  need(m.name?.trim().length >= 2, 'name', 'Add your full name.');
  need(m.college?.trim().length >= 2, 'college', 'Add your college.');
  need(m.branch?.trim().length >= 2, 'branch', 'Add your branch.');
  need(m.year >= 1, 'year', 'Add your current year.');
  need(m.gradYear, 'gradYear', 'Add your graduation year.');
  need(m.rollNumber?.trim(), 'rollNumber', 'Add your college roll number.');
  need(m.emailVerified && m.email, 'collegeEmail', 'Verify your college (.ac.in) email.');
  need(m.phone?.trim(), 'phone', 'Add your phone number.');
  need(m.documents?.id_card, 'doc_id_card', 'Upload your college ID card.');
  need((m.bio ?? '').trim().length >= 20, 'bio', 'Write a short bio (at least 20 characters).');
  need((m.topics ?? []).length >= 1, 'topics', 'Pick at least one topic you can help with.');
  need(m.priceINR >= 50, 'priceINR', 'Set your session price.');
  need(m.jeeRank, 'jeeRank', 'Add your own JEE rank.');
  need(m.jeeYear, 'jeeYear', 'Add the year you took JEE.');
  const essay = (s: string | undefined) => { const n = (s ?? '').trim().length; return n >= ESSAY_MIN && n <= ESSAY_MAX; };
  need(essay(m.essays?.why), 'essayWhy', `Answer "Why do you want to become a mentor?" (${ESSAY_MIN}–${ESSAY_MAX} characters).`);
  need(essay(m.essays?.how), 'essayHow', `Answer "How will you help a student during JoSAA counselling?" (${ESSAY_MIN}–${ESSAY_MAX} characters).`);
  need(m.consent?.acceptedAt, 'consent', 'Accept the mentor code of conduct.');
  return { complete: missing.length === 0, missing };
}

export async function submit(p: Principal) {
  const m = await loadOwn(p.userId);
  assertTransition(m.status, 'PENDING_REVIEW');
  const { complete, missing } = validateSubmission(m);
  if (!complete) throw ValidationError('Your application is not complete yet.', { missing });
  // Fresh per-field verification state: every present item starts UNVERIFIED.
  const present: VerificationField[] = [...REQUIRED_VERIFICATION_FIELDS];
  for (const f of OPTIONAL_VERIFICATION_FIELDS) {
    if (f === 'essayOther' && m.essays?.other?.trim()) present.push(f);
    if (f === 'doc_supporting' && m.documents?.supporting) present.push(f);
  }
  const submitted = await mentorsRepo.transition(p.userId, ['DRAFT'], 'PENDING_REVIEW', p.userId, {
    patch: { submittedAt: now(), fields: freshFieldVerifications(present), rejection: null, docsVerifiedAt: null },
  });
  await publish({ type: 'mentor.verification.submitted', source: 'marketplace', detail: { userId: p.userId, submittedAt: submitted.submittedAt } });
  return ownerView(submitted);
}
