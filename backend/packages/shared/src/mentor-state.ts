// Phase 11 packet 4 — the mentor verification state machine, in ONE pure place so the
// marketplace service (apply/submit/verify/interview/review) and the admin service
// (suspend/reinstate) can never disagree. No I/O here; repos enforce the same guard
// atomically with a DynamoDB ConditionExpression.
//
//   DRAFT ──submit──▶ PENDING_REVIEW ──all fields VERIFIED──▶ DOCS_VERIFIED
//     ▲                    │  ▲                                   │
//     │ soft reject        │  │ a field FLAGGED after docs-verified│ schedule
//     │ (notes visible,    ▼  │                                   ▼
//     │  re-apply)      REJECTED (hard, terminal)     INTERVIEW_SCHEDULED ──decision──▶ APPROVED ⇄ SUSPENDED
//     └───────────────────────────────────────────────────┘                              (moderation)
import { ConflictError } from './errors';

export type MentorStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'DOCS_VERIFIED'
  | 'INTERVIEW_SCHEDULED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export const MENTOR_STATUSES: readonly MentorStatus[] = [
  'DRAFT', 'PENDING_REVIEW', 'DOCS_VERIFIED', 'INTERVIEW_SCHEDULED', 'APPROVED', 'REJECTED', 'SUSPENDED',
];

/** Statuses an admin works through (the verification queue). */
export const QUEUE_STATUSES: readonly MentorStatus[] = ['PENDING_REVIEW', 'DOCS_VERIFIED', 'INTERVIEW_SCHEDULED'];

/**
 * Pre-Phase-11 rows may carry `INTERVIEW` (the old "interview scheduled" state). It is mapped
 * forward on READ so stored rows are never orphaned; nothing ever writes it again.
 */
const LEGACY: Record<string, MentorStatus> = { INTERVIEW: 'INTERVIEW_SCHEDULED' };

/** Map a stored/legacy status string to the current union; `null` if unknown. */
export function normalizeMentorStatus(raw: unknown): MentorStatus | null {
  if (typeof raw !== 'string') return null;
  if ((MENTOR_STATUSES as readonly string[]).includes(raw)) return raw as MentorStatus;
  return LEGACY[raw] ?? null;
}

/** The legal edges. Anything not listed is illegal → 409. */
export const MENTOR_TRANSITIONS: Readonly<Record<MentorStatus, readonly MentorStatus[]>> = {
  DRAFT: ['PENDING_REVIEW'],
  PENDING_REVIEW: ['DOCS_VERIFIED', 'REJECTED', 'DRAFT'],
  DOCS_VERIFIED: ['INTERVIEW_SCHEDULED', 'REJECTED', 'DRAFT', 'PENDING_REVIEW'],
  INTERVIEW_SCHEDULED: ['APPROVED', 'REJECTED', 'DRAFT', 'DOCS_VERIFIED'],
  APPROVED: ['SUSPENDED'],
  SUSPENDED: ['APPROVED'],
  REJECTED: [], // hard reject is terminal — a soft reject goes straight to DRAFT instead
};

export function canTransition(from: MentorStatus, to: MentorStatus): boolean {
  return MENTOR_TRANSITIONS[from].includes(to);
}

/** @throws ConflictError (409) when the edge is illegal. */
export function assertTransition(from: MentorStatus, to: MentorStatus): void {
  if (!canTransition(from, to)) throw ConflictError(`Cannot move a ${from} application to ${to}.`);
}

// ── Per-field verification ("admin verifies manually", granular) ─────────────────
export type FieldVerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'FLAGGED';

export interface FieldVerification {
  status: FieldVerificationStatus;
  /** admin userId who last touched it */
  by?: string;
  at?: string;
  note?: string;
}

/** Every submitted detail/document an admin must tick. Keys are URL-safe (used as a path param). */
export const REQUIRED_VERIFICATION_FIELDS = [
  'name', 'college', 'branch', 'year', 'gradYear', 'rollNumber', 'collegeEmail', 'phone',
  'jeeRank', 'essayWhy', 'essayHow', 'doc_id_card',
] as const;
export const OPTIONAL_VERIFICATION_FIELDS = ['essayOther', 'doc_supporting'] as const;
export const VERIFICATION_FIELDS = [...REQUIRED_VERIFICATION_FIELDS, ...OPTIONAL_VERIFICATION_FIELDS] as const;
export type VerificationField = (typeof VERIFICATION_FIELDS)[number];

export function isVerificationField(s: string): s is VerificationField {
  return (VERIFICATION_FIELDS as readonly string[]).includes(s);
}

export type FieldVerifications = Partial<Record<VerificationField, FieldVerification>>;

/** Fresh per-field state for a just-submitted application: everything UNVERIFIED. */
export function freshFieldVerifications(present: readonly VerificationField[]): FieldVerifications {
  const out: FieldVerifications = {};
  for (const f of present) out[f] = { status: 'UNVERIFIED' };
  return out;
}

/** `{ required, verified, flagged, remaining[] }` for the "N of M verified" counter + the gate. */
export function verificationProgress(fields: FieldVerifications | undefined) {
  const f = fields ?? {};
  const remaining: VerificationField[] = [];
  let verified = 0;
  let flagged = 0;
  for (const k of REQUIRED_VERIFICATION_FIELDS) {
    const st = f[k]?.status ?? 'UNVERIFIED';
    if (st === 'VERIFIED') verified++;
    else { remaining.push(k); if (st === 'FLAGGED') flagged++; }
  }
  return { required: REQUIRED_VERIFICATION_FIELDS.length, verified, flagged, remaining, complete: remaining.length === 0 };
}
