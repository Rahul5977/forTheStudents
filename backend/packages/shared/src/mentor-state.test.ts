// Exhaustive check of the mentor state machine (Phase 11 packet 4).
import { describe, expect, it } from 'vitest';
import {
  MENTOR_STATUSES, MENTOR_TRANSITIONS, assertTransition, canTransition, normalizeMentorStatus,
  verificationProgress, freshFieldVerifications, REQUIRED_VERIFICATION_FIELDS, type MentorStatus,
} from './mentor-state';

const LEGAL: Array<[MentorStatus, MentorStatus]> = [
  ['DRAFT', 'PENDING_REVIEW'],
  ['PENDING_REVIEW', 'DOCS_VERIFIED'], ['PENDING_REVIEW', 'REJECTED'], ['PENDING_REVIEW', 'DRAFT'],
  ['DOCS_VERIFIED', 'INTERVIEW_SCHEDULED'], ['DOCS_VERIFIED', 'REJECTED'], ['DOCS_VERIFIED', 'DRAFT'], ['DOCS_VERIFIED', 'PENDING_REVIEW'],
  ['INTERVIEW_SCHEDULED', 'APPROVED'], ['INTERVIEW_SCHEDULED', 'REJECTED'], ['INTERVIEW_SCHEDULED', 'DRAFT'], ['INTERVIEW_SCHEDULED', 'DOCS_VERIFIED'],
  ['APPROVED', 'SUSPENDED'],
  ['SUSPENDED', 'APPROVED'],
];

describe('mentor state machine', () => {
  it('every legal edge is allowed and every other pair is refused (exhaustive)', () => {
    const legal = new Set(LEGAL.map(([a, b]) => `${a}>${b}`));
    for (const from of MENTOR_STATUSES) {
      for (const to of MENTOR_STATUSES) {
        const expected = legal.has(`${from}>${to}`);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
        if (expected) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow(/Cannot move/);
      }
    }
    // The table and the list agree on the total number of edges.
    expect(Object.values(MENTOR_TRANSITIONS).reduce((n, v) => n + v.length, 0)).toBe(LEGAL.length);
  });

  it('hard rejection is terminal; approval only after the interview; suspension only from APPROVED', () => {
    expect(MENTOR_TRANSITIONS.REJECTED).toEqual([]);
    expect(canTransition('PENDING_REVIEW', 'APPROVED')).toBe(false);
    expect(canTransition('DOCS_VERIFIED', 'APPROVED')).toBe(false);
    expect(canTransition('PENDING_REVIEW', 'SUSPENDED')).toBe(false);
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
  });

  it('maps the legacy INTERVIEW status forward and rejects unknown strings', () => {
    expect(normalizeMentorStatus('INTERVIEW')).toBe('INTERVIEW_SCHEDULED');
    expect(normalizeMentorStatus('APPROVED')).toBe('APPROVED');
    expect(normalizeMentorStatus('BANANA')).toBeNull();
    expect(normalizeMentorStatus(undefined)).toBeNull();
  });

  it('verificationProgress gates DOCS_VERIFIED on every REQUIRED field being VERIFIED', () => {
    const fields = freshFieldVerifications([...REQUIRED_VERIFICATION_FIELDS]);
    let p = verificationProgress(fields);
    expect(p.complete).toBe(false);
    expect(p.verified).toBe(0);
    expect(p.required).toBe(REQUIRED_VERIFICATION_FIELDS.length);
    for (const k of REQUIRED_VERIFICATION_FIELDS) fields[k] = { status: 'VERIFIED', by: 'a', at: 'now' };
    p = verificationProgress(fields);
    expect(p.complete).toBe(true);
    expect(p.remaining).toEqual([]);
    fields.doc_id_card = { status: 'FLAGGED', note: 'blurry' };
    p = verificationProgress(fields);
    expect(p.complete).toBe(false);
    expect(p.flagged).toBe(1);
    expect(p.remaining).toEqual(['doc_id_card']);
    // Optional fields never block.
    expect(verificationProgress({ ...fields, doc_id_card: { status: 'VERIFIED' }, doc_supporting: { status: 'FLAGGED' } }).complete).toBe(true);
  });
});
