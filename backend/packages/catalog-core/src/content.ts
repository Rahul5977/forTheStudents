// The college "content" layer (plan Phase 3): verifiable FACTS about each institute,
// keyed by the canonical `instituteId` (the same join key the cutoffs use).
//
// LEGAL GROUND RULE (from predictor-v2-forecast-plan.md): FACTS are not copyrightable —
// established year, official website, NIRF scores, accreditation, seat/fee/salary figures
// may be stored + displayed verbatim. PROSE is copyrighted — never copy aggregator /
// Wikipedia / brochure narrative; any `about` text must be original own-words summary.
// Photos must be Wikimedia/CC/PD only with TASL attribution — never re-hosted from
// official sites. Sourced/licensed data (photos, exact fee splits, placements) is left as
// explicit TODO(owner) slots, populated when the owner sources + licenses it.
//
// Curated FACTS are served from this in-code table (same pattern as enrich.ts), so v1
// needs NO new DynamoDB table and NO re-seed. TODO(owner): migrate to a `college_content`
// table once the licensed/sourced fields (photos/placements) are populated at scale.

/** A licensed campus image with mandatory CC attribution (TASL). */
export interface CollegePhoto {
  url: string;
  kind: 'hero' | 'gallery';
  title: string;
  author: string;
  sourcePage: string; // link to the Commons file page
  license: string; // e.g. "CC BY-SA 4.0"
  licenseUrl: string; // deed link
  modified?: boolean; // true if cropped/resized (ShareAlike note)
}

/** Fee split for one academic year (₹). Facts — store the split, not just the total. */
export interface FeeYear {
  year: number;
  tuition: number | null;
  hostel: number | null;
  mess: number | null;
  other: number | null;
  totalYear: number | null;
  source: string;
}

/** Placement facts for one year — every figure carries its year + source. */
export interface PlacementYear {
  year: number;
  avgLpa: number | null;
  medianLpa: number | null;
  highestLpa: number | null;
  topRecruiters: string[]; // recruiter NAMES are facts
  source: string;
}

/** The content record for one institute. Facts curated; licensed data = TODO(owner). */
export interface CollegeContent {
  instituteId: string;
  about: string | null; // original own-words summary (never copied prose)
  established: number | null;
  website: string | null;
  nirfOverall: number | null;
  nirfEng: number | null;
  accreditation: string | null;
  fees: FeeYear[] | null; // TODO(owner): verified per-institute fee split
  seatMatrix: unknown | null; // TODO(owner): seats per branch×category×quota×gender
  placements: PlacementYear[] | null; // TODO(owner): year-labelled placement figures
  photos: CollegePhoto[]; // TODO(owner): Wikimedia/CC-only, with TASL attribution
}

// Curated FACTS, keyed by the canonical `instituteId` slug (the same join key the cutoffs
// use — see enrich.ts `instituteId()`). Each row is compact:
//   [instituteId, established, website, nirfEng]
// All four are non-copyrightable FACTS: founding year, official `.ac.in`/`.edu` URL, and the
// NIRF-2024 engineering rank (mirrors the ranks already curated in enrich.ts; null = unranked).
// Coverage mirrors enrich.ts's curated set — the institutes students actually target: every
// IIT + the classic top-15 NITs + the major IIITs.
//
// Deliberately NOT in this table (they need owner sourcing/licensing, and prose is
// copyrighted): `about` narrative, NIRF-overall rank, accreditation, fee split, seat matrix,
// placements, photos. `contentFor()` leaves each null/[] with a TODO(owner) rather than
// fabricate a figure — populate them here as the owner sources + licenses each field.
const FACTS: [string, number, string, number | null][] = [
  // ── IITs (founding year — the institute's own established date; NIRF-2024 engineering) ──
  ['iit-madras', 1959, 'https://www.iitm.ac.in', 1],
  ['iit-delhi', 1961, 'https://home.iitd.ac.in', 2],
  ['iit-bombay', 1958, 'https://www.iitb.ac.in', 3],
  ['iit-kanpur', 1959, 'https://www.iitk.ac.in', 4],
  ['iit-kharagpur', 1951, 'https://www.iitkgp.ac.in', 5],
  ['iit-roorkee', 1847, 'https://www.iitr.ac.in', 6], // traces to Thomason College, 1847
  ['iit-guwahati', 1994, 'https://www.iitg.ac.in', 7],
  ['iit-hyderabad', 2008, 'https://www.iith.ac.in', 8],
  ['iit-bhu-varanasi', 1919, 'https://www.iitbhu.ac.in', 15], // BENCO 1919; IIT since 2012
  ['iit-ism-dhanbad', 1926, 'https://www.iitism.ac.in', 16], // ISM 1926; IIT since 2016
  ['iit-indore', 2009, 'https://www.iiti.ac.in', 16],
  ['iit-bhubaneswar', 2008, 'https://www.iitbbs.ac.in', 26],
  ['iit-gandhinagar', 2008, 'https://www.iitgn.ac.in', 25],
  ['iit-ropar', 2008, 'https://www.iitrpr.ac.in', 22],
  ['iit-patna', 2008, 'https://www.iitp.ac.in', 29],
  ['iit-mandi', 2009, 'https://www.iitmandi.ac.in', 31],
  ['iit-jodhpur', 2008, 'https://www.iitj.ac.in', 47],
  ['iit-tirupati', 2015, 'https://www.iittp.ac.in', 59],
  ['iit-palakkad', 2015, 'https://www.iitpkd.ac.in', 64],
  ['iit-jammu', 2016, 'https://www.iitjammu.ac.in', 65],
  ['iit-dharwad', 2016, 'https://www.iitdh.ac.in', null],
  ['iit-bhilai', 2016, 'https://www.iitbhilai.ac.in', null],
  ['iit-goa', 2016, 'https://www.iitgoa.ac.in', null],
  // ── Top-15 NITs (founding year = the REC-era establishment; NIRF-2024 engineering) ──
  ['nit-trichy', 1964, 'https://www.nitt.edu', 9],
  ['nit-surathkal', 1960, 'https://www.nitk.ac.in', 17],
  ['nit-rourkela', 1961, 'https://www.nitrkl.ac.in', 19],
  ['nit-warangal', 1959, 'https://www.nitw.ac.in', 21],
  ['nit-calicut', 1961, 'https://www.nitc.ac.in', 23],
  ['vnit-nagpur', 1960, 'https://www.vnit.ac.in', 26],
  ['nit-durgapur', 1960, 'https://www.nitdgp.ac.in', 43],
  ['nit-silchar', 1967, 'https://www.nits.ac.in', 45],
  ['mnit-jaipur', 1963, 'https://www.mnit.ac.in', 46],
  ['mnnit-allahabad', 1961, 'https://www.mnnit.ac.in', 49],
  ['nit-kurukshetra', 1963, 'https://www.nitkkr.ac.in', 63],
  ['manit-bhopal', 1960, 'https://www.manit.ac.in', 65],
  ['svnit-surat', 1961, 'https://www.svnit.ac.in', 66],
  ['nit-jalandhar', 1987, 'https://www.nitj.ac.in', 66],
  ['nit-hamirpur', 1986, 'https://www.nith.ac.in', 84],
  // ── Major IIITs (founding year; NIRF-2024 engineering) ──
  ['iiit-allahabad', 1999, 'https://www.iiita.ac.in', 84],
  ['iiitdm-kancheepuram', 2007, 'https://www.iiitdm.ac.in', 74],
  ['iiitm-gwalior', 1997, 'https://www.iiitm.ac.in', null],
  ['iiitdm-jabalpur', 2005, 'https://www.iiitdmj.ac.in', null],
  ['iiit-sri-city', 2013, 'https://www.iiits.ac.in', null],
];

// instituteId → curated FACTS row, for O(1) lookup.
const BY_ID = new Map(FACTS.map((f) => [f[0], f] as const));

/**
 * Curated content facts for one institute, or null if none is curated yet (the profile
 * degrades gracefully to cutoffs-only).
 *
 * The FACTS (established / website / nirfEng) come verbatim from the curated table above.
 * The sourced/licensed fields stay null/[] until the owner populates them — never fabricated:
 *   about        — TODO(owner): ONE original own-words factual sentence, or keep null. NEVER
 *                  copy aggregator/Wikipedia/brochure prose (copyrighted); prefer null.
 *   nirfOverall  — TODO(owner): NIRF 'Overall' category rank (source: nirfindia.org PDFs;
 *                  distinct from the engineering rank already curated above).
 *   accreditation— TODO(owner): NAAC grade / NBA program accreditation (source: NAAC/NBA
 *                  official records).
 *   fees         — TODO(owner): verified tuition/hostel/mess split per year (source: official
 *                  fee brochures / NIRF data PDFs). Do NOT fabricate the split.
 *   seatMatrix   — TODO(owner): seats per branch×category×quota×gender (source: JoSAA business
 *                  data / the institute seat matrix).
 *   placements   — TODO(owner): year-labelled avg/median/highest + recruiter names (source:
 *                  NIRF placement PDFs / official placement reports).
 *   photos       — TODO(owner): Wikimedia/CC-only images with TASL attribution — never
 *                  re-hosted from official sites.
 */
export function contentFor(instituteId: string): CollegeContent | null {
  const row = BY_ID.get(instituteId);
  if (!row) return null;
  const [id, established, website, nirfEng] = row;
  return {
    instituteId: id,
    about: null, // TODO(owner): one original own-words sentence, or keep null (prose is copyrighted)
    established,
    website,
    nirfOverall: null, // TODO(owner): NIRF 'Overall' rank (nirfindia.org PDFs)
    nirfEng,
    accreditation: null, // TODO(owner): NAAC grade / NBA accreditation (NAAC/NBA records)
    fees: null, // TODO(owner): verified tuition/hostel/mess split (official brochures / NIRF PDFs)
    seatMatrix: null, // TODO(owner): seats per branch×category×quota×gender (JoSAA seat matrix)
    placements: null, // TODO(owner): year-labelled avg/median/highest + recruiters (NIRF placement PDFs)
    photos: [], // TODO(owner): Wikimedia/CC-only, TASL attribution — never re-hosted
  };
}
