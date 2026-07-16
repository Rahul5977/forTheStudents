import { describe, it, expect } from 'vitest';
import { parseCutoffs, deriveType } from './parse';
import { predict, analyze, normalizeInput } from './predict';
import type { PredictInput } from './predict';

// ── Fixtures shaped like josaa24.csv (header + rows). Institute names contain
// commas, so they MUST be quoted. Columns:
//   Institute, Academic Program Name, Quota, Seat Type, Gender, Opening, Closing
const HEADER = 'Institute,Academic Program Name,Quota,Seat Type,Gender,Opening Rank,Closing Rank';
const CSE = 'Computer Science and Engineering (4 Years, Bachelor of Technology)';
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');
const row = (inst: string, prog: string, quota: string, seat: string, gender: string, open: number, close: number) =>
  `"${inst}","${prog}",${quota},${seat},${gender},${open},${close}`;

// A convenience to build a fully-defaulted input then override.
const input = (o: Partial<PredictInput> = {}): PredictInput => ({
  advRank: 9_999_999, mainRank: 9_999_999, category: 'Open', home: '', gender: 'Gender-Neutral',
  types: ['IIT', 'NIT', 'IIIT', 'GFTI'], q: '', sort: 'best', limit: 300, applyWindow: true, ...o,
});

describe('deriveType (IIIT before IIT)', () => {
  it('classifies IIT / IIIT / NIT correctly', () => {
    expect(deriveType('Indian Institute of Technology Bombay')).toBe('IIT');
    expect(deriveType('Indian Institute of Information Technology, Allahabad')).toBe('IIIT');
    expect(deriveType('National Institute of Technology Calicut')).toBe('NIT');
  });
});

describe('parse + enrich', () => {
  const cutoffs = parseCutoffs(csv(
    row('Indian Institute of Technology Indore', CSE, 'AI', 'OPEN', 'Gender-Neutral', 900, 1567),
    row('National Institute of Technology Karnataka, Surathkal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 800, 2134),
  ));
  it('enriches with short/city/state/nirf and derives type', () => {
    const indore = cutoffs.find((c) => c.institute.includes('Indore'))!;
    expect(indore.type).toBe('IIT');
    expect(indore.short).toBe('IIT Indore');
    expect(indore.state).toBe('Madhya Pradesh');
    expect(indore.nirf).toBe(16);
    const nitk = cutoffs.find((c) => c.institute.includes('Surathkal'))!;
    expect(nitk.short).toBe('NIT Surathkal');
    expect(nitk.state).toBe('Karnataka');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE REPORTED BUG: rank 6000, default order must put the BEST reachable college
// (lowest closing rank the student can realistically target) FIRST — and a
// closing-9000 SAFE backup must NOT be first.
// ─────────────────────────────────────────────────────────────────────────────
describe('BUG FIX: default order = best reachable first (closing ASC)', () => {
  // All NITs, home-neutral (use OS everywhere). Student main rank = 6000.
  // Closing ranks span from a slight reach (5500) up to an easy backup (9000).
  const cutoffs = parseCutoffs(csv(
    row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3000, 5500), // reach-ish (6000/5500=1.09 target)
    row('National Institute of Technology, Rourkela', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3200, 6100), // ~target
    row('National Institute of Technology, Silchar', CSE, 'OS', 'OPEN', 'Gender-Neutral', 4000, 7200),  // safe-ish
    row('National Institute of Technology, Raipur', CSE, 'OS', 'OPEN', 'Gender-Neutral', 5000, 9000),   // SAFE backup
  ));
  const res = predict(cutoffs, input({ mainRank: 6000 }));

  it('TOP result is the best (lowest) reachable closing rank, not the safest', () => {
    expect(res.results[0]!.close).toBe(5500);
    expect(res.results[0]!.college).toBe('NIT Warangal');
  });

  it('the closing-9000 SAFE college ranks BELOW the closer/more-competitive ones', () => {
    const closes = res.results.map((r) => r.close);
    expect(closes).toEqual([5500, 6100, 7200, 9000]); // strictly ascending
    const safe9000 = res.results.find((r) => r.close === 9000)!;
    expect(safe9000.bucket).toBe('safe');
    expect(res.results.indexOf(safe9000)).toBe(res.results.length - 1); // last, not first
  });

  it('old chance-sort still floats the safest (closing 9000) to the top', () => {
    const old = predict(cutoffs, input({ mainRank: 6000, sort: 'chance' }));
    expect(old.results[0]!.close).toBe(9000);
    // 'safest' is an alias for the old chance behavior.
    const safest = predict(cutoffs, input({ mainRank: 6000, sort: 'safest' }));
    expect(safest.results[0]!.close).toBe(9000);
  });
});

describe('ordering tie-breaks (closing tie → NIRF asc, nulls last)', () => {
  // Two colleges with the SAME closing rank: NIRF 21 (Warangal) beats null (Agartala).
  const cutoffs = parseCutoffs(csv(
    row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3000, 6000), // NIRF 21
    row('National Institute of Technology Agartala', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3100, 6000),  // NIRF null
  ));
  it('better NIRF comes first, unranked sinks', () => {
    const res = predict(cutoffs, input({ mainRank: 5000 }));
    expect(res.results.map((r) => r.college)).toEqual(['NIT Warangal', 'NIT Agartala']);
    expect(res.results[0]!.nirf).toBe(21);
    expect(res.results[1]!.nirf).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HOME-STATE quota for NITs.
// ─────────────────────────────────────────────────────────────────────────────
describe('Home-State quota', () => {
  const cutoffs = parseCutoffs(csv(
    row('National Institute of Technology Karnataka, Surathkal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 800, 2134),
    row('National Institute of Technology Karnataka, Surathkal', CSE, 'HS', 'OPEN', 'Gender-Neutral', 200, 900),
  ));

  it('away student → OS closing rank, homeQuota=false', () => {
    const away = predict(cutoffs, input({ mainRank: 1000, home: 'Delhi' }));
    const nitk = away.results.find((r) => r.college === 'NIT Surathkal')!;
    expect(nitk.close).toBe(2134);
    expect(nitk.homeQuota).toBe(false);
  });

  it('home student → easier HS closing rank, homeQuota=true', () => {
    const home = predict(cutoffs, input({ mainRank: 1000, home: 'Karnataka' }));
    const nitk = home.results.find((r) => r.college === 'NIT Surathkal')!;
    expect(nitk.close).toBe(900);
    expect(nitk.homeQuota).toBe(true);
  });

  it('state match is case-insensitive / whitespace-tolerant', () => {
    for (const home of ['karnataka', '  KARNATAKA ', 'karnataka ', 'KarnataKa']) {
      const r = predict(cutoffs, input({ mainRank: 1000, home }));
      const nitk = r.results.find((x) => x.college === 'NIT Surathkal')!;
      expect(nitk.close).toBe(900);
      expect(nitk.homeQuota).toBe(true);
    }
  });

  it('no home state → OS only, no crash', () => {
    const r = predict(cutoffs, input({ mainRank: 1000, home: '' }));
    const nitk = r.results.find((x) => x.college === 'NIT Surathkal')!;
    expect(nitk.close).toBe(2134);
    expect(nitk.homeQuota).toBe(false);
  });

  it('IITs are unaffected (AI quota, never home)', () => {
    const iit = parseCutoffs(csv(
      row('Indian Institute of Technology Indore', CSE, 'AI', 'OPEN', 'Gender-Neutral', 900, 1567),
    ));
    const r = predict(iit, input({ advRank: 1000, home: 'Madhya Pradesh' }));
    const indore = r.results.find((x) => x.college === 'IIT Indore')!;
    expect(indore.quota).toBe('AI');
    expect(indore.homeQuota).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Category + gender pool filtering.
// ─────────────────────────────────────────────────────────────────────────────
describe('category + gender pool filter', () => {
  const cutoffs = parseCutoffs(csv(
    row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 1000, 2000),
    row('National Institute of Technology, Warangal', CSE, 'OS', 'OBC-NCL', 'Gender-Neutral', 1500, 3000),
    row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Female-only (including Supernumerary)', 1200, 2500),
  ));

  it('OPEN + Gender-Neutral selects only the matching seat pool', () => {
    const r = predict(cutoffs, input({ mainRank: 1800, category: 'Open', gender: 'Gender-Neutral' }));
    expect(r.results).toHaveLength(1);
    expect(r.results[0]!.seatType).toBe('OPEN');
    expect(r.results[0]!.close).toBe(2000);
  });

  it('OBC-NCL selects the reserved closing rank', () => {
    const r = predict(cutoffs, input({ mainRank: 1800, category: 'OBC-NCL', gender: 'Gender-Neutral' }));
    expect(r.results).toHaveLength(1);
    expect(r.results[0]!.close).toBe(3000);
  });

  it('Female-only pool is separate from Gender-Neutral', () => {
    const r = predict(cutoffs, input({ mainRank: 1800, category: 'Open', gender: 'Female-only (including Supernumerary)' }));
    expect(r.results).toHaveLength(1);
    expect(r.results[0]!.close).toBe(2500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exam mapping: IIT uses advRank, everything else uses mainRank.
// ─────────────────────────────────────────────────────────────────────────────
describe('exam mapping (IIT→adv, NIT→main)', () => {
  const cutoffs = parseCutoffs(csv(
    row('Indian Institute of Technology Indore', CSE, 'AI', 'OPEN', 'Gender-Neutral', 900, 2000),   // uses advRank
    row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 1000, 2000), // uses mainRank
  ));
  it('each institute is judged against the correct exam rank', () => {
    // advRank strong (safe at IIT), mainRank weak (reach at NIT), same closing rank.
    const r = predict(cutoffs, input({ advRank: 1000, mainRank: 3100 }));
    const iit = r.results.find((x) => x.type === 'IIT')!;
    const nit = r.results.find((x) => x.type === 'NIT')!;
    expect(iit.examLabel).toBe('JEE Adv');
    expect(iit.bucket).toBe('safe');   // 1000/2000 = 0.50
    expect(nit.examLabel).toBe('JEE Main');
    expect(nit.bucket).toBe('reach');  // 3100/2000 = 1.55
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Realistic window: hopeless reach AND absurd over-safe are both excluded.
// ─────────────────────────────────────────────────────────────────────────────
describe('realistic window', () => {
  // Student main rank = 5000. close 4800 → target (kept). close 2500 → target/safe kept.
  // close 800  → over-safe (5000/800 = 6.25 → ratio 0.16 < 0.2) → EXCLUDED.
  // close 2900 → hopeless reach for a rank of... use 5000/2900=1.72 > 1.6 → EXCLUDED.
  const cutoffs = parseCutoffs(csv(
    row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3000, 4800),  // ratio 1.04 kept
    row('National Institute of Technology, Rourkela', CSE, 'OS', 'OPEN', 'Gender-Neutral', 1500, 7000),  // ratio 0.71 kept (safe backup)
    row('National Institute of Technology, Silchar', CSE, 'OS', 'OPEN', 'Gender-Neutral', 200, 800),     // ratio 6.25 → over-safe, drop
    row('National Institute of Technology, Raipur', CSE, 'OS', 'OPEN', 'Gender-Neutral', 1000, 2900),    // ratio 1.72 → hopeless, drop
  ));
  const r = predict(cutoffs, input({ mainRank: 5000 }));

  it('excludes the absurd over-safe (closing 800) and hopeless reach (closing 2900)', () => {
    const colleges = r.results.map((x) => x.college);
    expect(colleges).toContain('NIT Warangal');
    expect(colleges).toContain('NIT Rourkela');
    expect(colleges).not.toContain('NIT Silchar'); // over-safe
    expect(colleges).not.toContain('NIT Raipur');  // hopeless reach
    expect(r.results).toHaveLength(2);
  });

  it('genuine safe backups are still kept (not over-filtered)', () => {
    const rourkela = r.results.find((x) => x.college === 'NIT Rourkela')!;
    expect(rourkela.bucket).toBe('safe'); // 5000/7000 = 0.71
  });

  it('bucket counts reflect the surviving window', () => {
    expect(r.resultCount).toBe(2);
    expect(r.safeCount + r.targetCount + r.reachCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sort options.
// ─────────────────────────────────────────────────────────────────────────────
describe('sort options', () => {
  const cutoffs = parseCutoffs(csv(
    row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3000, 5500),
    row('National Institute of Technology, Rourkela', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3200, 6100),
    row('National Institute of Technology, Raipur', CSE, 'OS', 'OPEN', 'Gender-Neutral', 5000, 9000),
  ));

  it("'closing' sorts by closing rank ascending", () => {
    const r = predict(cutoffs, input({ mainRank: 6000, sort: 'closing' }));
    expect(r.results.map((x) => x.close)).toEqual([5500, 6100, 9000]);
  });

  it("'location' sorts by display name", () => {
    const r = predict(cutoffs, input({ mainRank: 6000, sort: 'location' }));
    const names = r.results.map((x) => x.college);
    expect([...names]).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain('NIT Warangal');
    expect(names).toContain('NIT Rourkela');
  });

  it("'chance' sorts by chance % descending (safest first)", () => {
    const r = predict(cutoffs, input({ mainRank: 6000, sort: 'chance' }));
    const pcts = r.results.map((x) => x.pct);
    expect([...pcts]).toEqual([...pcts].sort((a, b) => b - a));
    expect(r.results[0]!.close).toBe(9000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases.
// ─────────────────────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('empty cutoffs → empty result, no crash', () => {
    const r = predict([], input({ mainRank: 6000 }));
    expect(r.results).toEqual([]);
    expect(r.resultCount).toBe(0);
    expect(r.truncated).toBe(false);
  });

  it('missing ranks (default huge) → everything is a hopeless reach → empty', () => {
    const cutoffs = parseCutoffs(csv(
      row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3000, 5500),
    ));
    const r = predict(cutoffs, input()); // no ranks supplied
    expect(r.results).toEqual([]);
  });

  it('all-safe list still returns everything within window', () => {
    const cutoffs = parseCutoffs(csv(
      row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3000, 5000),
      row('National Institute of Technology, Rourkela', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3200, 5200),
    ));
    const r = predict(cutoffs, input({ mainRank: 3000 })); // 0.60 / 0.58 → both safe, both ≥0.2
    expect(r.results).toHaveLength(2);
    expect(r.safeCount).toBe(2);
  });

  it('all-reach list returns the ones inside the reach window', () => {
    const cutoffs = parseCutoffs(csv(
      row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 1000, 5000),
      row('National Institute of Technology, Rourkela', CSE, 'OS', 'OPEN', 'Gender-Neutral', 1200, 5200),
    ));
    const r = predict(cutoffs, input({ mainRank: 7000 })); // 1.40 / 1.35 → both reach, both ≤1.6
    expect(r.results).toHaveLength(2);
    expect(r.reachCount).toBe(2);
  });

  it('truncates to limit and flags truncated', () => {
    const cutoffs = parseCutoffs(csv(
      row('National Institute of Technology, Warangal', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3000, 5000),
      row('National Institute of Technology, Rourkela', CSE, 'OS', 'OPEN', 'Gender-Neutral', 3200, 5200),
    ));
    const r = predict(cutoffs, input({ mainRank: 3000, limit: 1 }));
    expect(r.results).toHaveLength(1);
    expect(r.resultCount).toBe(2);
    expect(r.truncated).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeInput + analyze back-compat.
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeInput', () => {
  it('defaults to the new best/closing-ascending sort', () => {
    expect(normalizeInput({}).sort).toBe('best');
  });
  it('respects an explicit sort and parses ranks/types', () => {
    const n = normalizeInput({ sort: 'chance', advRank: '850', types: 'IIT,NIT' });
    expect(n.sort).toBe('chance');
    expect(n.advRank).toBe(850);
    expect(n.types).toEqual(['IIT', 'NIT']);
  });
});

describe('analyze', () => {
  const cutoffs = parseCutoffs(csv(
    row('National Institute of Technology Karnataka, Surathkal', CSE, 'HS', 'OPEN', 'Gender-Neutral', 200, 900),
    row('Indian Institute of Technology Indore', CSE, 'AI', 'OPEN', 'Gender-Neutral', 900, 1567),
  ));
  it('returns a decorated college + single-year chart, consistent with predict', () => {
    const hs = cutoffs.find((c) => c.quota === 'HS')!;
    const res = analyze(cutoffs, hs.id, input({ mainRank: 1000, home: 'karnataka' }))!;
    expect(res.college.homeQuota).toBe(true); // robust home match
    expect(res.college.close).toBe(900);
    expect(res.chart.years).toEqual(['2024']);
    expect(res.chart.vals).toEqual([900]);
    expect(res.chart.rank).toBe(1000);
  });
  it('uses advRank for IITs', () => {
    const iit = cutoffs.find((c) => c.type === 'IIT')!;
    const res = analyze(cutoffs, iit.id, input({ advRank: 800, mainRank: 999999 }))!;
    expect(res.chart.rank).toBe(800);
    expect(res.college.bucket).toBe('safe');
  });
  it('returns null for a missing id', () => {
    expect(analyze(cutoffs, 99999, input())).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forecast layer: when a seat carries a precomputed 2026 band, the headline chance
// and bucket come from the calibrated forecast, not the ratio heuristic; the band +
// history flow through to the result and the analyze() chart.
// ─────────────────────────────────────────────────────────────────────────────
describe('forecast-backed prediction', () => {
  const base = parseCutoffs(csv(
    row('Indian Institute of Technology Indore', CSE, 'AI', 'OPEN', 'Gender-Neutral', 900, 1567),
  ))[0]!;
  const withForecast = {
    ...base,
    forecast: { targetYear: 2026, predicted: 1600, low: 1200, high: 2100, sigmaRank: 400, confidence: 'high' as const, limitedHistory: false, nPoints: 4 },
    history: [{ year: 2020, close: 1400 }, { year: 2024, close: 1567 }],
  };

  it('uses the forecast chance (Φ) for a rank near the predicted closing rank', () => {
    // advRank 1600 == predicted → ≈50% → Target, basis=forecast.
    const res = predict([withForecast], input({ advRank: 1600 }));
    const p = res.results[0]!;
    expect(p.chanceBasis).toBe('forecast');
    expect(p.pct).toBeGreaterThanOrEqual(45);
    expect(p.pct).toBeLessThanOrEqual(55);
    expect(p.label).toBe('Target');
    expect(p.forecast?.predicted).toBe(1600);
  });

  it('a much better rank → Safe via the forecast', () => {
    const res = predict([withForecast], input({ advRank: 500 }));
    expect(res.results[0]!.label).toBe('Safe');
    expect(res.results[0]!.pct).toBeGreaterThan(80);
  });

  it('falls back to the ratio basis when no band is present', () => {
    const res = predict([base], input({ advRank: 500 }));
    expect(res.results[0]!.chanceBasis).toBe('ratio');
  });

  it('applyWindow=false keeps a hopeless-reach branch that the predictor would hide', () => {
    // rank 999999 vs close 1567 → ratio huge → dropped by the window, kept without it.
    const hidden = predict([base], input({ advRank: 999999, applyWindow: true }));
    expect(hidden.results).toHaveLength(0);
    const shown = predict([base], input({ advRank: 999999, applyWindow: false }));
    expect(shown.results).toHaveLength(1);
  });

  it('analyze() chart carries the multi-year history + forecast point', () => {
    const res = analyze([withForecast], withForecast.id, input({ advRank: 1000 }))!;
    expect(res.chart.years).toEqual(['2020', '2024']);
    expect(res.chart.vals).toEqual([1400, 1567]);
    expect(res.chart.forecast).toEqual({ year: 2026, predicted: 1600, low: 1200, high: 2100 });
  });
});
