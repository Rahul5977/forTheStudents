# Predictor v2 — Trend-based 2026 forecast with calibrated probability

Upgrade `/predict` from a **single-year (2024) lookup** to a **2020–2025 trend forecast**
of the 2026 closing rank, with a calibrated admission probability, per-seat confidence,
and a trend chart. Locked with the owner + informed by a research workflow (competitors,
data sources, methodology).

## Locked decisions (owner, 2026-07-16)
- **Data source:** official JoSAA ORCR (I source + normalize).
- **Coverage:** JoSAA only — IIT / NIT / IIIT / GFTI.
- **Forecast model:** weighted trend + confidence band (explainable, no black-box ML).
- **Output:** predicted 2026 rank **range** + calibrated **chance %** + Safe/Target/Reach + **trend chart**.

## Differentiation (research: competitors do none of these)
Careers360 / CollegeDekho / Shiksha / Vidyamandir / CollegePravesh all just compare your
rank to *last year's* closing rank + a fixed buffer → Safe/Moderate/Reach. "AI" is marketing.
Our edges: (1) a genuine **2026 forecast**, (2) **candidate-growth normalization** (percentile,
not raw rank — JEE Main went 6.1L→14.75L applicants), (3) **calibrated probability %**,
(4) **per-seat confidence** (volatile GFTIs wide, blue-chip CSE tight), (5) **backtested
accuracy** (predict 2024 from ≤2023, publish hit-rate). Stay free / no-login.

## Data plan
| Year | Source | Status |
|---|---|---|
| 2016–2020 (all rounds) | `seshaljain/josaa-scrape` CSVs — **schema identical to ours** | ✅ acquired (2018–2020 final rounds in `services/catalog/data/history/`) |
| 2024 | existing `josaa24.csv` | ✅ |
| 2021–2023, 2025 | `Sbrjt/josaa-cutoffs` (multi-yr) / Kaggle / official ORCR archive scrape | ⏳ to source + cross-validate |

- **Comparable point:** final-round closing rank per year; store all rounds.
- **Series key:** `(institute, program, category, quota, gender-pool)`; forecast each.
- **Normalization gotchas (build in):** OPEN=CRL vs reserved=category rank (never compare across); EWS phase-in (~2021 start); seat-matrix expansion; gender-neutral vs female pools; COVID 2020–21 regime break. Use **crosswalk alias tables** for institute/branch name churn — do NOT key on raw strings.
- Official archive = ASP.NET WebForms GridView (`josaa.admissions.nic.in/.../OpeningClosingRankArchieve.aspx`) → ViewState postback scrape, seasonal server.

## Forecast engine (`@sc/forecast`)
Per series: `rank → percentile p = R/N_year → logit y = ln(p/(1−p))`.
- **Weights:** `w_t = 0.71^(2026−t) × a_t`; COVID a_t≈0.3–0.5; pre-EWS down-weighted for OPEN/EWS.
- **Ensemble (median):** WLS trend · Theil-Sen slope · last-3-yr slope · Holt · recency-weighted flat.
- **Back-transform:** `R̂_2026 = logistic(ŷ) × N̂_2026` (N̂ = extrapolated 2026 pool).
- **Confidence:** Student-t prediction interval (auto-widens — 2026 is an extrapolation) ⊕ historical YoY volatility → `σ_total`.
- **Probability:** `P(admit) = Φ((R̂_2026 − yourRank)/σ_total)` → % → Safe/Target/Reach.
- **Edge cases:** <3-yr / new-EWS series → best-effort + "limited history" flag.

## Deep college page ("College Explorer", CollegePravesh-inspired)

A rich per-college profile, not just a cutoff row. The predictor and this page share one
dataset — the cutoffs section is the ORCR data we're already ingesting (per branch ×
category × quota × gender × year) + trend + 2026 forecast + "your chance". The **new** data
is *content* (fees, seat matrix, placements, about, photos).

**Section spec (v1 must-haves):**
- **Hero** — campus photo + name, type (IIT/NIT/…), NIRF rank, city/state, established, official-site link.
- **Cutoffs** — full opening/closing table per **branch × category × quota × gender**, with the multi-year trend + **2026 forecast band** + a "your rank vs this seat → chance %" widget (free from the forecast engine).
- **Seat matrix** — seats per branch × category × quota × gender (supply side; pairs with cutoffs).
- **Fee structure** — tuition + hostel + mess + total, per year and full-degree.
- **Placements** — avg / median / highest package + top recruiters (with a "source + year" caveat).
- **About & rankings** — overview, NIRF (overall + engineering), accreditation, location/how-to-reach.
- **Photo gallery** — a few licensed campus shots. *(later: reviews, FAQs, compare)*

**Data-model additions (new content layer, keyed by `institute_id`):**
- `college_info(institute_id, about, established, website, nirf_overall, nirf_eng, accreditation, city, state, lat/lng)`
- `college_fees(institute_id, program_id?, year, tuition, hostel, mess, other, total_year, total_degree, source)`
- `seat_matrix(year, institute_id, program_id, category, quota, seat_pool, seats)` *(already in the schema above)*
- `college_placements(institute_id, year, avg_lpa, median_lpa, highest_lpa, top_recruiters[], source)`
- `college_media(institute_id, image_url, kind{hero,gallery}, license, author, source_page, width, height)`

**Sourcing per field:** cutoffs/seat-matrix = JoSAA (public); fees/about/rankings/placements =
**NIRF public data** (nirfindia.org) + official brochures/sites (facts only, never copied prose) +
curated. Photos = **Wikimedia Commons / public-domain / CC only, with attribution** — see below.

**Photo strategy + the IP boundary (important):**
- ALLOWED: Wikimedia Commons (CC-BY-SA / CC0 / PD), other freely-licensed sources, or owner-obtained permission — each stored with `license + author + source_page` and credited in the UI.
- NOT ALLOWED: scraping + re-hosting images from official college websites (copyrighted). `// TODO(owner)` for any specific official photos you want to license.
- Fallback: a branded gradient/monogram placeholder for colleges with no free photo.

## Per-field data sources (finalized from research)
**Legal ground rule:** FACTS are not copyrightable — store/display verbatim (ranks, seats, fees,
established year, NIRF scores, salary figures, recruiter *names*). PROSE is copyrighted — never
copy aggregator/Wikipedia/brochure narrative; summarize in own words. Every content row stores
`source_url` + `academic_year`.

| Field | Primary source | Format | Notes |
|---|---|---|---|
| Cutoffs (OR/CR) | JoSAA ORCR (official) + repo history CSVs | CSV | already ingesting |
| Seat matrix | JoSAA seat-matrix (canonical) · `Quantum-Codes/JoSAA_2024` `seat_matrix.xlsx` (2024, verified) | XLSX/JSON | data=public-fact; re-derive from JoSAA for clean license |
| Fees (tuition/hostel/mess split) | **NIRF per-institute PDFs** (`IR-E-U-####.pdf`) for full coverage → override with official brochure split | PDF/HTML | NIT B.Tech tuition ≈ ₹62.5k/sem uniform anchor; IITs vary + income waivers. Store the split, not just total |
| Placements (avg/median/highest, recruiters) | NIRF PDFs (placement section) + official brochures | PDF | year-label every figure |
| About / NIRF / accreditation / established | NIRF site + official site (facts) + own-words summary | HTML | `enrich.ts` CURATED already has short/city/state/nirf/feesLakh — **absorb it** |
| Photos | **Wikimedia Commons CC/PD only** | img | see TASL rule below |

**Photo TASL rule (mandatory for CC-BY / CC-BY-SA):** store + render **T**itle · **A**uthor · **S**ource
(link to Commons file page) · **L**icense (name **+** deed link), plus "modified" if cropped.
CC0/PD carry no legal requirement (still credit for provenance) → prefer them. ShareAlike only
bites if you distribute an *adapted image* — resize/crop + display is fine. NEVER scrape/rehost
official-site photos (copyrighted, "all rights reserved"). A CC license clears copyright, **not
trademark** — don't imply endorsement or use a crest/logo as branding. Fallback = gradient monogram.

## Progress (updated live)
- ✅ **Phase 0** — canonical `instituteId` + year/round model; fixed a live NIT-Delhi/IIT-Delhi
  mislabel; `distinctInstitutes` + `buildSeries` (13,482 series over 2018–2024). (commit 55d6cae)
- ✅ **Phase 2** — `@sc/forecast` engine + backtest. Predict-2024-from-2018-20: median
  err 39.6%, **80% band coverage 82.6%** (well calibrated). (commit 3be1743, docs/forecast-backtest.md)
- ✅ **Phase 4** — forecast-backed `/predict` + `GET /colleges/:id/profile`; seed precomputes
  bands (11,261 rows, runtime engine-free). Deployed live @ josaa-2026f.1. (commits ff27175, 3fc1b4a)
- ✅ **Phase 5** — College Explorer page + predictor forecast band + trend chart. Deployed to
  counsellor.kodexa.in. (commit 3947f46)
- ⏳ **Phase 1** — acquire 2021–2023 + 2025 cutoffs (needs external download). Biggest accuracy win.
- ⏳ **Phase 3** — content: fees / seat matrix / placements / about / photos (needs sourcing + a
  photo-hosting decision). Endpoint shape + UI placeholders already shipped.
- ⏳ **Phase 6** — re-publish backtest once Phase 1 data lands.
- 🛠 **Phase 7 — production hardening (in progress, 2026-07-17)** — bring the predictor + catalog
  service to production grade without changing the served model. Five parallel tracks:
  1. **Input validation** — `@sc/catalog-core/validate` rejects present-but-invalid query params
     (rank ≤ 0 / > 2M / non-numeric, unknown category·sort·type) with a 400; absent fields still
     default (the UI's "no rank yet" state stays valid). Public/CDN cache never caches garbage.
  2. **Service resilience** — snapshot cache gains a soft-TTL re-check of `CONFIG/ACTIVE` (a reseed
     propagates to warm containers without a cold start) + in-flight load dedup; missing active
     version → clean 503 (`ServiceUnavailableError`). New `GET /colleges/compare?ids=` batch endpoint.
  3. **Content layer (Phase 3 kickoff)** — `@sc/catalog-core/content` serves curated *facts*
     (established, website, NIRF overall/eng, accreditation) into `/colleges/:id/profile`; licensed
     data (fees split / seat matrix / placements / CC photos) stays `TODO(owner)`, no fabrication.
  4. **CDN spike-survival** — CloudFront in front of the HTTP API so the existing `s-maxage`/SWR
     headers are actually honored (the lever for "lakhs in minutes"); additive, owner flips
     `NEXT_PUBLIC_API_URL` on deploy.
  5. **Data acquisition + backtest** — best-effort pull of 2021–2023/2025 from public sources with
     strict schema validation; local backtest of the accuracy delta. No prod reseed / no version
     bump — that stays `TODO(owner)`. See `docs/forecast-data-acquisition.md`.
  Boundary held: real logic for plumbing (validation, caching, CDN, resilience); `TODO(owner)` for
  owner-judgment data. Lands as a reviewable branch, not merged to main; nothing deployed/reseeded.

## Build phases (expanded)
0. **Canonical institute identity** *(critical — nothing else keys without it)* — the repo has **no
   stable per-institute id**: `getCollege(:id)` takes a *cutoff-row* id; institutes are grouped on the
   fly by name string. Build a deterministic `institute_id` (slug from normalized name) + crosswalk,
   expose `GET /colleges` (distinct institutes) keyed by it. This is the join key for every content table.
1. **Data** — acquire + normalize cutoffs 2020–2025 (+2016–2019) → versioned dataset + crosswalk. *(started)*
2. **`@sc/forecast`** — the engine above; unit tests + **backtest harness** (predict 2024 from ≤2023).
3. **Content data** — seat matrix + fees + about/NIRF + placements + **licensed photos** → the college-content dataset (curated + NIRF + Commons; attribution stored).
4. **Integrate** — `/predict` + a new **`GET /colleges/:id/profile`** returning forecast cutoffs + seat matrix + fees + placements + info + photos (backward-compatible).
5. **Frontend** — the deep **College Explorer** page (hero + cutoffs/trend/forecast + seat matrix + fees + placements + about + gallery) and the predictor trend/forecast band.
6. **Backtest report** — published forecast accuracy vs held-out 2024/2025.

## Sources
JoSAA ORCR archive (josaa.admissions.nic.in) · github.com/seshaljain/josaa-scrape ·
github.com/Sbrjt/josaa-cutoffs · github.com/Quantum-Codes/JoSAA_2024 · Kaggle josaa datasets.
