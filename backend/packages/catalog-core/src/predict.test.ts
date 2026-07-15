import { describe, it, expect } from 'vitest';
import { parseCutoffs } from './parse';
import { predict, normalizeInput } from './predict';
import { deriveType } from './parse';

// Fixture shaped like josaa24.csv (header + rows), incl. HS/OS/AI quotas.
const CSV = [
  'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank',
  '"Indian Institute of Technology Indore","Computer Science and Engineering (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,900,1567',
  '"National Institute of Technology Karnataka, Surathkal","Computer Science and Engineering (4 Years, Bachelor of Technology)",OS,OPEN,Gender-Neutral,800,2134',
  '"National Institute of Technology Karnataka, Surathkal","Computer Science and Engineering (4 Years, Bachelor of Technology)",HS,OPEN,Gender-Neutral,200,900',
  '"Indian Institute of Information Technology, Allahabad","Information Technology (4 Years, Bachelor of Technology)",AI,OPEN,Gender-Neutral,3000,4987',
].join('\n');

const cutoffs = parseCutoffs(CSV);

describe('deriveType (IIIT before IIT)', () => {
  it('classifies IIT / IIIT / NIT correctly', () => {
    expect(deriveType('Indian Institute of Technology Bombay')).toBe('IIT');
    expect(deriveType('Indian Institute of Information Technology, Allahabad')).toBe('IIIT');
    expect(deriveType('National Institute of Technology Calicut')).toBe('NIT');
  });
});

describe('parse + enrich', () => {
  it('enriches with short/city/state/nirf and derives type', () => {
    const indore = cutoffs.find((c) => c.institute.includes('Indore'))!;
    expect(indore.type).toBe('IIT');
    expect(indore.short).toBe('IIT Indore');
    expect(indore.state).toBe('Madhya Pradesh');
    expect(indore.nirf).toBe(16);
    const nitk = cutoffs.find((c) => c.institute.includes('Surathkal') && c.quota === 'OS')!;
    expect(nitk.short).toBe('NIT Surathkal');
    expect(nitk.state).toBe('Karnataka');
  });
});

describe('Home-State quota', () => {
  it('uses the easier HS closing rank when home state matches', () => {
    const away = predict(cutoffs, normalizeInput({ mainRank: '1000', category: 'Open', home: 'Delhi' }));
    const nitkAway = away.results.find((r) => r.college === 'NIT Surathkal');
    // Away applicant → OS cutoff (close 2134) → main rank 1000 is Safe, not home quota.
    expect(nitkAway?.close).toBe(2134);
    expect(nitkAway?.homeQuota).toBe(false);

    const home = predict(cutoffs, normalizeInput({ mainRank: '1000', category: 'Open', home: 'Karnataka' }));
    const nitkHome = home.results.find((r) => r.college === 'NIT Surathkal');
    // Home applicant → HS cutoff (close 900) is used + flagged.
    expect(nitkHome?.close).toBe(900);
    expect(nitkHome?.homeQuota).toBe(true);
  });
});
