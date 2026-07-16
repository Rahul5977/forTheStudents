// The forecast engine: project a JoSAA closing rank forward (default 2026) from its
// multi-year history, with a calibrated uncertainty band. Explainable, no black-box ML.
//
// Pipeline (per series):
//   1. normalize   rank → percentile p = rank / pool(exam, year) → logit y      (candidates.ts)
//   2. weight      w_t = decay^(target−year) · anomaly(year, seatType)          (COVID/pre-EWS)
//   3. ensemble    median of {WLS trend, Theil–Sen, last-3 slope, damped Holt,
//                  recency-weighted flat}, slope-methods anchored at the last point
//                  with a damped extrapolation horizon                           (stats.ts)
//   4. back-xform  R̂ = logistic(ŷ) · pool(exam, target)
//   5. band        σ = √(prediction-SE² + volatility²) in logit space → asymmetric
//                  rank interval via a Student-t multiplier
//   6. probability P(admit | yourRank) = Φ((R̂ − yourRank) / σ_rank)             (admit.ts)
import type { SeriesPoint } from '@sc/catalog-core';
import { poolSize, type ExamPool } from './candidates';
import {
  clamp, logit, logistic, median, std, weightedMean, wls, theilSen, holt, dampedHorizon, tMultiplier, normalCdf,
} from './stats';

export interface ForecastOpts {
  exam: ExamPool; // 'adv' (IITs) or 'main' (NIT/IIIT/GFTI) — picks the candidate pool
  targetYear?: number; // default 2026
  seatType?: string; // OPEN/EWS/… — used to exclude pre-EWS years for EWS series
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Forecast {
  targetYear: number;
  predicted: number; // R̂ — forecast closing rank (smaller = more competitive)
  low: number; // optimistic bound (smaller rank)
  high: number; // pessimistic bound (larger rank)
  sigmaRank: number; // 1σ in rank space (drives admit probability)
  confidence: Confidence;
  method: 'ensemble' | 'two-point' | 'flat';
  limitedHistory: boolean;
  nPoints: number;
  slopePerYear: number; // trend in logit-percentile space (for explanation/debug)
  lastYear: number;
  lastClose: number;
}

const DECAY = 0.71; // recency: a year older is worth 0.71× (≈ half-life 2 yrs)
const PHI = 0.85; // slope damping on extrapolation
const COVID_YEARS = new Set([2020, 2021]); // regime break — down-weighted
const EWS_START = 2019; // EWS quota phased in from 2019

/** Anomaly weight a_t ∈ [0,1] for a year given the seat type. */
function anomaly(year: number, seatType?: string): number {
  const st = (seatType ?? '').toUpperCase();
  if (st === 'EWS' && year < EWS_START) return 0; // EWS didn't exist → drop
  let a = 1;
  if (COVID_YEARS.has(year)) a *= 0.45; // COVID admissions were atypical
  return a;
}

/** Build the (x=year, y=logit percentile, w) arrays used by the ensemble. */
function prepare(points: SeriesPoint[], opts: ForecastOpts) {
  const target = opts.targetYear ?? 2026;
  const xs: number[] = []; const ys: number[] = []; const ws: number[] = []; const closes: number[] = [];
  for (const p of points) {
    if (!(p.close > 0)) continue;
    const a = anomaly(p.year, opts.seatType);
    if (a <= 0) continue;
    const pool = poolSize(opts.exam, p.year);
    xs.push(p.year);
    ys.push(logit(clamp(1e-7, 1 - 1e-6, p.close / pool)));
    ws.push(DECAY ** (target - p.year) * a);
    closes.push(p.close);
  }
  return { target, xs, ys, ws, closes };
}

/**
 * Ensemble point estimate: the MEDIAN over estimators drawn from BOTH
 *  • percentile space  (rank/pool → logit; corrects for candidate-pool growth), and
 *  • absolute log-rank space  (ln rank; stable for the ultra-elite ranks, e.g. CSE at
 *    top IITs, whose absolute cutoff barely moves even as the pool balloons).
 * Blending the two stops percentile-normalization from over-inflating stable-absolute
 * seats while still de-trending pool growth for the mid-range. All slope methods are
 * anchored at the last observed value with a damped horizon, so recency dominates and
 * long extrapolations flatten instead of running away.
 */
function ensembleRank(
  xs: number[], yP: number[], lnC: number[], ws: number[], target: number, poolTarget: number,
): { predicted: number; slopeP: number; slopeLn: number } {
  const n = xs.length;
  const gap = Math.max(1, target - xs[n - 1]!);
  const dh = dampedHorizon(gap, PHI);

  const fitP = wls(xs, yP, ws);
  const tsP = theilSen(xs, yP);
  const fitA = wls(xs, lnC, ws);
  const hA = holt(lnC);

  const preds: number[] = [
    logistic(yP[n - 1]! + fitP.slope * dh) * poolTarget, // percentile WLS trend
    logistic(yP[n - 1]! + tsP.slope * dh) * poolTarget, // percentile Theil–Sen
    logistic(weightedMean(yP, ws)) * poolTarget, // percentile recency-flat
    Math.exp(lnC[n - 1]! + fitA.slope * dh), // absolute log-rank WLS trend
    Math.exp(weightedMean(lnC, ws)), // absolute log-rank recency-flat
    Math.exp(hA.forecast(gap)), // damped Holt on log-rank
  ];
  return { predicted: Math.max(1, Math.round(median(preds))), slopeP: fitP.slope, slopeLn: fitA.slope };
}

// Band-width cap (per-σ isn't enough — cap the whole interval so it stays interpretable).
const CAP_BY_CONF: Record<Confidence, number> = { high: 3, medium: 5, low: 9 };

/**
 * Forecast a series' closing rank at the target year. Returns null only for an empty
 * series. Fewer than 3 usable points ⇒ best-effort with limitedHistory + a wide band.
 * The uncertainty band is computed in bounded log-rank space (never saturates) and
 * capped to a sane multiple of the point estimate.
 */
export function forecastSeries(points: SeriesPoint[], opts: ForecastOpts): Forecast | null {
  const { target, xs, ws, closes } = prepare(points, opts);
  const n = xs.length;
  if (n === 0) return null;

  const lastYear = xs[n - 1]!;
  const lastClose = closes[n - 1]!;
  const gap = Math.max(1, target - lastYear);
  const poolTarget = poolSize(opts.exam, target);
  const yP = xs.map((yr, i) => logit(clamp(1e-7, 1 - 1e-6, closes[i]! / poolSize(opts.exam, yr))));
  const lnC = closes.map((c) => Math.log(c));

  let predicted: number; let slopeP = 0; let slopeLn = 0; let method: Forecast['method'];
  if (n === 1) {
    // One point: hold the percentile flat, rescale by pool growth.
    predicted = Math.max(1, Math.round(logistic(yP[0]!) * poolTarget)); method = 'flat';
  } else if (n === 2) {
    // Two points: blend a single damped percentile-slope and log-rank-slope prediction.
    const dh = dampedHorizon(gap, PHI);
    slopeP = (yP[1]! - yP[0]!) / (xs[1]! - xs[0]!);
    slopeLn = (lnC[1]! - lnC[0]!) / (xs[1]! - xs[0]!);
    const pPct = logistic(yP[1]! + slopeP * dh) * poolTarget;
    const pAbs = Math.exp(lnC[1]! + slopeLn * dh);
    predicted = Math.max(1, Math.round(Math.sqrt(pPct * pAbs))); // geometric blend
    method = 'two-point';
  } else {
    const e = ensembleRank(xs, yP, lnC, ws, target, poolTarget);
    predicted = e.predicted; slopeP = e.slopeP; slopeLn = e.slopeLn; method = 'ensemble';
  }

  // ── uncertainty band in bounded log-rank space ──
  // (a) prediction SE from the log-rank trend fit (0 when n<3)
  let seTrend = 0;
  if (n >= 3) {
    const fitA = wls(xs, lnC, ws);
    seTrend = fitA.residStd * Math.sqrt(1 + 1 / n + (fitA.sxx > 0 ? (target - fitA.xbar) ** 2 / fitA.sxx : 0));
  }
  // (b) volatility of year-over-year log-rank changes, grown over a capped horizon
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) diffs.push((lnC[i]! - lnC[i - 1]!) / (xs[i]! - xs[i - 1]!));
  const volLn = Math.min(0.8, n >= 2 ? std(diffs.length > 1 ? diffs : [...diffs, 0]) : 0);
  const seVol = (volLn || 0.22) * Math.sqrt(Math.min(gap, 3)); // cap horizon growth at 3 yrs
  const sigLn = Math.min(1.0, Math.max(0.10, Math.sqrt(seTrend * seTrend + seVol * seVol)));

  const df = Math.max(1, n - 2);
  const t = tMultiplier(df, 0.9); // 80% band
  const relWidthRaw = Math.exp(t * sigLn); // multiplicative half-width before capping

  const limitedHistory = n < 3 || (opts.seatType?.toUpperCase() === 'EWS' && lastYear - xs[0]! < 2);
  let confidence: Confidence = 'high';
  if (limitedHistory || relWidthRaw > 3.0 || gap >= 4) confidence = 'low';
  else if (relWidthRaw > 1.8 || n === 3) confidence = 'medium';

  const cap = CAP_BY_CONF[confidence];
  const half = Math.min(t * sigLn, Math.log(cap)); // cap the interval to ±ln(cap)
  const low = Math.max(1, Math.round(predicted / Math.exp(half)));
  const high = Math.max(low + 1, Math.round(predicted * Math.exp(half)));
  const sigmaRank = Math.max(1, (high - low) / (2 * t)); // symmetric 1σ implied by the band

  return {
    targetYear: target, predicted, low, high, sigmaRank, confidence, method,
    limitedHistory, nPoints: n, slopePerYear: slopeLn, lastYear, lastClose,
  };
}

export type AdmitLabel = 'Safe' | 'Target' | 'Reach';
export interface AdmitChance { pct: number; label: AdmitLabel; probability: number }

/**
 * Calibrated admission chance for a candidate rank against a forecast. The 2026 closing
 * rank is modelled ~ Normal(R̂, σ); you're admitted iff your rank ≤ that closing rank, so
 *   P(admit) = Φ((R̂ − yourRank) / σ).
 */
export function admitChance(f: Forecast, yourRank: number): AdmitChance {
  const probability = clamp(0.01, 0.99, normalCdf((f.predicted - yourRank) / f.sigmaRank));
  const pct = Math.round(probability * 100);
  const label: AdmitLabel = probability >= 0.8 ? 'Safe' : probability >= 0.4 ? 'Target' : 'Reach';
  return { pct, label, probability };
}
