// Canonical institute directory + forecast-series builder over a (possibly multi-year)
// Cutoff[]. Everything keys off the churn-stable `instituteId` (see enrich.instituteId),
// NOT the raw institute name — so the same college is one entry even as its official
// name drifts year to year, and content tables (fees/seats/placements/photos) join cleanly.
import type { Cutoff, CutoffSeries, SeriesPoint, CollegeType } from './types';

export interface Institute {
  id: string; // canonical slug — the join key
  institute: string; // most-recent full official name
  short: string; // display name
  type: CollegeType;
  city: string;
  state: string;
  nirf: number | null;
  feesLakh: number;
  programs: number; // distinct programs (latest year)
  years: number[]; // years present in the corpus, ascending
}

/** The latest year present in a cutoff set (0 if empty). */
export function latestYear(cutoffs: Cutoff[]): number {
  let y = 0;
  for (const c of cutoffs) if (c.year > y) y = c.year;
  return y;
}

/**
 * Distinct institutes, keyed by canonical id — a browse directory, not every cutoff.
 * Display fields (name/city/nirf/…) are taken from the institute's most-recent row so
 * the directory reflects the current name; `programs` counts distinct programs in that
 * latest year; `years` lists every year the institute appears in.
 */
export function distinctInstitutes(cutoffs: Cutoff[]): Institute[] {
  const by = new Map<string, { rows: Cutoff[]; years: Set<number> }>();
  for (const c of cutoffs) {
    let e = by.get(c.instituteId);
    if (!e) { e = { rows: [], years: new Set() }; by.set(c.instituteId, e); }
    e.rows.push(c);
    e.years.add(c.year);
  }
  const out: Institute[] = [];
  for (const [id, { rows, years }] of by) {
    const ly = Math.max(...rows.map((r) => r.year));
    const latest = rows.filter((r) => r.year === ly);
    const sample = latest[0] ?? rows[0]!;
    out.push({
      id,
      institute: sample.institute,
      short: sample.short,
      type: sample.type,
      city: sample.city,
      state: sample.state,
      nirf: sample.nirf,
      feesLakh: sample.feesLakh,
      programs: new Set(latest.map((r) => r.program)).size,
      years: [...years].sort((a, b) => a - b),
    });
  }
  return out.sort((a, b) => a.short.localeCompare(b.short));
}

const seriesKey = (c: Cutoff) => `${c.instituteId}|${c.program}|${c.seatType}|${c.quota}|${c.gender}`;

/**
 * Collapse a multi-year Cutoff[] into forecast series. One series per
 * (instituteId, program, seatType, quota, gender); one point per year — the FINAL
 * round for that year (highest round number, which is the settled closing rank).
 * Points are sorted ascending by year — ready for @sc/forecast.
 */
export function buildSeries(cutoffs: Cutoff[]): CutoffSeries[] {
  const groups = new Map<string, Cutoff[]>();
  for (const c of cutoffs) {
    const k = seriesKey(c);
    const g = groups.get(k);
    if (g) g.push(c); else groups.set(k, [c]);
  }
  const out: CutoffSeries[] = [];
  for (const [key, rows] of groups) {
    // Keep the final round per year (max round → settled closing rank).
    const byYear = new Map<number, Cutoff>();
    for (const r of rows) {
      const prev = byYear.get(r.year);
      if (!prev || r.round > prev.round) byYear.set(r.year, r);
    }
    const points: SeriesPoint[] = [...byYear.values()]
      .map((r) => ({ year: r.year, round: r.round, open: r.open, close: r.close }))
      .sort((a, b) => a.year - b.year);
    const s = rows.find((r) => r.year === points[points.length - 1]!.year) ?? rows[0]!;
    out.push({
      key, instituteId: s.instituteId, institute: s.institute, short: s.short,
      program: s.program, branch: s.branch, type: s.type, seatType: s.seatType,
      quota: s.quota, gender: s.gender, city: s.city, state: s.state, nirf: s.nirf, points,
    });
  }
  return out;
}

/** Series for one institute (its full per-branch/category/quota/gender history). */
export function seriesForInstitute(cutoffs: Cutoff[], id: string): CutoffSeries[] {
  return buildSeries(cutoffs.filter((c) => c.instituteId === id));
}
