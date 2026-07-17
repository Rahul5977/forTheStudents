// Phase 3: the college-content layer — curated FACTS keyed by the canonical instituteId,
// with all sourced/licensed fields degrading gracefully to null/[] (never fabricated).
import { describe, it, expect } from 'vitest';
import { contentFor } from './content';
import { instituteId } from './enrich';

describe('contentFor', () => {
  it('returns null for an uncurated institute (profile degrades to cutoffs-only)', () => {
    expect(contentFor('nit-goa')).toBeNull();
    expect(contentFor('some-unknown-gfti')).toBeNull();
    expect(contentFor('')).toBeNull();
  });

  it('serves curated FACTS verbatim for a curated institute', () => {
    const c = contentFor('iit-bombay')!;
    expect(c).not.toBeNull();
    expect(c.instituteId).toBe('iit-bombay');
    expect(c.established).toBe(1958);
    expect(c.website).toBe('https://www.iitb.ac.in');
    expect(c.nirfEng).toBe(3);
  });

  it('is keyed by the canonical slug that enrich.instituteId() derives', () => {
    // The content table must join on the SAME id the cutoffs carry.
    const id = instituteId('Indian Institute of Technology Bombay', 'IIT');
    expect(id).toBe('iit-bombay');
    expect(contentFor(id)).not.toBeNull();
    expect(contentFor(instituteId('National Institute of Technology, Tiruchirappalli', 'NIT'))?.established).toBe(1964);
  });

  it('leaves every sourced/licensed field null/[] — no fabricated numbers', () => {
    const c = contentFor('iit-madras')!;
    // FACTS are populated…
    expect(c.established).toBe(1959);
    expect(c.nirfEng).toBe(1);
    // …but owner-sourced data is not invented.
    expect(c.about).toBeNull();
    expect(c.nirfOverall).toBeNull();
    expect(c.accreditation).toBeNull();
    expect(c.fees).toBeNull();
    expect(c.seatMatrix).toBeNull();
    expect(c.placements).toBeNull();
    expect(c.photos).toEqual([]);
  });

  it('covers all IITs + curated NITs + IIITs students target', () => {
    // Spot-check the coverage bands (all IITs incl. the newest, a top NIT, a major IIIT).
    for (const id of ['iit-bombay', 'iit-goa', 'iit-jammu', 'nit-trichy', 'nit-warangal', 'iiit-allahabad']) {
      expect(contentFor(id), id).not.toBeNull();
    }
  });

  it('every curated website is a canonical https official/edu URL (guards typos)', () => {
    // Deterministic invariant over the whole FACTS table — a mistyped slug/url fails here.
    for (const id of ['iit-madras', 'nit-trichy', 'iiitdm-jabalpur', 'mnnit-allahabad']) {
      const url = contentFor(id)!.website!;
      expect(url).toMatch(/^https:\/\//);
      expect(url).toMatch(/\.(ac\.in|edu)$/);
    }
  });

  it('nirfEng mirrors the NIRF-2024 engineering ranks curated in enrich.ts', () => {
    expect(contentFor('iit-madras')!.nirfEng).toBe(1); // enrich: 1
    expect(contentFor('nit-trichy')!.nirfEng).toBe(9); // enrich: 9
    expect(contentFor('iit-dharwad')!.nirfEng).toBeNull(); // enrich: unranked
  });
});
