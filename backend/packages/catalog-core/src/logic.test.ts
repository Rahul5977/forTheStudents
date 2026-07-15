import { describe, it, expect } from 'vitest';
import { OFFERINGS } from './data';
import { predict, normalizeInput, chance } from './logic';

const baseInput = normalizeInput({ advRank: '850', mainRank: '4200', category: 'Open', home: 'Maharashtra' });

describe('predictor logic (must match the frontend)', () => {
  it('rank 850 Open / Maharashtra → 12 Safe / 3 Target / 3 Reach (18 total)', () => {
    const r = predict(OFFERINGS, baseInput);
    expect(r.resultCount).toBe(18);
    expect(r.safeCount).toBe(12);
    expect(r.targetCount).toBe(3);
    expect(r.reachCount).toBe(3);
  });

  it('sorts by chance descending by default', () => {
    const r = predict(OFFERINGS, baseInput);
    for (let i = 1; i < r.results.length; i++) {
      expect(r.results[i - 1]!.pct).toBeGreaterThanOrEqual(r.results[i]!.pct);
    }
  });

  it('home-state quota loosens NIT closing rank for the home state', () => {
    const vnit = OFFERINGS.find((o) => o.college === 'VNIT Nagpur')!; // Maharashtra NIT
    const home = chance(vnit, baseInput);
    const away = chance(vnit, { ...baseInput, home: 'Delhi' });
    expect(home.effClose).toBeGreaterThan(away.effClose); // home => easier
  });

  it('branch filter narrows results', () => {
    const cseOnly = predict(OFFERINGS, { ...baseInput, branch: 'Electronics' });
    expect(cseOnly.results.every((c) => c.branch === 'Electronics')).toBe(true);
  });
});
