// Seed-time corpus builder. Parses the full multi-year JoSAA corpus, builds per-seat
// series, precomputes the 2026 forecast band for each via @sc/forecast, and attaches the
// band + observed history to the CURRENT-year (latest) rows. Those enriched rows are what
// the catalog table stores — so the request path never loads history or runs the engine.
//
// This module is OFF the request path (only src/seed.ts imports it). @sc/forecast is a
// build/seed-time dependency here, keeping the Lambda bundle + cold start lean.
import type { EnrichedCutoff, Cutoff } from '@sc/catalog-core';
import { parseCorpus, buildSeries } from '@sc/catalog-core';
import { forecastSeries } from '@sc/forecast';

export interface CorpusFile { text: string; year?: number; round?: number }

const seriesKey = (c: Cutoff) => `${c.instituteId}|${c.program}|${c.seatType}|${c.quota}|${c.gender}`;

export interface BuildResult {
  enriched: EnrichedCutoff[]; // current-year rows + forecast band + history
  targetYear: number;
  stats: { rows: number; series: number; currentRows: number; withForecast: number; confidentForecast: number };
}

/** Build the enriched current-year snapshot (with 2026 forecasts) from raw CSV files. */
export function buildEnrichedCorpus(files: CorpusFile[], targetYear = 2026): BuildResult {
  const all = parseCorpus(files);
  const series = buildSeries(all);

  // Forecast every series once; index by key.
  const band = new Map<string, { forecast: EnrichedCutoff['forecast']; history: { year: number; close: number }[] }>();
  let confident = 0;
  for (const s of series) {
    const f = forecastSeries(s.points, { exam: s.type === 'IIT' ? 'adv' : 'main', targetYear, seatType: s.seatType });
    if (!f) continue;
    if (f.confidence !== 'low') confident++;
    band.set(s.key, {
      forecast: {
        targetYear: f.targetYear, predicted: f.predicted, low: f.low, high: f.high,
        sigmaRank: f.sigmaRank, confidence: f.confidence, limitedHistory: f.limitedHistory, nPoints: f.nPoints,
      },
      history: s.points.map((p) => ({ year: p.year, close: p.close })),
    });
  }

  // Current-year = the latest year in the corpus (2024 today). Those are the served rows.
  const currentYear = Math.max(...all.map((c) => c.year));
  const enriched: EnrichedCutoff[] = all
    .filter((c) => c.year === currentYear)
    .map((c) => {
      const b = band.get(seriesKey(c));
      return b ? { ...c, forecast: b.forecast, history: b.history } : { ...c };
    });

  return {
    enriched,
    targetYear,
    stats: {
      rows: all.length, series: series.length, currentRows: enriched.length,
      withForecast: enriched.filter((c) => c.forecast).length, confidentForecast: confident,
    },
  };
}
