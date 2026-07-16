// Numerical primitives for the forecast engine. Pure, dependency-free, unit-tested.
// Everything the ensemble needs: robust central tendency, logit space, the normal CDF
// (for admit probability), a Student-t multiplier (small-sample prediction intervals),
// weighted least squares, Theil–Sen, and damped Holt.

export const clamp = (lo: number, hi: number, x: number) => Math.max(lo, Math.min(hi, x));

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function weightedMean(xs: number[], ws: number[]): number {
  let sw = 0; let swx = 0;
  for (let i = 0; i < xs.length; i++) { sw += ws[i]!; swx += ws[i]! * xs[i]!; }
  return sw > 0 ? swx / sw : mean(xs);
}

/** Population/sample std over xs (sample: ddof=1). Returns 0 for <2 points. */
export function std(xs: number[], ddof = 1): number {
  const n = xs.length;
  if (n - ddof <= 0) return 0;
  const m = mean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) * (x - m), 0);
  return Math.sqrt(ss / (n - ddof));
}

// ── logit space ──────────────────────────────────────────────────────────────
const P_LO = 1e-7;
const P_HI = 1 - 1e-6;
export const logit = (p: number) => { const q = clamp(P_LO, P_HI, p); return Math.log(q / (1 - q)); };
export const logistic = (y: number) => 1 / (1 + Math.exp(-y));

// ── normal CDF Φ (Abramowitz & Stegun 7.1.26 erf, |ε| < 1.5e-7) ────────────────
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return s * y;
}
/** Standard normal CDF. */
export const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/**
 * One-sided Student-t multiplier t_{p}(df) for prediction intervals. Table for the
 * small df we actually see (1–2 residual dof from 3–4 data points), interpolated,
 * falling back to the normal quantile for large df. p is one-sided (0.90 ⇒ 80% CI).
 */
export function tMultiplier(df: number, p = 0.9): number {
  const zByP: Record<number, number> = { 0.9: 1.2816, 0.95: 1.6449, 0.975: 1.96 };
  const z = zByP[p] ?? 1.2816;
  if (df >= 30 || !Number.isFinite(df)) return z;
  const table90 = [Infinity, 3.078, 1.886, 1.638, 1.533, 1.476, 1.440, 1.415, 1.397, 1.383, 1.372];
  const table95 = [Infinity, 6.314, 2.920, 2.353, 2.132, 2.015, 1.943, 1.895, 1.860, 1.833, 1.812];
  const tbl = p >= 0.95 ? table95 : table90;
  const d = Math.max(1, Math.min(10, Math.round(df)));
  const base = tbl[d]!;
  return Number.isFinite(base) ? base : z;
}

// ── weighted least squares: y = a + b·x ───────────────────────────────────────
export interface WlsFit { slope: number; intercept: number; xbar: number; sxx: number; n: number; residStd: number }
export function wls(xs: number[], ys: number[], ws?: number[]): WlsFit {
  const n = xs.length;
  const w = ws ?? xs.map(() => 1);
  let sw = 0; for (const wi of w) sw += wi;
  const xbar = weightedMean(xs, w);
  const ybar = weightedMean(ys, w);
  let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i]! - xbar; sxx += w[i]! * dx * dx; sxy += w[i]! * dx * (ys[i]! - ybar); }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = ybar - slope * xbar;
  // Weighted residual std with (n-2) dof (0 if not enough points).
  let sse = 0; for (let i = 0; i < n; i++) { const r = ys[i]! - (intercept + slope * xs[i]!); sse += w[i]! * r * r; }
  const residStd = n > 2 && sw > 0 ? Math.sqrt(sse / (sw * (n - 2) / n)) : 0;
  return { slope, intercept, xbar, sxx, n, residStd };
}

/** Theil–Sen: slope = median of pairwise slopes; intercept = median(y − slope·x). Robust to outliers. */
export function theilSen(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[j]! - xs[i]!;
      if (dx !== 0) slopes.push((ys[j]! - ys[i]!) / dx);
    }
  const slope = slopes.length ? median(slopes) : 0;
  const intercept = median(xs.map((x, i) => ys[i]! - slope * x));
  return { slope, intercept };
}

/**
 * Damped Holt linear trend (double exponential smoothing). Returns level, trend, and a
 * forecaster h steps ahead with damping φ so the trend flattens on long extrapolation:
 *   ŷ(h) = level + trend·Σ_{k=1..h} φ^k.
 */
export function holt(ys: number[], alpha = 0.6, beta = 0.3, phi = 0.85): { level: number; trend: number; forecast: (h: number) => number } {
  let level = ys[0]!;
  let trend = ys.length > 1 ? ys[1]! - ys[0]! : 0;
  for (let i = 1; i < ys.length; i++) {
    const prevLevel = level;
    level = alpha * ys[i]! + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }
  const forecast = (h: number) => {
    let acc = 0; let p = phi;
    for (let k = 0; k < h; k++) { acc += p; p *= phi; }
    return level + trend * acc;
  };
  return { level, trend, forecast };
}

/** Σ_{k=1..h} φ^k — the damped horizon used to flatten a slope over h extrapolated steps. */
export function dampedHorizon(h: number, phi = 0.85): number {
  let acc = 0; let p = phi;
  for (let k = 0; k < h; k++) { acc += p; p *= phi; }
  return acc;
}
