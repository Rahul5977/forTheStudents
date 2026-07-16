// Candidate-pool sizes per exam per year — the denominator for candidate-growth
// normalization. JoSAA closing ranks aren't comparable across years at face value
// because the applicant pool keeps growing (JEE Main ~0.87M → ~1.22M over 2020→2024);
// a rank of 10,000 means something different each year. We normalize a rank to a
// percentile p = rank / poolSize(exam, year) before trend-fitting, then rescale the
// forecast by the PROJECTED 2026 pool. Because the same pool series appears in both the
// forward normalization and the back-transform, a constant scale factor cancels — so
// using the exam-level pool for category ranks is self-consistent (only differential
// growth of a category pool vs the full pool leaves a small residual, absorbed by the band).
//
// Figures are best-effort published "appeared" counts (approximate). The RATIO between
// years is what matters, not the absolute value.
// TODO(owner): replace with verified NTA / JAB "appeared" figures + a source note per year.

export type ExamPool = 'adv' | 'main';

// JEE Advanced — candidates who appeared (both papers).
const ADV: Record<number, number> = {
  2016: 155048, 2017: 159540, 2018: 155158, 2019: 161319, 2020: 150838,
  2021: 141699, 2022: 155538, 2023: 180372, 2024: 180200, 2025: 180422,
};

// JEE Main (Paper 1, B.E./B.Tech) — unique candidates who appeared.
const MAIN: Record<number, number> = {
  2016: 1194938, 2017: 1186454, 2018: 1043739, 2019: 1138000, 2020: 869010,
  2021: 939008, 2022: 1026799, 2023: 1145000, 2024: 1221624, 2025: 1300000,
};

const table = (exam: ExamPool) => (exam === 'adv' ? ADV : MAIN);

/** Median year-over-year growth over the last few known transitions (clamped sane). */
function recentGrowth(t: Record<number, number>): number {
  const years = Object.keys(t).map(Number).sort((a, b) => a - b);
  const gs: number[] = [];
  for (let i = Math.max(1, years.length - 4); i < years.length; i++) {
    const a = t[years[i - 1]!]!; const b = t[years[i]!]!;
    if (a > 0) gs.push(b / a - 1);
  }
  gs.sort((a, b) => a - b);
  const g = gs.length ? gs[gs.length >> 1]! : 0.03;
  return Math.max(-0.02, Math.min(0.08, g)); // ignore COVID-scale swings; cap runaway growth
}

/**
 * Pool size for (exam, year). Known years are looked up; unknown years are
 * extrapolated from the nearest known year at the recent median growth rate.
 */
export function poolSize(exam: ExamPool, year: number): number {
  const t = table(exam);
  if (t[year]) return t[year]!;
  const years = Object.keys(t).map(Number).sort((a, b) => a - b);
  const g = recentGrowth(t);
  if (year > years[years.length - 1]!) {
    const last = years[years.length - 1]!;
    return Math.round(t[last]! * (1 + g) ** (year - last));
  }
  if (year < years[0]!) {
    const first = years[0]!;
    return Math.round(t[first]! / (1 + g) ** (first - year));
  }
  // interpolate between neighbours (rare — we have contiguous coverage)
  let lo = years[0]!; let hi = years[years.length - 1]!;
  for (const y of years) { if (y <= year) lo = y; if (y >= year) { hi = y; break; } }
  const f = hi === lo ? 0 : (year - lo) / (hi - lo);
  return Math.round(t[lo]! + f * (t[hi]! - t[lo]!));
}
