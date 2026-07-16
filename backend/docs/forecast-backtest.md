# Forecast backtest — honest accuracy report

The `@sc/forecast` engine is validated by holding out a year, forecasting it from the
earlier years **only** (no leakage), and scoring against the actual JoSAA closing rank.
The metric that matters most for a *chance* predictor is **band coverage**: an 80%
interval should contain the truth ~80% of the time. Point error is secondary (a wide
distribution of seats is inherently noisy) but we report it too.

## Current corpus (as of this commit)
2018 (R7), 2019 (R7), 2020 (R6), 2024 (R6) — a **3-year hole (2021–2023)** and no 2025.
So every backtest below is a *stress test*: predicting 2024 means extrapolating 4 years
from 2020, across the gap, with a COVID year (2020) as the last training point.

## Results (run: `pnpm --filter @sc/catalog exec tsx scripts/backtest.ts`)

| Hold-out | Train | Series | Median abs % err | Within 25% | **80% band coverage** |
|---|---|---|---|---|---|
| **2024** | 2018–2020 | 6,899 | 39.6% | 37.4% | **82.6%** ✅ |
| **2020** | 2018–2019 | 5,789 | 24.9% | 50.2% | 73.8% |

Spot checks (train `<2024` → predict 2024):
- **IIT Delhi CSE (AI):** 100→93→105 ⟹ pred **112**, actual **116** — near-exact.
- **IIT Bombay CSE (AI):** 59→63→66 ⟹ pred **76** (band 56–103), actual **68**.
- **NIT Trichy CSE (OS):** 1140→1373→781 ⟹ pred **962** (band 107–8658), actual **1224**.

## Reading this
- **Coverage is well-calibrated** (82.6% vs an 80% target on the hardest hold-out) — the
  band honestly reflects uncertainty. The 2020 hold-out under-covers (73.8%) because it's
  a 2-point extrapolation into a COVID regime break.
- **Point error (39.6%)** is the ceiling imposed by the data hole, not the method: the
  IIT Delhi/Bombay cases show near-exact forecasts where the trend is stable. Volatile
  mid-tier seats (COVID-era swings) drive the tail.
- **This is exactly why Phase 1 acquires 2021–2023 + 2025.** With contiguous recent years
  the extrapolation gap drops from 4 to 1; re-running this harness should tighten point
  error sharply while keeping coverage near 80%. Re-publish here after ingest.

## Method (see `predictor-v2-forecast-plan.md` for the full spec)
Ensemble median over percentile-space (rank/pool → logit) **and** absolute log-rank
estimators (WLS · Theil–Sen · recency-flat · damped Holt), band in bounded log-rank
space (Student-t prediction interval ⊕ YoY volatility, width-capped by confidence),
`P(admit) = Φ((R̂ − yourRank)/σ)`.
