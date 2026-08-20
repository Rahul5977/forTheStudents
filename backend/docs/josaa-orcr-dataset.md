# JoSAA ORCR dataset — official, all rounds, 2020–2025

> **Status:** ACQUIRED + VALIDATED on disk. **Nothing served has changed** — no `DATASET_VERSION`
> bump, no reseed, `seed.ts` untouched. Promotion is `TODO(owner)` (§7).
> **Author:** Claude. **Owner:** Rahul.

---

## 1. What this is and why

`docs/forecast-data-acquisition.md` closed the 2021–2023 history gap using **third-party GitHub
mirrors**, and flagged re-deriving from the official record as a fallback. This track does that
re-derivation, and widens it: **every round, not just the final one**, for **all four institute
types**, direct from JoSAA.

Two things this buys:

- **Provenance.** The corpus no longer depends on repos that can vanish, go stale, or silently
  reshape. Every row is traceable to an official query, with a sha256 recorded at fetch time.
- **Round-level depth.** The corpus had **1 round per year**; it now has **all 35**. R1→R6 movement
  within a season is the signal behind "will this seat still be there in a later round?" — a
  question the product currently cannot answer at all.

## 2. Source and method

Official: `https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx`
("Archive of Opening and Closing Rank"). There is **no API**. It is an ASP.NET WebForms page with
cascading dropdowns, so one query is a stateful postback chain — each step must echo
`__VIEWSTATE`/`__EVENTVALIDATION` and every previously-chosen dropdown, on one session cookie:

```
GET page → ddlYear → ddlroundno → ddlInstype → ddlInstitute=ALL → ddlBranch=ALL
         → ddlSeatType=ALL + btnSubmit  ⇒  one HTML table = the whole partition
```

A **partition** is one `(year, round, instituteType)` triple — 140 of them. Selecting `ALL` for
institute/branch/seat-type means one request per partition rather than tens of thousands.

JoSAA's instype codes map to our `CollegeType`: `IIT`, `NIT`, `3IT`→IIIT, `CFI`→GFTI.

### Why a committed CSV artifact rather than fetching live

| | |
|---|---|
| **The data is immutable.** | A published round never changes. This is cold, append-only history — the ideal shape for a versioned artifact, the worst possible shape for a live dependency. |
| **The source can't serve traffic.** | A 6-step stateful postback taking ~4–15s per query, against a government host that is slow in-season and frequently down off-season. Unusable on a request path. |
| **Reproducibility.** | Committed + checksummed means the corpus is diffable and auditable. A mirror or a live scrape gives neither. |

Scalability comes from the **scraper being re-runnable per partition**, not from fetching on demand.

## 3. Layout

```
services/catalog/data/josaa/
  csv/josaa-<year>-r<round>-<TYPE>.csv   140 partitions   (gitignored — working dir)
  by-year/josaa-<year>.csv.gz            6 files, 3.7MB   (COMMITTED — canonical)
  final-round/josaa-<year>-<n>.csv       6 files          (gitignored — derived)
  manifest-<TYPE>.json                   per-type, written by the scraper
  manifest.json                          merged: provenance + sha256 per partition (COMMITTED)
```

Schema is the repo's existing 9-column history shape, so `parse.ts` reads it unchanged:
`Institute, Academic Program Name, Quota, Seat Type, Gender, Opening Rank, Closing Rank, Year, Round`

Only `by-year/*.csv.gz` + `manifest.json` are committed (~3.7MB): complete, versioned, and small.
The 140 raw partitions (~40MB) are regenerable and checksum-verified against the manifest.

## 4. Commands

```bash
pnpm --filter @sc/catalog josaa:rounds                       # which rounds exist per year
pnpm --filter @sc/catalog josaa:fetch -- --type IIT --from 2020 --to 2025
pnpm --filter @sc/catalog josaa:verify                       # integrity + coverage, writes nothing
pnpm --filter @sc/catalog josaa:build                        # rebuild the committed artifacts
```

Resumable and idempotent: a completed partition is skipped (`--force` to refetch), rounds are
discovered from the live dropdown, failures retry with exponential backoff, and a 1.2s delay
between requests keeps the load polite. **Adding 2026 is one command per type** — no code change.

## 5. Coverage

Rounds per year: 2020–2023 → R1–R6, **2024 → R1–R5**, 2025 → R1–R6. All 140 cells present.

| Type | Rows | Institutes | Quotas observed |
|---|---|---|---|
| IIT | 101,300 | 23, stable all years | `AI` only |
| NIT | 196,948 | 32, stable all years (incl. IIEST Shibpur) | `OS`, `HS`, `JK`, `GO`, `LA` — **no `AI`** |
| IIIT | 28,137 | 26, stable; growth is in programs (15→50) | `AI` only |
| GFTI | 34,590 | 29 → 47 (real roster churn) | `AI`, `HS`, `OS` |
| **Total** | **360,975** | | |

Every type: exactly the canonical 10 seat types, exactly 2 genders, **0 duplicate keys**,
0 empty/zero/non-numeric ranks, and row counts decaying monotonically across rounds (seats settle).

## 6. Cross-check against the mirror data served today

Each type was diffed, final round vs final round, against the mirror corpus in
`data/history/` + `data/josaa24.csv`, normalizing whitespace and stripping `P`.

| Type | Overlapping keys | Closing mismatches | Opening mismatches |
|---|---|---|---|
| IIT | 17,322 | **0** | **0** |
| NIT | 33,544 | **0** | **0** |
| IIIT | 4,764 | **0** | **0** |
| GFTI | 5,830 | **0** | **0** |

**The mirrors are faithful on rank values — 61,460 overlapping rows, zero disagreements.** That is a
genuinely reassuring result for the data already in production. The problems found are all in
*labelling and identity*, not in the numbers:

### 6.1 `josaa24.csv` is Round 5, stamped Round 6 — confirmed
JoSAA 2024 had no R6. Compared against each official 2024 round, the match is uniquely perfect at
**R5** (0 mismatches) and badly wrong elsewhere (R1: 870 mismatches, R4: 565). `seed.ts` stamps it
`round: 6`. Harmless for a final-round-only corpus; wrong the moment round is a real dimension.

### 6.2 Preparatory (`P`) rank flags are stripped in 4 mirror years — **the one substantive defect**
| Year | P-flagged rows in mirror | in official |
|---|---|---|
| 2020 | 333 | 333 ✓ |
| 2021 | **0** | **368** |
| 2022 | **0** | **95** |
| 2023 | **0** | **129** |
| 2024 | 186 | 186 ✓ |
| 2025 | **0** | **123** |

**715 preparatory ranks lost their flag.** Preparatory ranks are a *separate rank list*; because
`num()` (`parse.ts:34`) strips non-digits, a closing rank of `687P` is read as plain rank `687`,
making an SC/ST/PwD cutoff look one to two orders of magnitude better than reality. These years feed
the forecast trend. **The official files carry the flag for every year — re-deriving fixes this.**

### 6.3 Ten mirror rows the official archive suppresses
10 NIT Mizoram / NIT Sikkim `HS`/`OPEN` rows have closing ranks >1,000,000. The official archive's
max closing rank is capped just under 1,000,000 in every year, i.e. a 6-digit field limit on the NIC
page, not scraper loss. 0.005% of rows, and predictively meaningless (a >1M home-state closing rank
in a micro-state means the seat went unfilled). The matching `OS` row is always present.

## 7. TODO(owner) — integration decisions

Deliberately not done here; each changes what users see.

1. **`instituteId()` collision — highest severity, fix before anything else.**
   `enrich.ts:128` slices the short name to 46 chars, so distinct colleges collapse to one id:
   | id | fused institutes | rows |
   |---|---|---|
   | `international-institute-of-information-technol` | IIIT **Bhubaneswar** + IIIT **Naya Raipur** | 1,631 |
   | `national-institute-of-electronics-and-informat` | NIELIT ×5 campuses | 451 |
   | `national-institute-of-food-technology-entrepre` | NIFTEM ×3 campuses | 310 |

   54 official GFTI names → 47 ids. Two large, popular IIITs currently share one catalog identity.
   This is pre-existing and independent of this dataset.

2. **Take institute type from the source, not from the name.** `deriveType()` infers type by regex.
   It is *correct* on all 54 official GFTI names (verified — `International …` and `National
   Institute of Electronics and Information Technology` do not match its patterns). But the official
   `instype` code is now known per row and is authoritative; deriving is guesswork we no longer need.

3. **Resolve IIEST Shibpur's type.** JoSAA files it under `NIT`; `deriveType()` says `GFTI`.
   ~200 rows/year. Either is defensible — but the two must agree or it double-counts.

4. **Add the rename crosswalk** (the existing `TODO(owner)` at `enrich.ts:145`). Five GFTI renames
   break time series across year boundaries: NIFFT→NIAMT Ranchi, Pondicherry Engineering College→
   Puducherry Technological University, Institute of Technology GGV→School of Studies E&T GGV,
   and two NIFTEM relabels. Also IIIT Srirangam→IIIT Tiruchirappalli (2021) and IIIT Manipur→
   IIIT Senapati Manipur (2024, also a case change).

5. **Promote the corpus.** Point `seed.ts` at `data/josaa/by-year/*.csv.gz` (gunzip at seed time)
   instead of `data/history/*.csv` + `josaa24.csv`, bump `DATASET_VERSION`, reseed. This fixes §6.2
   and §6.1 in one move. Note the served-year question from the prior doc still applies: the max
   year becomes **2025**, rolling the served snapshot forward from 2024 — a product decision.

6. **Exploit round depth (the new capability).** The corpus now has R1→R6 per year. Worth modelling
   round-over-round drift so the product can answer "is this seat likely to survive to a later
   round?" — currently unanswerable. Requires a schema decision: today a series is keyed on
   final-round-per-year.

## 8. Outcome

**360,975 official rows, 140/140 partitions, zero gaps, zero fabricated values, all checksum-clean.**
Rank values in the mirror corpus were independently confirmed correct (61,460 rows, 0 mismatches);
the defects found are in round stamping, preparatory-rank flags, and institute identity. The corpus
went from 1 round per year to all rounds, and from third-party mirrors to the official record.
