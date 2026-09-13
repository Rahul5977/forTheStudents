/**
 * hub-build.ts — assemble the validated per-section files into the single committed bundle the
 * catalog Lambda imports (`data/colleges/hub.bundle.json`).
 *
 * Runs the validator first (spawned, so a failing dataset never produces a bundle). An institute
 * is included only when its `profile.json` parses; missing/absent optional sections become null.
 *
 * Usage: pnpm --filter @sc/catalog hub:build [--version hub-2026.1]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { HUB_SECTIONS, HUB_SECTION_NAMES, HubBundle, CollegeHub, type HubSection } from '@sc/catalog-core';
import { loadRoster, collegeDirs, collegesDir, bundlePath, readJson } from './hub-common';

function main() {
  const vIdx = process.argv.indexOf('--version');
  const version = vIdx > -1 ? String(process.argv[vIdx + 1]) : 'hub-2026.1';

  const v = spawnSync(process.execPath, [...process.execArgv, process.argv[1]!.replace(/hub-build\.ts$/, 'hub-validate.ts')], { stdio: 'inherit' });
  if (v.status !== 0) { console.error('hub:build aborted — fix validator errors first'); process.exit(1); }

  const roster = loadRoster();
  const institutes: Record<string, CollegeHub> = {};
  let skipped = 0;
  for (const id of collegeDirs()) {
    const sections: Record<string, unknown> = {};
    for (const section of HUB_SECTION_NAMES) {
      const p = join(collegesDir, id, `${section}.json`);
      if (!existsSync(p)) { sections[section] = null; continue; }
      const r = readJson(p);
      sections[section] = r.ok ? HUB_SECTIONS[section as HubSection].parse(r.value) : null;
    }
    const hub = CollegeHub.safeParse(sections);
    if (!hub.success) { skipped++; console.warn(`skip ${id}: ${hub.error.issues[0]?.path.join('.')}: ${hub.error.issues[0]?.message}`); continue; }
    institutes[id] = hub.data;
  }
  const bundle = HubBundle.parse({ version, builtAt: new Date().toISOString(), roster, institutes });
  const text = JSON.stringify(bundle);
  writeFileSync(bundlePath, text + '\n');
  console.log(`wrote ${bundlePath}: ${Object.keys(institutes).length} institutes, ${(text.length / 1024).toFixed(0)} KB${skipped ? `, ${skipped} skipped` : ''}`);
}

main();
