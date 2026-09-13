/**
 * hub-common.ts — shared helpers for the College Data Hub scripts (roster / validate / build).
 * Pure filesystem + schema plumbing; no network.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Roster, type RosterRow } from '@sc/catalog-core';

export const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data');
export const rosterPath = join(dataDir, 'institutes.json');
export const collegesDir = join(dataDir, 'colleges');
export const coveragePath = join(collegesDir, 'coverage.json');
export const bundlePath = join(collegesDir, 'hub.bundle.json');

export function loadRoster(): RosterRow[] {
  if (!existsSync(rosterPath)) throw new Error(`roster missing: ${rosterPath} — run \`pnpm hub:roster\` first`);
  return Roster.parse(JSON.parse(readFileSync(rosterPath, 'utf8')));
}

/** Institute directories present under data/colleges (ignores files like coverage.json). */
export function collegeDirs(): string[] {
  if (!existsSync(collegesDir)) return [];
  return readdirSync(collegesDir)
    .filter((n) => !n.startsWith('.') && statSync(join(collegesDir, n)).isDirectory())
    .sort();
}

export function readJson(path: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Hostname of a URL, lower-cased, without a leading "www." (empty string when unparsable). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Coverage = share of fact leaves that are non-null. Walks the parsed section, skipping
 * provenance (`sources`, `asOf`) and identity keys; an empty array counts as one null leaf
 * ("looked, found nothing"); a null section is 0.
 */
export function coverageOf(section: unknown): number {
  if (section === null || section === undefined) return 0;
  let total = 0;
  let filled = 0;
  const SKIP = new Set(['sources', 'asOf', 'instituteId', 'currency', 'accessedOn']);
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      if (v.length === 0) { total++; return; }
      for (const x of v) walk(x);
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!SKIP.has(k)) walk(x);
      return;
    }
    total++;
    if (v !== null && v !== '' ) filled++;
  };
  walk(section);
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}
