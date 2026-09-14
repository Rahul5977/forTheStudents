// College Data Hub — the data contract (Phase 12).
//
// One JSON file per (institute, section) lives under
//   services/catalog/data/colleges/<instituteId>/<section>.json
// and MUST parse against the schema for that section below. The same schemas drive the
// validator (`hub:validate`), the bundle builder (`hub:build`), the runtime loader
// (`hubFor()`), and the research agents that write the files.
//
// DESIGN RULES (do not relax without an ADR):
//   • Every record that carries a fact has `sources[]` (≥1) and `asOf`. A number with no
//     source is not a fact — it is `null`. Never fabricate.
//   • Facts are `nullable()`, never `optional()`: a MISSING key is a schema error (the
//     collector forgot the field); a `null` is a deliberate "not found / not published".
//   • Prose surfaces (`about`, `summary`, FAQ answers, `note`s) are ORIGINAL own-words text
//     with hard max lengths. FACTS are not copyrightable; PROSE is — never paste aggregator,
//     Wikipedia, or brochure narrative (see content.ts for the standing legal ground rule).
//   • Aggregator hosts (Careers360, Shiksha, CollegeDunia, CollegePravesh, …) may only be
//     cited with confidence `secondary`, and never as the sole source of a number.
//   • Social handles: official institutional accounts + publicly self-branded student/alumni
//     creators (≥10k followers) only. Platform / handle / URL / follower band / content type.
//     No contact details, no private or minors' personal accounts.
//   • Objects are `.strict()` so a typo'd key fails loudly instead of silently dropping data.
import { z } from 'zod';

// ── Provenance ─────────────────────────────────────────────────────────────────────────

export const Confidence = z.enum(['official', 'secondary', 'inferred']);
export type Confidence = z.infer<typeof Confidence>;

const httpUrl = z.string().url().regex(/^https?:\/\//, 'must be an http(s) URL');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const Source = z
  .object({
    url: httpUrl,
    title: z.string().min(1).max(200),
    publisher: z.string().min(1).max(100), // "IIT Bombay", "NIRF", "JoSAA", "Careers360"
    accessedOn: isoDate,
    asOf: z.string().max(24).nullable(), // academic year / date the page states; null if undated
    confidence: Confidence,
  })
  .strict();
export type Source = z.infer<typeof Source>;

/** Mixed into every record that states a fact. */
const sourced = {
  sources: z.array(Source).min(1),
  asOf: z.string().max(24).nullable(),
};

/** Original own-words prose, bounded. `null` = "nothing written" (preferred over filler). */
const ownWords = (max: number) => z.string().min(1).max(max).nullable();

const instituteIdSchema = z.string().regex(/^[a-z0-9-]{2,64}$/, 'canonical slug');
const nonNegInt = z.number().int().nonnegative();
const money = z.number().nonnegative(); // INR, per year unless stated
const lpa = z.number().nonnegative(); // lakh per annum
const pct = z.number().min(0).max(100);

/** Hosts that are never `official`. Shared with the validator. */
export const AGGREGATOR_HOSTS = [
  'careers360.com',
  'shiksha.com',
  'collegedunia.com',
  'collegepravesh.com',
  'collegedekho.com',
  'getmyuni.com',
  'zollege.in',
  'collegesearch.in',
  'quora.com',
  'reddit.com',
] as const;

// ── Enums ──────────────────────────────────────────────────────────────────────────────

export const Enums = {
  instituteType: z.enum(['IIT', 'NIT', 'IIIT']),
  admissionRoute: z.enum(['josaa', 'csab', 'own-entrance', 'ugee', 'jee-adv-direct', 'gate', 'other']),
  clubCategory: z.enum(['technical', 'cultural', 'sports', 'literary', 'social', 'entrepreneurship', 'media', 'other']),
  festType: z.enum(['technical', 'cultural', 'sports', 'entrepreneurship', 'literary', 'other']),
  recruiterSector: z.enum(['software', 'core', 'finance', 'consulting', 'analytics', 'psu', 'research', 'startup', 'other']),
  platform: z.enum(['instagram', 'youtube', 'linkedin', 'x', 'facebook', 'telegram', 'other']),
  followerBand: z.enum(['10k-50k', '50k-100k', '100k-500k', '500k+']),
  creatorContent: z.enum(['campus-life', 'placement-prep', 'academics', 'vlog', 'other']),
  affiliation: z.enum(['student', 'alumni']),
  hostelGender: z.enum(['boys', 'girls', 'mixed', 'unknown']),
  // JoSAA seat-type + gender pool vocabulary (matches the cutoff corpus).
  seatType: z.enum(['OPEN', 'OPEN (PwD)', 'EWS', 'EWS (PwD)', 'OBC-NCL', 'OBC-NCL (PwD)', 'SC', 'SC (PwD)', 'ST', 'ST (PwD)']),
  quota: z.enum(['AI', 'HS', 'OS', 'GO', 'JK', 'LA']),
  gender: z.enum(['GN', 'F']), // GN = Gender-Neutral, F = Female-only (incl. supernumerary)
} as const;

// ── Sections ───────────────────────────────────────────────────────────────────────────

export const Profile = z
  .object({
    instituteId: instituteIdSchema,
    officialName: z.string().min(3).max(160),
    short: z.string().min(2).max(40),
    type: Enums.instituteType,
    established: z.number().int().min(1800).max(2100).nullable(),
    website: httpUrl.nullable(),
    about: ownWords(600), // 2–4 original sentences
    location: z
      .object({
        city: z.string().min(1).max(60),
        state: z.string().min(1).max(60),
        campusAcres: z.number().positive().nullable(),
        nearestAirport: z.string().max(80).nullable(),
        nearestRailway: z.string().max(80).nullable(),
        connectivityNote: ownWords(300),
        ...sourced,
      })
      .strict()
      .nullable(),
    admissionRoutes: z.array(
      z
        .object({
          route: Enums.admissionRoute,
          programs: z.array(z.string().min(1).max(80)), // e.g. ["B.Tech", "B.Tech + M.Tech dual"]
          note: ownWords(200),
          ...sourced,
        })
        .strict(),
    ),
    ...sourced,
  })
  .strict();

export const Academics = z
  .object({
    instituteId: instituteIdSchema,
    departments: z.array(
      z
        .object({
          name: z.string().min(1).max(120),
          programs: z.array(
            z
              .object({
                degree: z.string().min(1).max(40), // "B.Tech", "B.Arch", "Dual Degree", "BS-MS"
                name: z.string().min(1).max(120),
                durationYears: z.number().positive().max(7).nullable(),
                intake: nonNegInt.nullable(), // sanctioned UG intake if published
              })
              .strict(),
          ),
          ...sourced,
        })
        .strict(),
    ),
    facultyCount: z.object({ value: nonNegInt, ...sourced }).strict().nullable(),
    curriculumHighlights: z.array(z.object({ text: ownWords(200), ...sourced }).strict()).max(8),
    research: z.object({ note: ownWords(400), phdCount: nonNegInt.nullable(), ...sourced }).strict().nullable(),
  })
  .strict();

export const Placements = z
  .object({
    instituteId: instituteIdSchema,
    years: z.array(
      z
        .object({
          year: z.string().min(4).max(12), // as the institute labels it: "2024-25" or "2025"
          avgLpa: lpa.nullable(),
          medianLpa: lpa.nullable(),
          highestLpa: lpa.nullable(),
          pctPlaced: pct.nullable(),
          offers: nonNegInt.nullable(),
          ppos: nonNegInt.nullable(),
          higherStudiesPct: pct.nullable(),
          topRecruiters: z.array(z.object({ name: z.string().min(1).max(80), sector: Enums.recruiterSector }).strict()).max(30),
          branchWise: z
            .array(
              z
                .object({
                  program: z.string().min(1).max(120),
                  avgLpa: lpa.nullable(),
                  medianLpa: lpa.nullable(),
                  pctPlaced: pct.nullable(),
                })
                .strict(),
            )
            .nullable(), // only when a public branch-wise table exists
          ...sourced,
        })
        .strict(),
    ),
  })
  .strict();

export const SeatMatrix = z
  .object({
    instituteId: instituteIdSchema,
    josaaYear: z.number().int().min(2015).max(2100),
    rows: z.array(
      z
        .object({
          program: z.string().min(1).max(240), // JoSAA "Academic Program Name" (dual-degree names run long)
          quota: Enums.quota,
          seatType: Enums.seatType,
          gender: Enums.gender,
          seats: nonNegInt,
        })
        .strict(),
    ),
    ...sourced,
  })
  .strict()
  .nullable(); // null for own-entrance institutes (no JoSAA seats)

export const Fees = z
  .object({
    instituteId: instituteIdSchema,
    years: z.array(
      z
        .object({
          year: z.string().min(4).max(12),
          program: z.string().max(80).nullable(), // null = applies to all UG programs
          tuition: money.nullable(),
          hostel: money.nullable(),
          mess: money.nullable(),
          other: money.nullable(),
          totalYear: money.nullable(),
          currency: z.literal('INR'),
          ...sourced,
        })
        .strict(),
    ),
    scholarships: z.array(
      z
        .object({
          name: z.string().min(1).max(120),
          eligibility: ownWords(200),
          benefit: ownWords(200),
          ...sourced,
        })
        .strict(),
    ),
  })
  .strict();

export const CampusLife = z
  .object({
    instituteId: instituteIdSchema,
    summary: z.object({ text: ownWords(500), ...sourced }).strict().nullable(),
    clubs: z.array(
      z
        .object({
          name: z.string().min(1).max(100),
          category: Enums.clubCategory,
          note: ownWords(120),
          url: httpUrl.nullable(),
          ...sourced,
        })
        .strict(),
    ),
    fests: z.array(
      z
        .object({
          name: z.string().min(1).max(100),
          type: Enums.festType,
          month: z.string().max(20).nullable(), // "March", "Oct–Nov"
          footfall: nonNegInt.nullable(),
          url: httpUrl.nullable(),
          ...sourced,
        })
        .strict(),
    ),
    sports: z.array(z.object({ facility: z.string().min(1).max(100), ...sourced }).strict()),
  })
  .strict();

export const Hostels = z
  .object({
    instituteId: instituteIdSchema,
    count: nonNegInt.nullable(),
    capacity: nonNegInt.nullable(),
    occupancy: ownWords(120), // "single rooms from 3rd year; 2-sharing for freshers"
    messNote: ownWords(200),
    hostels: z.array(z.object({ name: z.string().min(1).max(80), gender: Enums.hostelGender }).strict()),
    ...sourced,
  })
  .strict()
  .nullable();

export const Alumni = z
  .object({
    instituteId: instituteIdSchema,
    notable: z
      .array(
        z
          .object({
            name: z.string().min(1).max(80),
            knownFor: ownWords(120), // public role only — "Co-founder, X" / "Nobel laureate"
            program: z.string().max(80).nullable(),
            batch: z.number().int().min(1900).max(2100).nullable(),
            ...sourced,
          })
          .strict(),
      )
      .max(25),
  })
  .strict();

const handle = z.string().min(1).max(60);

export const Social = z
  .object({
    instituteId: instituteIdSchema,
    official: z.array(
      z
        .object({
          platform: Enums.platform,
          handle,
          url: httpUrl,
          owner: z.string().max(80), // "Institute", "Placement Cell", "Techfest", "E-Cell"
          ...sourced,
        })
        .strict(),
    ),
    creators: z
      .array(
        z
          .object({
            platform: Enums.platform,
            handle,
            url: httpUrl,
            followerBand: Enums.followerBand,
            contentType: Enums.creatorContent,
            affiliation: Enums.affiliation,
            ...sourced,
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

export const Rankings = z
  .object({
    instituteId: instituteIdSchema,
    nirf: z.array(
      z
        .object({
          year: z.number().int().min(2016).max(2100),
          overall: z.number().int().positive().nullable(),
          engineering: z.number().int().positive().nullable(),
          ...sourced,
        })
        .strict(),
    ),
    qs: z.array(
      z
        .object({
          year: z.number().int().min(2010).max(2100),
          world: z.number().int().positive().nullable(), // lower bound of a band, e.g. 401 for "401-450"
          asia: z.number().int().positive().nullable(),
          ...sourced,
        })
        .strict(),
    ),
    naac: z.object({ grade: z.string().min(1).max(8), validTill: z.string().max(24).nullable(), ...sourced }).strict().nullable(),
  })
  .strict();

export const Faqs = z
  .object({
    instituteId: instituteIdSchema,
    items: z
      .array(z.object({ q: z.string().min(5).max(160), a: ownWords(500), ...sourced }).strict())
      .min(5)
      .max(15),
  })
  .strict();

// ── Registry ───────────────────────────────────────────────────────────────────────────

export const HUB_SECTIONS = {
  profile: Profile,
  academics: Academics,
  placements: Placements,
  'seat-matrix': SeatMatrix,
  fees: Fees,
  'campus-life': CampusLife,
  hostels: Hostels,
  alumni: Alumni,
  social: Social,
  rankings: Rankings,
  faqs: Faqs,
} as const;

export type HubSection = keyof typeof HUB_SECTIONS;
export const HUB_SECTION_NAMES = Object.keys(HUB_SECTIONS) as HubSection[];
export const isHubSection = (s: string): s is HubSection => Object.prototype.hasOwnProperty.call(HUB_SECTIONS, s);

/** One institute's full hub record: every section present (nullable where the section allows). */
export const CollegeHub = z
  .object({
    profile: Profile,
    academics: Academics.nullable(),
    placements: Placements.nullable(),
    'seat-matrix': SeatMatrix,
    fees: Fees.nullable(),
    'campus-life': CampusLife.nullable(),
    hostels: Hostels,
    alumni: Alumni.nullable(),
    social: Social.nullable(),
    rankings: Rankings.nullable(),
    faqs: Faqs.nullable(),
  })
  .strict();
export type CollegeHub = z.infer<typeof CollegeHub>;

/** Collector/verifier bookkeeping written next to the sections (`_meta.json`). */
export const HubMeta = z
  .object({
    instituteId: instituteIdSchema,
    collectedOn: isoDate,
    packets: z.array(z.string()),
    verifierReport: z
      .object({
        checked: nonNegInt,
        confirmed: nonNegInt,
        nulled: z.array(z.string()),
        notes: z.string().max(2000),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type HubMeta = z.infer<typeof HubMeta>;

/** The canonical roster row (`data/institutes.json`). */
export const RosterRow = z
  .object({
    id: instituteIdSchema,
    type: Enums.instituteType,
    officialName: z.string().min(3).max(160),
    short: z.string().min(2).max(40),
    city: z.string().min(1).max(60),
    state: z.string().min(1).max(60),
    website: httpUrl.nullable(),
    admissionRoute: Enums.admissionRoute,
    inCutoffs: z.boolean(), // appears in the JoSAA cutoff corpus (joins to the predictor)
    josaaType: z.enum(['IIT', 'NIT', 'IIIT', 'GFTI']).nullable(), // how JoSAA files it (IIEST = GFTI)
    josaaNames: z.array(z.string()), // every official spelling seen in the corpus
    nirfId: z.string().max(20).nullable(), // e.g. "IR-E-U-0306" (owner fills)
    pilot: z.boolean(),
  })
  .strict();
export type RosterRow = z.infer<typeof RosterRow>;
export const Roster = z.array(RosterRow);

/** Shape of the committed bundle the Lambda imports (`hub.bundle.json`). */
export const HubBundle = z
  .object({
    version: z.string().min(1),
    builtAt: z.string().min(1),
    roster: Roster,
    institutes: z.record(instituteIdSchema, CollegeHub),
  })
  .strict();
export type HubBundle = z.infer<typeof HubBundle>;
