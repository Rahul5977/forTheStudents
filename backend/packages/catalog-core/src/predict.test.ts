import { describe, it, expect } from 'vitest';
import { parseAll } from './parse';
import { predict, normalizeInput } from './predict';

// Tiny fixtures shaped exactly like the real files.
const ORCR = [
  'IIT Bombay,Computer Science (4 Years Bachelor ofTechnology),OPEN,Gender-Neutral,1,67',
  'IIT Indore,Computer Science (4 Years Bachelor ofTechnology),OPEN,Gender-Neutral,1000,1567',
].join('\n');
const JOSAA = [
  'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank',
  '"NIT Trichy","Computer Science (4 Years, Bachelor of Technology)",OS,OPEN,Gender-Neutral,500,1198.0',
  '"NIT Trichy","Computer Science (4 Years, Bachelor of Technology)",HS,OPEN,Gender-Neutral,50,300.0',
].join('\n');

const cutoffs = parseAll(ORCR, JOSAA);

describe('parse (real JoSAA CSV shape)', () => {
  it('parses both files, derives type + short branch + exam', () => {
    expect(cutoffs).toHaveLength(4);
    const bombay = cutoffs.find((c) => c.institute === 'IIT Bombay')!;
    expect(bombay.type).toBe('IIT');
    expect(bombay.exam).toBe('adv');
    expect(bombay.branch).toBe('Computer Science');
    expect(bombay.quota).toBe('AI');
    const trichy = cutoffs.find((c) => c.institute === 'NIT Trichy')!;
    expect(trichy.type).toBe('NIT');
    expect(trichy.exam).toBe('main');
  });
});

describe('predict (real cutoffs)', () => {
  const input = normalizeInput({ advRank: '850', mainRank: '4200', category: 'Open' });

  it('buckets by real closing rank and drops HS-quota rows', () => {
    const r = predict(cutoffs, input);
    // IIT Bombay (close 67) is way out of reach (ratio>1.6 → dropped);
    // IIT Indore (close 1567) is Safe for adv rank 850; NIT Trichy OS (close 1198)
    // vs main rank 4200 is out of reach (dropped); HS row never counts.
    expect(r.results.every((c) => c.quota !== 'HS')).toBe(true);
    expect(r.resultCount).toBe(1);
    expect(r.results[0]!.institute).toBe('IIT Indore');
    expect(r.results[0]!.bucket).toBe('safe');
  });
});
