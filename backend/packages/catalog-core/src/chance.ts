// Runtime chance % from a precomputed forecast band. The band (predicted, σ) is computed
// offline by @sc/forecast at seed time; here we only evaluate the per-candidate probability
//   P(admit) = Φ((R̂ − yourRank) / σ)
// so the request path stays engine-free (a tiny inline normal CDF, no @sc/forecast import).
import type { ForecastBand, Bucket } from './types';

// Standard normal CDF via Abramowitz & Stegun 7.1.26 erf (|ε| < 1.5e-7).
function normalCdf(z: number): number {
  const s = z < 0 ? -1 : 1;
  const ax = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + s * y);
}

export interface ForecastChance {
  pct: number; // 1–99
  bucket: Bucket;
  label: 'Safe' | 'Target' | 'Reach';
}

/** Calibrated admit chance for a candidate rank against a forecast band. */
export function forecastChance(band: ForecastBand, yourRank: number): ForecastChance {
  const sigma = Math.max(1, band.sigmaRank);
  const p = Math.max(0.01, Math.min(0.99, normalCdf((band.predicted - yourRank) / sigma)));
  const pct = Math.round(p * 100);
  if (p >= 0.8) return { pct, bucket: 'safe', label: 'Safe' };
  if (p >= 0.4) return { pct, bucket: 'target', label: 'Target' };
  return { pct, bucket: 'reach', label: 'Reach' };
}
