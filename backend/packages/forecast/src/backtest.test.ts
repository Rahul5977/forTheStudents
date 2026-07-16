import { describe, it, expect } from 'vitest';
import type { CutoffSeries, SeriesPoint } from '@sc/catalog-core';
import { backtestYear } from './backtest';

const mkSeries = (key: string, type: CutoffSeries['type'], pairs: [number, number][]): CutoffSeries => ({
  key, instituteId: key, institute: key, short: key, program: 'CSE', branch: 'CSE',
  type, seatType: 'OPEN', quota: type === 'IIT' ? 'AI' : 'OS', gender: 'Gender-Neutral',
  city: '', state: '', nirf: null,
  points: pairs.map(([year, close]): SeriesPoint => ({ year, round: 6, open: 1, close })),
});

describe('backtestYear', () => {
  const series = [
    mkSeries('a', 'NIT', [[2020, 5000], [2021, 5200], [2022, 5400], [2023, 5600]]), // has 2023 + 3 train
    mkSeries('b', 'NIT', [[2022, 3000], [2023, 3200]]), // has 2023 but only 1 train year → skipped
    mkSeries('c', 'NIT', [[2020, 9000], [2021, 9100], [2022, 9200]]), // no 2023 → skipped
  ];

  it('scores only series that have the test year AND ≥ minTrain earlier points', () => {
    const r = backtestYear(series, 2023, 2);
    expect(r.count).toBe(1);
    expect(r.rows[0]!.key).toBe('a');
    expect(r.rows[0]!.actual).toBe(5600);
    expect(r.rows[0]!.nTrain).toBe(3);
  });

  it('forecasts the held-out year from earlier points only (no leakage)', () => {
    // Series 'a' is a clean linear rise; the 2023 forecast should land near 5600.
    const r = backtestYear([series[0]!], 2023, 2);
    const row = r.rows[0]!;
    expect(row.predicted).toBeGreaterThan(4800);
    expect(row.predicted).toBeLessThan(6600);
    expect(row.inBand).toBe(true);
    expect(row.absPctErr).toBeLessThan(0.25);
  });

  it('aggregates coverage & error metrics', () => {
    const r = backtestYear(series, 2023, 2);
    expect(r.bandCoverage).toBeGreaterThanOrEqual(0);
    expect(r.bandCoverage).toBeLessThanOrEqual(1);
    expect(r.medAbsPctErr).toBeCloseTo(r.rows[0]!.absPctErr, 10); // single row → median = its error
  });

  it('empty when no series has the test year', () => {
    expect(backtestYear(series, 2099, 2).count).toBe(0);
  });
});
