// Backtest harness: hold out a year, forecast it from the earlier years only, and
// score against the actual closing rank. This is the honesty check the plan promises —
// "predict 2024 from ≤2023, publish the hit-rate" — and the interval-coverage metric
// tells us whether the uncertainty band is calibrated (an 80% band should contain the
// truth ~80% of the time), which matters more than raw point error for a chance predictor.
import type { CutoffSeries } from '@sc/catalog-core';
import { forecastSeries, type ForecastOpts } from './forecast';

export interface BacktestRow {
  key: string;
  testYear: number;
  actual: number;
  predicted: number;
  low: number;
  high: number;
  absPctErr: number; // |predicted − actual| / actual
  inBand: boolean;
  nTrain: number;
}

export interface BacktestReport {
  testYear: number;
  count: number; // series scored
  mae: number; // mean absolute error (ranks)
  medAbsPctErr: number; // median absolute percentage error (robust)
  meanAbsPctErr: number;
  bandCoverage: number; // fraction of actuals inside [low, high] (target ≈ 0.80)
  within10pct: number; // fraction of point forecasts within 10% of actual
  within25pct: number;
  minTrain: number;
  rows: BacktestRow[];
}

const examOf = (s: CutoffSeries): ForecastOpts['exam'] => (s.type === 'IIT' ? 'adv' : 'main');

/**
 * Backtest one held-out year across all series that have it plus ≥ minTrain earlier
 * points. Each series is forecast using ONLY points strictly before testYear.
 */
export function backtestYear(series: CutoffSeries[], testYear: number, minTrain = 2): BacktestReport {
  const rows: BacktestRow[] = [];
  for (const s of series) {
    const actualPt = s.points.find((p) => p.year === testYear);
    if (!actualPt || !(actualPt.close > 0)) continue;
    const train = s.points.filter((p) => p.year < testYear);
    if (train.length < minTrain) continue;
    const f = forecastSeries(train, { exam: examOf(s), targetYear: testYear, seatType: s.seatType });
    if (!f) continue;
    const actual = actualPt.close;
    rows.push({
      key: s.key, testYear, actual, predicted: f.predicted, low: f.low, high: f.high,
      absPctErr: Math.abs(f.predicted - actual) / actual,
      inBand: actual >= f.low && actual <= f.high,
      nTrain: train.length,
    });
  }
  const n = rows.length;
  const pctErrs = rows.map((r) => r.absPctErr).sort((a, b) => a - b);
  const med = n ? pctErrs[n >> 1]! : NaN;
  const mae = n ? rows.reduce((a, r) => a + Math.abs(r.predicted - r.actual), 0) / n : NaN;
  const meanPct = n ? rows.reduce((a, r) => a + r.absPctErr, 0) / n : NaN;
  return {
    testYear, count: n, mae, medAbsPctErr: med, meanAbsPctErr: meanPct,
    bandCoverage: n ? rows.filter((r) => r.inBand).length / n : NaN,
    within10pct: n ? rows.filter((r) => r.absPctErr <= 0.10).length / n : NaN,
    within25pct: n ? rows.filter((r) => r.absPctErr <= 0.25).length / n : NaN,
    minTrain, rows,
  };
}

/** Pretty one-line-per-metric summary for logs / a published accuracy report. */
export function formatReport(r: BacktestReport): string {
  const pct = (x: number) => (Number.isFinite(x) ? (100 * x).toFixed(1) + '%' : 'n/a');
  return [
    `Backtest ${r.testYear} (train ≥${r.minTrain} yrs): ${r.count} series`,
    `  MAE: ${Number.isFinite(r.mae) ? Math.round(r.mae) : 'n/a'} ranks`,
    `  median abs % error: ${pct(r.medAbsPctErr)}   mean: ${pct(r.meanAbsPctErr)}`,
    `  within 10%: ${pct(r.within10pct)}   within 25%: ${pct(r.within25pct)}`,
    `  80% band coverage: ${pct(r.bandCoverage)} (target ≈ 80%)`,
  ].join('\n');
}
