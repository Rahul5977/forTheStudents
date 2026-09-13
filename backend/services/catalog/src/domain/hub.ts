// College Data Hub — serving layer (Phase 12c, ADR-018). The committed bundle
// (`data/colleges/hub.bundle.json`, produced by `pnpm hub:build`) is inlined by esbuild into
// the Lambda and installed into module memory once per cold start. No DynamoDB, no S3.
import { loadHubBundle, hubFor, hubSection, rosterFor, hubVersion, isHubSection, HUB_SECTION_NAMES } from '@sc/catalog-core';
import type { CollegeHub, HubSection, RosterRow } from '@sc/catalog-core';
import { NotFoundError, ValidationError } from '@sc/shared';
import bundle from '../../data/colleges/hub.bundle.json';

loadHubBundle(bundle as unknown);

export { hubFor, rosterFor, hubVersion };

/** GET /colleges/:id/hub/:section — one section of one institute's hub record. */
export function getHubSection(instituteId: string, section: string): { version: string | null; instituteId: string; section: HubSection; data: CollegeHub[HubSection] } {
  if (!isHubSection(section)) throw ValidationError(`Unknown hub section "${section}" (one of: ${HUB_SECTION_NAMES.join(', ')})`);
  const hub = hubFor(instituteId);
  if (!hub) throw NotFoundError('College not found in the hub');
  return { version: hubVersion(), instituteId, section, data: hubSection(instituteId, section) };
}

/** Institute header for a roster row that has no cutoff rows (own-entrance IIITs). */
export function institutFromRoster(r: RosterRow) {
  return {
    id: r.id,
    short: r.short,
    institute: r.officialName,
    type: r.type,
    exam: r.admissionRoute === 'own-entrance' ? ('other' as const) : r.type === 'IIT' ? ('adv' as const) : ('main' as const),
    city: r.city,
    state: r.state,
    nirf: null as number | null,
    feesLakh: null as number | null,
  };
}
