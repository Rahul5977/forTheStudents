# Forecast data acquisition — filling the 2021–2023 (and 2025) history gap

> **Status:** DONE (local). All four missing years acquired + validated. 2021–2023 registered
> in `services/catalog/src/seed.ts`; 2025 staged on disk but intentionally NOT registered.
> **Nothing served changed** — no `DATASET_VERSION` bump, no reseed. Promotion = `TODO(owner)` (§7).
> **Author:** Claude (Track E). **Owner:** Rahul.

---

## 1. Why this matters

On disk the corpus was **2018 (R7), 2019 (R7), 2020 (R6), 2024 (R6)** — a **3-year hole (2021–2023)**
and no 2025. Every forecast series therefore jumped **2020 → 2024**, so the trend was fit on 4
points (one of them, 2020, a down-weighted COVID year) and then extrapolated 4 years across the
gap. `docs/forecast-backtest.md` already flagged this as the accuracy ceiling. This track closes the
gap from **public** JoSAA mirrors, validates every row against an independent source, and quantifies
the gain — **without touching the live snapshot**.

Target schema = the existing 9-column history shape produced by `parse.ts`:
`Institute, Academic Program Name, Quota, Seat Type, Gender, Opening Rank, Closing Rank, Year, Round`.
Files named `josaa-<year>-<round>.csv`, final round only.

---

## 2. Sources attempted — outcome per source

| Source (public) | What it holds | Outcome |
|---|---|---|
| `seshaljain/josaa-scrape` | 2016–2020, 9-col | **Origin of the in-repo 2018–2020 files** (md5-identical to `josaa-2018-7.csv`). Stops at 2020 — no missing years. |
| `Sbrjt/josaa-cutoffs` | `data.db.gz` SQLite, no Year col | Single-year snapshot, 11,261 rows = 2024. No missing years. |
| `Quantum-Codes/JoSAA_2024` | `josaa24.csv` | 2024 only (already in repo). |
| `sickboydroid/JoSAA-DataSet` | year/round JSON, 2020–2024 | **Rejected.** `roundN.json` is a cumulative all-rounds dump (2020 file = 54,662 rows / 9,340 keys). Neither last- nor first-occurrence-per-key reproduces the known 2020 final round (55% / 74% closing mismatch) — not reliably decodable to a single round. |
| `blossomedinautumn/JOSAA_DataAnalysis` | combined **2016–2022** CSV, explicit Year+Round | **Validated & used as the independent cross-check** (see §3). No 2023/2025. |
| `yashvasudeva1/end-to-end-college-predictor` | per-year masters **2021,2022,2023,2024,2025**, round+year cols | **PRIMARY** for 2021, 2022, 2023. |
| `Rama-Krishna43/JoSAA-College-Predictor` | 2023 / 2025 "full" CSVs | Identified as **Round 1** (matched yash R1 exactly, 0 mismatch) — not a final round. Not used. |
| `BulkTornado/JoSAA-Rank-Analyser-2025` | per-round 2025 TSVs | **PRIMARY** for 2025 (Round 6 = final). |
| `geekprince/JOSAA-2016-2025-IIT-Admission-Ranks` | IIT-only 2016–2025 | Noted; partial coverage (IIT only) — not needed once yash+BulkTornado validated. |

---

## 3. Validation — the chain of trust

Everything is anchored to the **known-good in-repo 2020 file** (from seshaljain). Comparisons
normalize institute/program whitespace and reduce ranks to the integer the parser computes
(`num()` strips `.` and `P`), so `"1393P"`, `"1393"`, `"1393.0"` compare equal.

1. **Anchor — blossomed reproduces known 2020 exactly.** blossomed 2020/R6 vs in-repo
   `josaa-2020-6.csv`: **8,990 / 8,990** known keys present, **0 closing-rank mismatches**, only **1**
   extra row (a junk non-breaking-space gender). ⟹ blossomed is a faithful JoSAA mirror.
2. **2021 — two independent mirrors are identical.** yash 2021/R6 vs blossomed 2021/R6:
   overlap **9,178**, **0 closing mismatches**, 0 only-A / 0 only-B. Perfect agreement.
3. **2022 — yash is a validated superset.** yash 2022/R6 (9,732) vs blossomed 2022/R6 (9,330):
   overlap 9,330, **0 closing mismatches**, yash carries **+402** more rows (more complete scrape).
   yash chosen; fully consistent with the independent source.
4. **2023 — trusted by pipeline consistency.** No independent *final-round* 2023 mirror exists
   (blossomed stops at 2022; Rama is R1; sickboydroid unreliable). But the **same yash pipeline**
   reproduced 2021 *identically* and 2022 *as a consistent superset* of the anchored source, so its
   2023/R6 extraction is trusted. Internal QC passed (§4).
5. **2025 — two independent sources agree.** BulkTornado 2025/R6 (11,943) vs yash 2025/R6 (a
   *partial* 5,410-row scrape): **0 closing mismatches** on all 5,410 shared keys. BulkTornado is the
   complete final round and is corroborated where they overlap. yash's own R6 was incomplete, so
   BulkTornado was chosen.

Sanity trend (IIT Bhubaneswar, Civil, AI/OPEN/Gender-Neutral closing rank):
`2020: 11238 → 2021: 12396 → 2022: 13624 → 2023: 14997 → 2025: 16156` — smooth and monotonic.

---

## 4. Data-quality gate (all four passed)

| Year (file) | Rows | Institutes | Seat types | Genders | Quotas | Bad ranks | Key overlap w/ 2024 |
|---|---|---|---|---|---|---|---|
| 2021 `josaa-2021-6.csv` | 9,178 | 114 | 10 | 2 | 6 | 0 | 88% |
| 2022 `josaa-2022-6.csv` | 9,732 | 114 | 10 | 2 | 6 | 0 | 90% |
| 2023 `josaa-2023-6.csv` | 10,365 | 119 | 10 | 2 | 6 | 0 | 93% |
| 2025 `josaa-2025-6.csv` | 11,943 | 128 | 10 | 2 | 6 | 0 | 88% |

- Seat types = the canonical JoSAA 10 (OPEN/EWS/OBC-NCL/SC/ST + their PwD variants); genders =
  `Gender-Neutral` / `Female-only (including Supernumerary)`; row counts all in the sane 6k–12k band.
- **0 conflicting duplicates** per (institute, program, quota, seatType, gender) key after dedupe.
- Normalization applied: institute whitespace collapsed to single space; ranks → positive integers
  (source `.0`/`P` suffixes reduced to the parser's computed value); junk (nbsp-gender) rows dropped;
  `Year` = the year, `Round` = 6; LF line endings — byte-format matches the existing history files.

**Caveats (pre-existing, not introduced here):**
- Prep ranks (`…P`) collapse to small integers once the `P` is stripped — identical to how the
  in-repo 2018–2020 files already behave.
- A few rows per year (7–56) have `open > close` — minor source artifacts; the parser keeps them; negligible.
- **2021 is a COVID year** — `@sc/forecast` already down-weights 2020/2021 (anomaly weight 0.45), so
  the added 2021 point is automatically discounted.

---

## 5. Files written

`services/catalog/data/history/` (new):
- `josaa-2021-6.csv` — 9,178 rows — yash R6 (≡ blossomed, 0 mismatch) — **registered** in `seed.ts`
- `josaa-2022-6.csv` — 9,732 rows — yash R6 (⊇ blossomed, 0 mismatch) — **registered** in `seed.ts`
- `josaa-2023-6.csv` — 10,365 rows — yash R6 (pipeline-validated) — **registered** in `seed.ts`
- `josaa-2025-6.csv` — 11,943 rows — BulkTornado R6 (≡ yash on overlap) — **NOT registered** (see §7)

`seed.ts` change is purely additive: 2021–2023 slot into `files[]`. Because `build-corpus` sets the
served snapshot = **max year in the corpus**, and 2021–2023 < 2024, **the served year stays 2024** —
they only deepen each series' history (verified: served snapshot year = `[2024]`, 11,261 served rows
unchanged; 5,106 top series now carry a 7-point trend 2018–2024 instead of 4).

---

## 6. Backtest delta — WITH vs WITHOUT the acquired years

Harness: `@sc/forecast` `backtestYear(series, testYear, minTrain=2)` — hold out a year, forecast it
from earlier years only, score against the actual closing rank. Metrics computed on the **matched set
of series scored in BOTH** runs (fair comparison). The WITHOUT-2024 row reproduces the repo's own
`docs/forecast-backtest.md` baseline exactly (39.6% / 37.4% / 82.6% on 6,899 series) — a sanity check
that the harness is invoked correctly.

### Held-out 2024 — isolates the value of filling the 2020→2024 gap (this is the served year)
`WITHOUT` trains on {2018, 2019, 2020}; `WITH` trains on {2018 … 2023}. Matched subset = 6,899 series.

| Metric | WITHOUT | WITH | Δ |
|---|---|---|---|
| median abs % error | 39.6% | **13.2%** | **−26.4 pp** (~67% relative) |
| within 10% | 17.4% | **39.3%** | +21.8 pp |
| within 25% | 37.4% | **74.3%** | +36.9 pp |
| 80% band coverage | 82.6% | 92.9% | +10.3 pp |

Plus **coverage of the predictor grows**: series with enough history to be scored rises 6,899 → 8,942.

### Held-out 2025 — secondary check
`WITHOUT` trains on {2018, 2019, 2020, 2024}; `WITH` trains on {2018 … 2024}. Matched subset = 7,615.

| Metric | WITHOUT | WITH | Δ |
|---|---|---|---|
| median abs % error | 11.7% | 11.2% | −0.5 pp |
| within 25% | 74.6% | 76.7% | +2.1 pp |
| 80% band coverage | 91.1% | 95.4% | +4.3 pp |

The 2025 gain is small **by design**: both runs already anchor on the adjacent 2024 point, so the
intermediate years only refine slope/band. The dramatic 2024 result is the true measure of the lever —
a mid-series gap hurts far more than a fresh one-year extrapolation.

**Calibration note:** the WITH bands nudge *above* the 80% target (92.9% on 2024) — slightly wide /
conservative, i.e. safe. If the owner wants to re-tighten the interval multiplier after promotion,
that is a forecast-tuning constant (`TODO(owner)`), not a data problem.

_Reproduce locally:_ the comparison script reads the CSVs directly and calls the public harness — run
via `pnpm --filter @sc/forecast exec tsx <script>` (script kept out of the repo; ~30 lines calling
`parseCorpus`→`buildSeries`→`backtestYear` on the two file sets above).

---

## 7. TODO(owner) — how to promote (nothing below was done here)

1. **Ship the improved 2024-snapshot forecasts (2021–2023 already registered).**
   - Bump `DATASET_VERSION` in `packages/catalog-core/src/types.ts` (e.g. `2024.1` → `2024.2`).
   - Reseed: local `pnpm --filter @sc/catalog seed`; cloud
     `TABLE_CATALOG=sc-<env>-catalog AWS_REGION=ap-south-1 tsx services/catalog/src/seed.ts`.
   - Verify: `GET /colleges/:id` chart now shows a 2018→2024 history; forecast bands recomputed.

2. **Roll the served cycle forward to 2025 (deliberately deferred — product decision).**
   `josaa-2025-6.csv` is acquired + validated on disk but **not** in `files[]`, because registering it
   makes 2025 the max year and flips the served snapshot **2024 → 2025** (changes which admission year
   users see). When that call is made: add
   `{ text: read(join(historyDir, 'josaa-2025-6.csv')) }` to `files[]`, bump `DATASET_VERSION`, reseed.

3. **(Optional) Verified candidate-pool figures.** `packages/forecast/src/candidates.ts` already carries
   approximate 2021–2025 JEE Main/Advanced "appeared" counts behind its own `TODO(owner)`; swapping in
   the verified NTA/JAB numbers sharpens percentile normalization further.

4. **(Optional) Deeper history.** 2016/2017 final rounds are available in both seshaljain and blossomed
   if even longer trends are wanted — not required for the gain above.

**Primary-source fallback** (if the owner wants to re-derive from the official record rather than a
mirror): JoSAA publishes each year's Opening/Closing-Rank archive at `josaa.nic.in` → *"Archive of
… OR-CR"* (per year, per round). The mirrors used here match that data where cross-checked against the
in-repo 2020 file.

---

## 8. Outcome summary

**All four target years acquired and validated — zero fabricated numbers.** 2021 and 2022 confirmed
against an independent mirror (0 closing mismatches); 2023 trusted via pipeline consistency; 2025
confirmed against a second independent source on the full overlap. Filling the gap cuts median 2024
forecast error from **39.6% → 13.2%** and doubles within-25% accuracy. Served data is untouched;
promotion is a version-bump + reseed the owner controls.
