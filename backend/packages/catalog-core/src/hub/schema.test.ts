// Phase 12: the College Data Hub contract. Guards the rules the collectors must obey —
// sources on every fact, nulls explicit (never missing), aggregator hosts never official.
import { describe, it, expect } from 'vitest';
import { Source, Placements, Profile, Fees, Faqs, HUB_SECTIONS, HUB_SECTION_NAMES, isHubSection, HubBundle, CollegeHub } from './schema';
import { loadHubBundle, hubFor, hubSection, rosterFor, hubVersion } from './index';

const src = (over: Partial<Source> = {}): Source => ({
  url: 'https://www.iitb.ac.in/placements',
  title: 'Placement statistics 2024-25',
  publisher: 'IIT Bombay',
  accessedOn: '2026-09-13',
  asOf: '2024-25',
  confidence: 'official',
  ...over,
});

describe('Source', () => {
  it('accepts a well-formed official source', () => {
    expect(Source.safeParse(src()).success).toBe(true);
  });
  it('rejects non-http URLs, bad dates and unknown confidence', () => {
    expect(Source.safeParse(src({ url: 'ftp://x.y/z' })).success).toBe(false);
    expect(Source.safeParse(src({ accessedOn: '13/09/2026' })).success).toBe(false);
    expect(Source.safeParse({ ...src(), confidence: 'guess' }).success).toBe(false);
  });
  it('rejects unknown keys (strict)', () => {
    expect(Source.safeParse({ ...src(), note: 'x' }).success).toBe(false);
  });
});

describe('records carry sources; facts are nullable, never missing', () => {
  const year = {
    year: '2024-25', avgLpa: 23.5, medianLpa: 17.9, highestLpa: 210, pctPlaced: 82.1, offers: 1475, ppos: 258,
    higherStudiesPct: null, topRecruiters: [{ name: 'Microsoft', sector: 'software' }], branchWise: null,
    sources: [src()], asOf: '2024-25',
  };
  it('parses a complete placement year', () => {
    expect(Placements.safeParse({ instituteId: 'iit-bombay', years: [year] }).success).toBe(true);
  });
  it('fails when sources are empty or absent', () => {
    expect(Placements.safeParse({ instituteId: 'iit-bombay', years: [{ ...year, sources: [] }] }).success).toBe(false);
    const { sources: _s, ...noSources } = year;
    expect(Placements.safeParse({ instituteId: 'iit-bombay', years: [noSources] }).success).toBe(false);
  });
  it('fails when a fact key is missing (must be explicit null)', () => {
    const { medianLpa: _m, ...missing } = year;
    expect(Placements.safeParse({ instituteId: 'iit-bombay', years: [missing] }).success).toBe(false);
    expect(Placements.safeParse({ instituteId: 'iit-bombay', years: [{ ...year, medianLpa: null }] }).success).toBe(true);
  });
  it('bounds prose lengths and enforces the slug shape', () => {
    const profile = {
      instituteId: 'iit-bombay', officialName: 'Indian Institute of Technology Bombay', short: 'IIT Bombay', type: 'IIT',
      established: 1958, website: 'https://www.iitb.ac.in', about: 'x'.repeat(601), location: null, admissionRoutes: [],
      sources: [src()], asOf: null,
    };
    expect(Profile.safeParse(profile).success).toBe(false);
    expect(Profile.safeParse({ ...profile, about: null }).success).toBe(true);
    expect(Profile.safeParse({ ...profile, about: null, instituteId: 'IIT Bombay' }).success).toBe(false);
  });
  it('requires 5–15 FAQs and INR fees', () => {
    const faq = { q: 'Is there a branch change after first year?', a: null, sources: [src()], asOf: null };
    expect(Faqs.safeParse({ instituteId: 'iit-bombay', items: [faq, faq, faq, faq] }).success).toBe(false);
    expect(Faqs.safeParse({ instituteId: 'iit-bombay', items: Array(5).fill(faq) }).success).toBe(true);
    const fee = { year: '2025-26', program: null, tuition: 100000, hostel: null, mess: null, other: null, totalYear: null, currency: 'USD', sources: [src()], asOf: null };
    expect(Fees.safeParse({ instituteId: 'iit-bombay', years: [fee], scholarships: [] }).success).toBe(false);
  });
});

describe('registry', () => {
  it('exposes the 11 sections and a type guard', () => {
    expect(HUB_SECTION_NAMES).toHaveLength(11);
    expect(Object.keys(HUB_SECTIONS)).toContain('seat-matrix');
    expect(isHubSection('placements')).toBe(true);
    expect(isHubSection('nope')).toBe(false);
    expect(isHubSection('__proto__')).toBe(false);
  });
});

describe('bundle loader', () => {
  const profile: CollegeHub['profile'] = {
    instituteId: 'iit-bombay', officialName: 'Indian Institute of Technology Bombay', short: 'IIT Bombay', type: 'IIT',
    established: 1958, website: 'https://www.iitb.ac.in', about: null, location: null, admissionRoutes: [],
    sources: [src()], asOf: null,
  };
  const hub: CollegeHub = {
    profile, academics: null, placements: null, 'seat-matrix': null, fees: null, 'campus-life': null,
    hostels: null, alumni: null, social: null, rankings: null, faqs: null,
  };
  const roster = [{
    id: 'iit-bombay', type: 'IIT', officialName: profile.officialName, short: 'IIT Bombay', city: 'Mumbai', state: 'Maharashtra',
    website: 'https://www.iitb.ac.in', admissionRoute: 'josaa', inCutoffs: true, josaaType: 'IIT',
    josaaNames: [profile.officialName], nirfId: null, pilot: true,
  }];
  it('validates and serves by id and section', () => {
    expect(HubBundle.safeParse({ version: 'hub-test', builtAt: '2026-09-13', roster, institutes: { 'iit-bombay': hub } }).success).toBe(true);
    loadHubBundle({ version: 'hub-test', builtAt: '2026-09-13', roster, institutes: { 'iit-bombay': hub } });
    expect(hubVersion()).toBe('hub-test');
    expect(hubFor('iit-bombay')?.profile.established).toBe(1958);
    expect(hubFor('nit-goa')).toBeNull();
    expect(hubSection('iit-bombay', 'profile')?.short).toBe('IIT Bombay');
    expect(hubSection('iit-bombay', 'fees')).toBeNull();
    expect(rosterFor('iit-bombay')?.city).toBe('Mumbai');
  });
  it('rejects a bundle whose institute record is malformed', () => {
    expect(() => loadHubBundle({ version: 'v', builtAt: 'x', roster, institutes: { 'iit-bombay': { ...hub, profile: { ...profile, type: 'GFTI' } } } })).toThrow();
  });
});
