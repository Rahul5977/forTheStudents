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

## Build phases
1. **Data** — acquire + normalize 2020–2025 (+2016–2019 history) → new versioned dataset + crosswalk. *(started)*
2. **`@sc/forecast`** — the engine above; unit tests + **backtest harness** (predict 2024 from ≤2023).
3. **Integrate** — `/predict` + `/colleges/:id` return forecast + range + % + trend series (backward-compatible).
4. **Frontend** — trend chart + forecast band + % on predictor & analysis pages.
5. **Backtest report** — published accuracy vs held-out 2024/2025.

## Sources
JoSAA ORCR archive (josaa.admissions.nic.in) · github.com/seshaljain/josaa-scrape ·
github.com/Sbrjt/josaa-cutoffs · github.com/Quantum-Codes/JoSAA_2024 · Kaggle josaa datasets.
