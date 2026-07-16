import { describe, it, expect } from 'vitest';
import {
  median, mean, weightedMean, std, logit, logistic, normalCdf, tMultiplier, wls, theilSen, holt, dampedHorizon, clamp,
} from './stats';

describe('central tendency', () => {
  it('median (odd/even)', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('weightedMean collapses to mean with equal weights', () => {
    expect(weightedMean([1, 2, 3], [1, 1, 1])).toBeCloseTo(mean([1, 2, 3]), 10);
  });
  it('weightedMean favours heavy weights', () => {
    expect(weightedMean([0, 10], [9, 1])).toBeCloseTo(1, 10);
  });
  it('std of a known set', () => {
    expect(std([2, 4, 4, 4, 5, 5, 7, 9], 0)).toBeCloseTo(2, 10); // population std = 2
  });
});

describe('logit space', () => {
  it('logit/logistic round-trip', () => {
    for (const p of [0.001, 0.05, 0.5, 0.9, 0.999]) expect(logistic(logit(p))).toBeCloseTo(p, 6);
  });
  it('logistic(0) = 0.5, monotonic', () => {
    expect(logistic(0)).toBeCloseTo(0.5, 10);
    expect(logistic(2)).toBeGreaterThan(logistic(1));
  });
});

describe('normal CDF', () => {
  it('matches known quantiles', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.2816)).toBeCloseTo(0.90, 3);
    expect(normalCdf(1.6449)).toBeCloseTo(0.95, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

describe('tMultiplier', () => {
  it('matches the t-table for small df and → z for large df', () => {
    expect(tMultiplier(1, 0.9)).toBeCloseTo(3.078, 2);
    expect(tMultiplier(2, 0.9)).toBeCloseTo(1.886, 2);
    expect(tMultiplier(100, 0.9)).toBeCloseTo(1.2816, 3);
    expect(tMultiplier(1, 0.95)).toBeCloseTo(6.314, 2);
  });
});

describe('regression estimators', () => {
  it('wls recovers a clean line y = 2x + 1', () => {
    const xs = [0, 1, 2, 3, 4]; const ys = xs.map((x) => 2 * x + 1);
    const f = wls(xs, ys);
    expect(f.slope).toBeCloseTo(2, 8);
    expect(f.intercept).toBeCloseTo(1, 8);
    expect(f.residStd).toBeCloseTo(0, 8);
  });
  it('theilSen is robust to a single outlier', () => {
    const xs = [0, 1, 2, 3, 4]; const ys = [1, 3, 5, 7, 99]; // last point is an outlier
    const { slope } = theilSen(xs, ys);
    expect(slope).toBeCloseTo(2, 6); // median pairwise slope ignores the outlier
  });
  it('holt damping flattens long-horizon forecasts', () => {
    const ys = [0, 1, 2, 3]; // slope 1
    const h = holt(ys);
    const near = h.forecast(1); const far = h.forecast(20);
    expect(far - near).toBeLessThan(20); // damped, not linear (<19 extra)
  });
  it('dampedHorizon is increasing but bounded by the geometric sum', () => {
    expect(dampedHorizon(1, 0.85)).toBeCloseTo(0.85, 6);
    expect(dampedHorizon(100, 0.85)).toBeLessThan(0.85 / (1 - 0.85) + 1e-6); // → φ/(1−φ)
  });
});

describe('clamp', () => {
  it('bounds', () => { expect(clamp(0, 10, -5)).toBe(0); expect(clamp(0, 10, 50)).toBe(10); expect(clamp(0, 10, 5)).toBe(5); });
});
