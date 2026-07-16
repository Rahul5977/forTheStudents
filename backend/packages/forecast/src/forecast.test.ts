import { describe, it, expect } from 'vitest';
import type { SeriesPoint } from '@sc/catalog-core';
import { poolSize } from './candidates';
import { forecastSeries, admitChance } from './forecast';

const pts = (pairs: [number, number][]): SeriesPoint[] =>
  pairs.map(([year, close]) => ({ year, round: 6, open: 1, close }));

describe('candidate pool', () => {
  it('looks up known years and extrapolates 2026 above the last known', () => {
    expect(poolSize('adv', 2024)).toBe(180200);
    expect(poolSize('main', 2024)).toBe(1221624);
    expect(poolSize('main', 2026)).toBeGreaterThan(poolSize('main', 2025));
  });
});

describe('forecastSeries — shape & invariants', () => {
  it('returns null only for an empty series', () => {
    expect(forecastSeries([], { exam: 'adv' })).toBeNull();
    expect(forecastSeries(pts([[2024, 68]]), { exam: 'adv' })).not.toBeNull();
  });

  it('band is ordered low < predicted < high, all ≥ 1', () => {
    const f = forecastSeries(pts([[2018, 59], [2019, 63], [2022, 66], [2023, 68]]), { exam: 'adv', seatType: 'OPEN' })!;
    expect(f.low).toBeGreaterThanOrEqual(1);
    expect(f.low).toBeLessThan(f.predicted);
    expect(f.predicted).toBeLessThan(f.high);
    expect(f.targetYear).toBe(2026);
  });

  it('single point → flat method, limited history, wide band', () => {
    const f = forecastSeries(pts([[2024, 5000]]), { exam: 'main', seatType: 'OPEN' })!;
    expect(f.method).toBe('flat');
    expect(f.limitedHistory).toBe(true);
    expect(f.nPoints).toBe(1);
  });

  it('two points → two-point method', () => {
    const f = forecastSeries(pts([[2022, 4000], [2023, 4200]]), { exam: 'main', seatType: 'OPEN' })!;
    expect(f.method).toBe('two-point');
    expect(f.confidence).toBe('low'); // limited history
  });

  it('≥3 points → ensemble method', () => {
    const f = forecastSeries(pts([[2016, 5000], [2017, 5200], [2018, 5400], [2019, 5600]]), { exam: 'main', seatType: 'OPEN' })!;
    expect(f.method).toBe('ensemble');
  });
});

describe('forecastSeries — trend direction', () => {
  // Same last value & target & exam ⇒ pool cancels in the comparison; only the trend differs.
  const target = { exam: 'main' as const, targetYear: 2026, seatType: 'OPEN' };
  const rising = forecastSeries(pts([[2016, 2500], [2017, 3000], [2018, 3500], [2019, 4000]]), target)!;
  const flat = forecastSeries(pts([[2016, 4000], [2017, 4000], [2018, 4000], [2019, 4000]]), target)!;
  const falling = forecastSeries(pts([[2016, 5500], [2017, 5000], [2018, 4500], [2019, 4000]]), target)!;

  it('a worsening (rising-rank) series forecasts ≥ a flat one', () => {
    expect(rising.predicted).toBeGreaterThanOrEqual(flat.predicted);
    expect(rising.slopePerYear).toBeGreaterThan(0);
  });
  it('an improving (falling-rank) series forecasts ≤ a flat one', () => {
    expect(falling.predicted).toBeLessThanOrEqual(flat.predicted);
    expect(falling.slopePerYear).toBeLessThan(0);
  });
  it('a flat series forecasts near its last value (pool-adjusted)', () => {
    expect(flat.predicted).toBeGreaterThan(3000);
    expect(flat.predicted).toBeLessThan(6000);
  });
});

describe('admitChance — calibration & monotonicity', () => {
  // Recent contiguous years → a realistic 2-year extrapolation to 2026 (tight band).
  const f = forecastSeries(pts([[2021, 5000], [2022, 5200], [2023, 5400], [2024, 5600]]), { exam: 'main', seatType: 'OPEN' })!;

  it('a rank at the predicted closing rank ≈ 50%', () => {
    const c = admitChance(f, f.predicted);
    expect(c.pct).toBeGreaterThanOrEqual(45);
    expect(c.pct).toBeLessThanOrEqual(55);
    expect(c.label).toBe('Target');
  });

  it('a much better rank → Safe/high %, a much worse rank → Reach/low %', () => {
    const good = admitChance(f, Math.round(f.predicted * 0.25));
    const bad = admitChance(f, Math.round(f.predicted * 3));
    expect(good.pct).toBeGreaterThan(bad.pct);
    expect(good.label).toBe('Safe');
    expect(bad.label).toBe('Reach');
  });

  it('probability is monotonic decreasing in your rank', () => {
    let prev = 1;
    for (const r of [1000, 3000, 5600, 8000, 15000]) {
      const p = admitChance(f, r).probability;
      expect(p).toBeLessThanOrEqual(prev + 1e-9);
      prev = p;
    }
  });
});

describe('EWS pre-2019 exclusion', () => {
  it('drops pre-2019 points for an EWS series (they did not exist)', () => {
    // 2016–2018 EWS points are excluded → only 2019,2023 remain (2 usable points).
    const f = forecastSeries(pts([[2016, 9000], [2017, 9000], [2018, 9000], [2019, 4000], [2023, 4200]]), { exam: 'main', seatType: 'EWS' })!;
    expect(f.nPoints).toBe(2);
    expect(f.method).toBe('two-point');
  });
});
