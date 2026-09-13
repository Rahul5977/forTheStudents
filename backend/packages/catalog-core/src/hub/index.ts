// College Data Hub — in-memory access (Phase 12). Pure: no fs, no network. The catalog
// service imports the committed `hub.bundle.json` (esbuild inlines it) and calls
// `loadHubBundle()` once at module init; everything else reads from the map.
export * from './schema';
import { HubBundle, type CollegeHub, type HubSection, type RosterRow } from './schema';

let bundle: HubBundle | null = null;
let byId = new Map<string, CollegeHub>();
let rosterById = new Map<string, RosterRow>();

/** Install a bundle (validated). Idempotent; replaces any prior bundle. */
export function loadHubBundle(raw: unknown): HubBundle {
  const parsed = HubBundle.parse(raw);
  bundle = parsed;
  byId = new Map(Object.entries(parsed.institutes));
  rosterById = new Map(parsed.roster.map((r) => [r.id, r]));
  return parsed;
}

/** The loaded bundle's version tag (e.g. "hub-2026.1"), or null when nothing is loaded. */
export const hubVersion = (): string | null => bundle?.version ?? null;

/** Full hub record for an institute, or null (profile degrades to cutoffs-only). */
export const hubFor = (instituteId: string): CollegeHub | null => byId.get(instituteId) ?? null;

/** One section, or null when the institute or the section is absent. */
export function hubSection<S extends HubSection>(instituteId: string, section: S): CollegeHub[S] | null {
  const h = byId.get(instituteId);
  return h ? (h[section] as CollegeHub[S]) : null;
}

/** Roster row (identity for institutes that have no cutoff rows, e.g. own-entrance IIITs). */
export const rosterFor = (instituteId: string): RosterRow | null => rosterById.get(instituteId) ?? null;

/** Every roster row of the loaded bundle (empty when none is loaded). */
export const hubRoster = (): RosterRow[] => bundle?.roster ?? [];
