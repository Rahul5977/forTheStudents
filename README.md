# 🎓 Student-Counselor — JEE/JoSAA Counselling Platform

> **Predict → Plan → Talk.** A rank-to-seat companion for the ~8-week JEE/JoSAA counselling window — engineered to idle at **≈ $0** for ten months and absorb **lakhs of students in minutes** when a round result drops.

<p>
  <img alt="stack" src="https://img.shields.io/badge/TypeScript-Node%2020-3178c6">
  <img alt="aws" src="https://img.shields.io/badge/AWS-Serverless-ff9900">
  <img alt="iac" src="https://img.shields.io/badge/IaC-AWS%20CDK-ff9900">
  <img alt="frontend" src="https://img.shields.io/badge/Frontend-Next.js%2014-000000">
  <img alt="region" src="https://img.shields.io/badge/Region-ap--south--1%20(Mumbai)-232f3e">
  <img alt="data" src="https://img.shields.io/badge/Data-Official%20JoSAA%20ORCR%202020--2025-2ea44f">
</p>

---

## 📖 Table of contents

1. [What this is](#1-what-this-is)
2. [The defining constraint (and how it shaped everything)](#2-the-defining-constraint)
3. [High-Level Design](#3-high-level-design)
4. [The nine bounded contexts](#4-the-nine-bounded-contexts)
5. [Data & methodology](#5-data--methodology)
   - [5.1 The dataset — official JoSAA ORCR](#51-the-dataset--official-josaa-orcr-all-rounds-20202025)
   - [5.2 Acquisition pipeline](#52-acquisition-pipeline)
   - [5.3 The prediction algorithm](#53-the-prediction-algorithm-two-layers)
   - [5.4 The forecast engine](#54-the-forecast-engine-projecting-cutoffs-forward)
   - [5.5 Backtest validation](#55-backtest-validation)
6. [Caching — why lakhs is cheap](#6-caching--why-lakhs-is-cheap)
7. [Data model (DynamoDB single-table patterns)](#7-data-model)
8. [Security & privacy](#8-security--privacy)
9. [Tech stack — every choice and why](#9-tech-stack--every-choice-and-why)
10. [Cost model](#10-cost-model)
11. [Repository layout](#11-repository-layout)
12. [Getting started](#12-getting-started)
13. [API surface](#13-api-surface)
14. [Docs index](#14-docs-index)

---

## 1. What this is

Every year ~1.4 million students take JEE, and then face **JoSAA counselling** — a multi-round process where you submit an ordered list of college-branch choices and an allotment algorithm gives you the *highest choice you clear*. Order the list badly and you can lose a seat you deserved, or a year.

The product turns that into a guided flow:

| Pillar | What it does | Where it lives |
|---|---|---|
| **Predict** | Rank in → reachable colleges out, bucketed **Safe / Target / Reach**, with home-state quota applied and a calibrated chance % from a forecast model | `services/catalog` + `packages/catalog-core` + `packages/forecast` |
| **Plan** | Drag colleges into an ordered choice list; a server-side **"List Doctor"** flags classic mistakes (no safe backups, reach-heavy top, duplicates, too-short lists) before you lock in | `services/planner`, `packages/catalog-core/src/doctor.ts` |
| **Talk** | Paid 1:1 video sessions with verified seniors at the target colleges — application, interview gate, availability, booking saga, payments, ratings | `services/marketplace`, `services/booking` |

Plus college-analysis pages (multi-year cutoff trends + forecast bands), a notifications pipeline, and a role-scoped admin console.

---

## 2. The defining constraint

Everything in this architecture follows from one observation about the load:

> **The product is seasonal, spiky, and read-dominated.**

- **Seasonal** — real usage is ~8 weeks (June–July). Ten months are near-idle. *Anything we pay for while idle is waste.*
- **Spiky** — traffic is event-driven: the minute a round result publishes, lakhs of students open the predictor **within minutes**. But the spikes are *predictable in time* (JoSAA publishes the schedule), so we can scale ahead of them instead of reacting.
- **Read-dominated & shareable** — predictor and analysis reads are computed over a **small dataset that is immutable within a round**. Most reads are identical across users → compute once, cache everywhere.
- **Small transactional core** — payments/bookings are low-volume but must be correct to the paisa and safe (many users are minors).

### Scale targets & SLOs

| Metric | Target |
|---|---|
| Registered students / season | up to **5 lakh** |
| Concurrent users at a round-result spike | ~**50k** bursting |
| Predictor origin rate (post-cache) | **5k req/s** burst |
| Predictor p95 (cache hit / miss) | **< 50 ms / < 300 ms** |
| Writes (choice list, booking) p95 | **< 250 ms** |
| In-season availability (core reads) | **99.9%** |
| Payments correctness | **100%** — idempotent, reconciled |

### The resulting stance (one line)

> **Serverless-first, cache-hard, compute-not-query — with managed services for the two things Lambda is bad at (video media, heavy SQL analytics).**

Why serverless won (argued honestly in `backend/docs/architecture.md §2`):

1. **Scale-to-zero matches seasonality** — ten idle months cost ~₹0 of compute. A provisioned fleet burns money year-round or forces seasonal teardown. This alone justifies it.
2. **Elasticity for free** — Lambda + DynamoDB on-demand absorb a 100× cliff with no capacity planning.
3. **Ops simplicity** for a small team running a 2-month product.

And where we deliberately **don't** use Lambda: video media runs on a managed WebRTC SFU (Lambda only mints join tokens); the scaling superpower is the caching ladder, not the compute. Alternatives (Fargate, Aurora-primary, EKS, self-hosted mediasoup, nano-lambda-per-route) were each considered and rejected — the middle ground chosen is **one "lambdalith" per bounded context**: few enough functions to stay warm, separate enough to own/deploy/scale independently.

---

## 3. High-Level Design

```text
                        ┌────────────────────────────────────────────────┐
                        │                    AWS ap-south-1              │
  Students / Mentors    │                                                │
  ┌──────────────┐      │   ┌──────────────┐      ┌────────────────────┐ │
  │  Next.js 14  │──────┼──▶│  CloudFront  │─────▶│ API Gateway (HTTP) │ │
  │  (Amplify)   │      │   │  edge cache  │      └─────────┬──────────┘ │
  └──────┬───────┘      │   └──────────────┘                │ JWT        │
         │ OAuth        │                          ┌────────▼──────────┐ │
  ┌──────▼───────┐      │                          │  Lambdaliths ×8   │ │
  │Cognito Hosted│      │                          │  (Hono routers,   │ │
  │ UI + Google  │      │                          │  ARM64, esbuild)  │ │
  └──────────────┘      │                          └────────┬──────────┘ │
                        │        ┌───────────────┬──────────┼──────────┐ │
                        │  ┌─────▼─────┐  ┌──────▼───┐  ┌───▼────────┐ │ │
                        │  │ DynamoDB  │  │EventBridge│ │ S3 + Athena│ │ │
                        │  │ 8 tables  │  │→ SQS → λ  │ │ (analytics)│ │ │
                        │  │ on-demand │  │ (+ DLQ)   │ └────────────┘ │ │
                        │  └───────────┘  └───────────┘                │ │
                        └────────────────────────────────────────────────┘
```

**Request lifecycle — the caching ladder.** A read climbs down only as far as it must:

```text
Client ─▶ CloudFront (edge)        ← ~90%+ of analysis & popular predictor slices stop here
        └▶ API Gateway ─▶ Lambda
                          ├▶ Lambda module memory (cutoff snapshot)  ← nearly all misses stop here
                          └▶ DynamoDB (source of truth)              ← cold start / writes only
```

**Write path & events.** Domain writes land in DynamoDB; domain events (`user.bootstrapped`, `booking.confirmed`, `payment.captured`, …) go to **EventBridge**, fan out through **SQS (+DLQ)** to consumers (notifications, analytics). DynamoDB **Streams** feed an S3 NDJSON lake queryable via **Athena** — analytics with zero always-on cost.

**Environments.** CDK stages (`dev`/`staging`/`prod` context) — currently a single `dev` stage on AWS **is** the live environment. 12 stacks: foundation (HTTP API + CORS), data, auth, observability, scaling/warmup, and one stack per service. Deploys are `cdk deploy` per stack; routes added by service stacks synth into the foundation stack (deploy both).

---

## 4. The nine bounded contexts

Each is an independent **lambdalith** (one Lambda, one Hono router, one deploy unit) owning its own table(s):

| Service | Owns | The interesting part |
|---|---|---|
| `auth-identity` | Users table, Cognito wiring | Google-only Hosted-UI login; role claim (`custom:role`) synced to Cognito; bootstrap-on-first-login |
| `catalog` | Cutoffs snapshot, predictor, college analysis | **The hottest path.** Compute-not-query: snapshot in Lambda memory, forecast bands precomputed at seed time (§5) |
| `planner` | Shortlist + choice list per user | Server-authoritative **List Doctor** — validates list structure against the same cutoff data the predictor uses |
| `marketplace` | Mentor profiles, verification, availability | Mentor state machine: applied → email/ID verified → **interview** → approved/rejected/suspended; public search with filters |
| `booking` | Booking saga, sessions | REQUESTED → ACCEPTED → CONFIRMED (paid) → LIVE → ENDED → RATED (+ DECLINED/CANCELLED); Idempotency-Key on create; date-partitioned GSI for admin views at scale |
| `payments` | Razorpay webhook, ledger | Signature-verified webhook; append-only event ledger; payment only *after* mentor accepts |
| `notifications` | Per-user feed + prefs | EventBridge rule → SQS → consumer Lambda; 90-day TTL |
| `admin` | Audit log, admin APIs | **RBAC hierarchy** superadmin ⊇ admin ⊇ student with per-admin permission scopes; append-only audit trail |
| `analytics` | S3 lake, reconcile jobs | Streams → NDJSON → Athena DDL; daily reconcile Lambda |

Shared packages: `@sc/shared` (auth principal, HTTP helpers), `@sc/config` (per-stage config), `@sc/catalog-core` (dataset types, parser, predictor — pure, unit-tested), `@sc/forecast` (the forecasting engine — pure, unit-tested).

---

## 5. Data & methodology

### 5.1 The dataset — official JoSAA ORCR, all rounds, 2020–2025

The corpus is scraped **directly from the official JoSAA "Archive of Opening and Closing Rank"** (`josaa.admissions.nic.in`) — not from third-party mirrors.

| | |
|---|---|
| **Coverage** | **360,975 rows** — every round of every year 2020–2025 (2024 ended at R5; others R1–R6), all four institute types |
| **IIT** | 101,300 rows · 23 institutes · quota `AI` only |
| **NIT** | 196,948 rows · 32 institutes (incl. IIEST Shibpur) · quotas `OS`/`HS`/`JK`/`GO`/`LA` |
| **IIIT** | 28,137 rows · 26 institutes · `AI` only |
| **GFTI** | 34,590 rows · 29→47 institutes (real roster churn) · `AI`/`HS`/`OS` |
| **Schema** | `Institute, Program, Quota, Seat Type, Gender, Opening Rank, Closing Rank, Year, Round` |
| **Integrity** | sha256 per partition recorded at fetch time; artifacts re-verified against it on every build |

**Why a committed CSV artifact instead of fetching live:** a published round **never changes** — this is cold, append-only history, the ideal shape for a versioned, diffable, checksummed artifact and the worst possible shape for a live dependency (the source is a slow ASP.NET site, frequently down off-season, with no API). Scalability comes from the scraper being re-runnable per partition, not from fetching on demand.

**Validation.** The official pull was cross-checked against the previously-used mirror corpus: **61,460 overlapping rows, zero rank disagreements** — and the diff surfaced real labelling defects in the mirrors (715 preparatory-rank `P` flags silently stripped; a 2024 file stamped Round 6 that is provably Round 5). Full provenance, validation chain, and per-year stats: `backend/docs/josaa-orcr-dataset.md`.

### 5.2 Acquisition pipeline

The source has no API — it's an ASP.NET WebForms page with cascading dropdowns. `services/catalog/scripts/josaa-orcr.ts` drives its stateful postback chain (echoing `__VIEWSTATE`/`__EVENTVALIDATION` at each step):

```text
GET page → ddlYear → ddlroundno → ddlInstype → ddlInstitute=ALL → ddlBranch=ALL
         → ddlSeatType=ALL + Submit   ⇒   one HTML table = one (year, round, type) partition
```

- **140 partitions** (35 year-rounds × 4 types), one HTTP round-trip chain each
- **Resumable & idempotent** — completed partitions are skipped via a per-type manifest; retries with exponential backoff; 1.2 s politeness delay
- **Rounds discovered live** from the year dropdown (no hardcoded round counts)
- `josaa-build.ts` re-verifies every partition against its recorded sha256, then folds them into per-year gzipped artifacts (**3.6 MB committed** for six years) + a merged provenance manifest

Adding next season is one command per type, zero code changes:

```bash
pnpm --filter @sc/catalog josaa:fetch -- --type IIT --from 2026 --to 2026
pnpm --filter @sc/catalog josaa:build
```

### 5.3 The prediction algorithm (two layers)

**Inputs:** `advRank` (JEE Advanced — for IITs), `mainRank` (JEE Main — for NIT/IIIT/GFTI), `category` (JoSAA seat type), `home` state, `gender` pool, plus filters.

**Layer 1 — request-time matching** (`packages/catalog-core/src/predict.ts`):

1. **Filter** to your competition set: `seatType == category`, `gender == pool`, quota ∈ {AI, HS, OS}.
2. **Quota selection** per institute+program: `AI` if present → else `HS` *if your home state matches the institute's* (the easier home-state cutoff, normalized matching: case/punctuation/`&`↔`and`) → else `OS`.
3. **Exam mapping:** IIT rows compare `advRank`; everything else `mainRank`.
4. **Ratio** = `yourRank / closingRank` → **Safe** (≤ 0.80) / **Target** (≤ 1.10) / **Reach**; only `0.2 ≤ ratio ≤ 1.6` is shown — hiding both hopeless reaches and colleges so far below your level that listing them is noise.
5. **Sort = closing rank ascending by default** (best college first, NIRF tiebreak). Deliberate: JoSAA allots the *highest choice you clear*, so the result should read like a choice list. Sorting by "chance %" (the naive default) floats your weakest backups to #1.

**Layer 2 — the forecast layer** decides the headline chance % (next section). Every result carries `chanceBasis: 'forecast' | 'ratio'` so the UI knows which method produced the number.

### 5.4 The forecast engine (projecting cutoffs forward)

`@sc/forecast` projects each series' closing rank to the target season with a calibrated uncertainty band. **Explainable statistics, no black-box ML** — every component can be printed and argued with. It runs **at seed time**, never per request; the request path only evaluates a normal CDF.

Per series (institute + program + seat type + gender track across years):

1. **Normalize for candidate-pool growth** — raw ranks aren't comparable across years (JEE Main "appeared" grew ~0.87 M → ~1.3 M over 2020–25), so each closing rank becomes a percentile `p = rank / poolSize(exam, year)`, then moves to **logit space** (unbounded, symmetric — safe for trend-fitting).
2. **Weight** each year: recency decay `0.71^age` (half-life ≈ 2 years) × anomaly weight — COVID years 2020/21 × 0.45, pre-2019 EWS rows dropped entirely (the quota didn't exist).
3. **Ensemble** — the **median of six estimators** drawn from two complementary spaces:
   - *percentile space* (corrects for pool growth): weighted-least-squares trend, Theil–Sen (robust to outlier years), recency-weighted flat
   - *absolute log-rank space* (stable for ultra-elite seats — top-IIT CSE cutoffs barely move even as the pool balloons): WLS trend, damped Holt, recency-flat

   All slope methods are anchored at the last observed point with a **damped horizon** (φ = 0.85), so long extrapolations flatten instead of running away.
4. **Back-transform** to a predicted closing rank **R̂**, rescaled by the *projected* target-year pool.
5. **Uncertainty band** — σ combines trend-fit prediction SE with year-over-year volatility (horizon-grown, capped), widened by a small-sample **Student-t** multiplier into an 80 % interval, then capped at ×3/×5/×9 of R̂ by confidence tier (high/medium/low). Sparse series degrade to two-point or flat methods with `limitedHistory` flagged.

**The chance number** (request time, `chance.ts`): the closing rank is modelled ~ Normal(R̂, σ), and

> **P(admit) = Φ((R̂ − yourRank) / σ)** — ≥ 0.8 → Safe · ≥ 0.4 → Target · else Reach

When a seat has no precomputed band, the ratio-based `pct` is the fallback — a smooth monotone map explicitly documented as a communication aid, not a probability.

### 5.5 Backtest validation

The engine is validated by holding out a year and forecasting it from earlier years only (`packages/forecast/src/backtest.ts`, results in `backend/docs/forecast-backtest.md` and `forecast-data-acquisition.md`):

| Held-out 2024, trained on ≤2023 | Result |
|---|---|
| Median absolute % error | **13.2 %** (was 39.6 % before the 2021-23 gap was filled) |
| Series within 25 % | **74.3 %** |
| 80 % band coverage | **92.9 %** (slightly conservative — bands err wide, i.e. safe) |

The single biggest accuracy lever was **data completeness**, not model sophistication — filling the 2021–2023 history gap cut the median error by two-thirds. That is why the acquisition pipeline (§5.2) is treated as first-class engineering.

---

## 6. Caching — why lakhs is cheap

Three layers, each with a clear invalidation story:

1. **CloudFront (edge)** — static assets, college-analysis pages (long TTL, identical for everyone), and predictor result slices (`s-maxage` + `stale-while-revalidate`, keyed by normalized inputs). Invalidated **only** on a cutoff publish — a handful of times per season.
2. **Lambda module memory** — the active cutoff snapshot (~11 k rows) loads from DynamoDB **once per cold start** and is reused across warm invocations. The predictor is CPU-over-a-small-array; it never queries the DB per request. (Redis/DAX was considered and **deliberately deferred** — ADR-008 — because it costs ~$12+/mo idle while module memory achieves the same compute-not-query outcome for $0 at this dataset size.)
3. **DynamoDB** — the durable, versioned system of record. Publish = write a new immutable snapshot version + atomic pointer flip; rollback = flip back. No fine-grained cache busting, no stampede (SWR serves stale while one request revalidates).

**Cache-key normalization** makes personalization cacheable: "your chance %" is a pure function of (rank, category, state, filters) — not identity — so many students collapse onto one cache entry.

Degradation is designed to **fail soft, never dark**: if payments or video are down, Predict + Plan (the core value) still work.

---

## 7. Data model

DynamoDB, on-demand billing, one table per aggregate, GSIs only for real access patterns:

| Table | Keys | GSIs | Access patterns |
|---|---|---|---|
| `users` | `USER#<id>` / `PROFILE` | email, phone | profile CRUD, lookup by email |
| `catalog` | `CUTOFF#<version>` / sort by series | — | bulk-load active snapshot version |
| `planner` | `USER#<id>` / `SHORTLIST` \| `CHOICELIST` | — | per-user lists, single-digit RCUs |
| `mentors` | `MENTOR#<id>` / `PROFILE` \| `AVAIL#<slot>` | status (sparse), college#topic | search, verification queue |
| `bookings` | `BOOKING#<id>` | student, mentor, **day-partitioned** | my sessions, mentor's sessions, admin-by-day (scale-safe: no full scans) |
| `ledger` | `ACCT#<id>` / `EVT#<ts>#<providerEvtId>` | providerEvtId | append-only; idempotent webhook ingestion; fold for balance |
| `notifications` | `USER#<id>` / `NOTIF#<ts>` \| `PREFS` | — | feed + prefs, TTL 90 d |
| `audit` | `ADMIN#<id>` / `ACT#<ts>` | entity | append-only admin trail |

Streams on bookings/ledger/users → EventBridge + the S3 analytics lake. PITR on all tables; TTL on ephemeral rows.

---

## 8. Security & privacy

Many users are minors — this is treated as a design input, not an afterthought.

- **Auth:** Cognito Hosted UI, **Google-only** login in production posture (password path retained but gated off); JWTs verified at the API; refresh tokens 90 d with silent renewal.
- **RBAC:** hierarchy `superadmin ⊇ admin ⊇ student`, enforced server-side (`requireRole` is hierarchy-aware); per-admin `permissions[]` scopes; superadmin-only admin management.
- **Anti-enumeration:** `preventUserExistenceErrors` on Cognito; dev-only auth shims (`USER_PASSWORD_AUTH`, implicit grant, auto-confirm) are **stage-gated to non-prod**.
- **Input hygiene:** zod-validated request bodies everywhere; parameterized DynamoDB expressions; no error-detail leakage; explicit CORS allowlist (no wildcards).
- **Payments:** webhook signature verification, Idempotency-Key on booking creation, append-only ledger reconciled to the paisa.
- **Least privilege:** every Lambda gets only its own table's IAM grants; no secrets in code (SSM for Google client secrets).
- **Auditability:** every admin action lands in an append-only audit table.
- Deferred to the hardening phase (documented, not forgotten): per-route throttling, prod password policy, WAF association.

---

## 9. Tech stack — every choice and why

### Languages & core

| Choice | Why |
|---|---|
| **TypeScript everywhere** (backend, infra, frontend, scripts) | One language across the whole repo → shared types travel from the CSV parser to the React component. `@sc/catalog-core` types are used by both the Lambda and the seed scripts. |
| **Node 20 on ARM64 (Graviton)** | ~20 % cheaper per ms than x86 with equal-or-better latency; Node's cold starts are among the best of Lambda runtimes. |
| **esbuild bundling** | Sub-5 MB bundles → fast cold starts; tree-shakes the AWS SDK v3 clients. |

### Backend

| Choice | Why |
|---|---|
| **Hono** (router) | Tiny (~20 kB), zero-dependency, runs identically on Lambda and on a local Node server — the same `app.ts` serves production and `tsx watch` dev without a shim layer. Express-class DX at a fraction of the cold-start weight. |
| **Lambdalith per bounded context** (not per-route nano-lambdas, not one mega-lambda) | Few enough functions to stay warm and keep cold starts rare; separate enough that each context owns its deploy, IAM surface, and blast radius. |
| **DynamoDB on-demand** as primary store | Scales to zero (seasonality!) and to lakhs with no connection pool — the classic Lambda↔RDS connection-storm problem never exists. Single-digit-ms reads. The access patterns are known and few, which is exactly when DynamoDB shines. |
| **No Redis** (ADR-008) | The hot dataset is ~11 k rows — it fits in Lambda module memory. ElastiCache's ~$12+/mo idle floor buys nothing here. Add it only if profiling at real scale proves cold-start dataset loads hurt. |
| **EventBridge + SQS (+DLQ)** | Decouples domain events from consumers; SQS load-levels write bursts; DLQs make failures visible instead of silent. |
| **S3 + Athena** for analytics (not Aurora) | Streams → NDJSON → SQL-on-demand. Zero always-on cost; ad-hoc SQL when needed. Aurora Serverless v2 stays a documented option if reporting outgrows it. |
| **zod** | Runtime validation at the trust boundary with static types inferred from the same schema — one source of truth. |
| **Vitest** | Fast, ESM-native, one test runner for pure packages and service integration tests (which run against DynamoDB Local on isolated tables). |

### Infrastructure & delivery

| Choice | Why |
|---|---|
| **AWS CDK (TypeScript)** | IaC in the same language as the app; stacks are diffable/reviewable; per-stage context (`--context stage=dev`) gives reproducible environments. 12 stacks: foundation, data, auth, observability, scaling, warmup + one per service. |
| **pnpm workspaces + Turborepo** | Strict, fast installs; workspace protocol keeps internal deps honest; turbo caches typecheck/test across the monorepo. |
| **API Gateway HTTP API** (not REST API) | ~70 % cheaper per million requests, lower latency, and JWT authorizers cover the need. |
| **Amplify Hosting** for the frontend | Static export served via CloudFront with zero servers; manual-deploy jobs are sufficient for a solo cadence. Custom domain `counsellor.kodexa.in`. |
| **CloudWatch dashboards + alarms → SNS email, AWS Budget** | Full-stack visibility (API 5xx, Lambda errors/throttles, p95, DynamoDB) and a $10/mo budget alarm — the guardrail that keeps "≈$0" honest. |

### Frontend

| Choice | Why |
|---|---|
| **Next.js 14 + React 18, static export** | The app is read-heavy and pre-renderable; `output:'export'` means no SSR servers to pay for or scale — CloudFront serves everything. Client-side data fetching hits the cached API. |
| **Cognito Hosted UI + Google IdP** | Zero password-handling liability (users are minors); OAuth flows outsourced to Cognito. |

### Data & scripts

| Choice | Why |
|---|---|
| **Committed, versioned CSV artifacts** (gzipped per-year) + sha256 manifest | The data is immutable once published — cold history belongs in git, not behind a flaky government site (§5.1). 3.6 MB for six years. |
| **tsx** for scripts | Run TypeScript scrapers/seeds directly, sharing the production parser — the seed pipeline and the Lambda parse the same bytes with the same code. |
| **Explainable statistics over ML** for forecasting | Six-estimator ensemble of classical methods (WLS, Theil–Sen, damped Holt) — auditable, unit-testable, and honest about uncertainty. With ≤ 8 points per series, a neural anything would be theater. The backtest (§5.5) shows the accuracy lever is data completeness, not model complexity. |

---

## 10. Cost model

Engineered near-free (ADR-007, full math in `architecture.md §11`):

| Phase | Cost |
|---|---|
| Off-season / idle | **≈ $0/mo** — no WAF, no NAT, no Redis, no provisioned concurrency; DynamoDB on-demand; Cognito Lite; free-tier Lambda/API/CloudFront |
| Build/dev (now) | ≈ $0 (only real fixed cost — WAF — was removed from dev) |
| Full peak season, cost-optimized | ~**$20–100/mo** (provisioned concurrency for the spike weeks + traffic) |

The three levers that kill the big numbers: CDN hit-ratio (the master dial), scheduled-not-permanent provisioned concurrency, and DynamoDB on-demand instead of provisioned floors.

---

## 11. Repository layout

```text
forTheStudents/
├── backend/
│   ├── infra/lib/            # CDK stacks (foundation, data, auth, per-service, observability…)
│   ├── packages/
│   │   ├── shared/           # auth principal, HTTP helpers
│   │   ├── config/           # per-stage config
│   │   ├── catalog-core/     # dataset types, CSV parser, predictor, list doctor  (pure, tested)
│   │   └── forecast/         # forecast engine: stats, candidates, ensemble, backtest (pure, tested)
│   ├── services/             # 8 lambdaliths: auth-identity, catalog, planner, marketplace,
│   │   │                     #   booking, notifications, admin, analytics
│   │   └── catalog/
│   │       ├── data/josaa/   # official ORCR corpus: by-year/*.csv.gz + manifest.json (committed)
│   │       └── scripts/      # josaa-orcr.ts (scraper) · josaa-build.ts (verify+build)
│   └── docs/                 # architecture.md, progress.md, per-topic deep dives (see §14)
└── student-counselor/        # Next.js 14 frontend (static export → Amplify)
```

---

## 12. Getting started

```bash
# prerequisites: Node 20+, pnpm 9
cd backend && pnpm install

pnpm typecheck && pnpm test          # whole monorepo (turbo)

# local dev loop (DynamoDB Local + dev-auth shim)
pnpm --filter @sc/catalog seed       # seed local catalog
pnpm --filter @sc/catalog dev        # catalog service on :8788

# dataset operations
pnpm --filter @sc/catalog josaa:rounds     # which rounds JoSAA published per year
pnpm --filter @sc/catalog josaa:verify     # integrity + coverage of the corpus
pnpm --filter @sc/catalog josaa:build      # rebuild committed artifacts from partitions

# deploy (needs AWS creds)
pnpm --filter @sc/infra run deploy:dev
```

Workflow contract: read `backend/docs/architecture.md` for the target, `backend/docs/progress.md` for current state; progress is logged and committed after every phase.

---

## 13. API surface

| Area | Endpoints (HTTP API, JWT unless public) |
|---|---|
| Predictor (public) | `GET /predict` · `/predict/summary` · `/colleges` · `/colleges/:id` |
| Auth | `POST /auth/bootstrap` · `GET /me` · `PUT /me/rank-prefs` |
| Planner | `GET/PUT /shortlist` · `GET/PUT /choice-list` · `POST /choice-list/reorder` · `GET /choice-list/doctor` · `POST /choice-list/export` |
| Mentors | `POST /mentor/apply` · `/mentor/verify/email\|id` · `GET/PUT /mentor/profile\|availability` · public `GET /mentors` + `/mentors/:id/slots` |
| Booking | `POST /bookings` (Idempotency-Key) · `/bookings/:id/accept\|decline\|cancel` · `GET /sessions` · `POST /sessions/:id/join\|end\|rate` |
| Payments | `POST /payments/webhook` (signature-verified) |
| Notifications | `GET /notifications` · `POST /notifications/:id/read` · `/read-all` · `GET/PUT /notifications/prefs` |
| Admin (role-gated) | `/admin/stats` · `/admin/audit` · `/admin/mentors/*` (queue, interview, review, suspend) · `/admin/bookings` · `/admin/admins` (superadmin) · `/admin/broadcast` |

---

## 14. Docs index

| Doc | What's in it |
|---|---|
| `backend/docs/architecture.md` | The full HLD/LLD: requirements, trade-off brainstorm, per-service LLD, data model, caching, scaling levers, security, cost, ADRs |
| `backend/docs/progress.md` | Current state + dated changelog of every phase (the workflow contract) |
| `backend/docs/josaa-orcr-dataset.md` | The official-data acquisition: source, method, validation chain, cross-check results, promotion TODOs |
| `backend/docs/prediction-algorithm.md` | The Safe/Target/Reach algorithm, worked examples, honesty & limits |
| `backend/docs/forecast-backtest.md` · `forecast-data-acquisition.md` | Backtest harness + the data-completeness experiment |
| `backend/docs/analytics-athena.md` · `runbooks.md` · `go-live.md` | Athena DDL, operational runbooks, launch checklist |

---

## ⚖️ Data attribution & disclaimer

Cutoff data is sourced from the official **JoSAA Opening/Closing Rank archive** (`josaa.admissions.nic.in`), acquired with per-partition provenance and checksums. Predictions are **estimates for the coming season, not guarantees** — the UI always tells students to verify on josaa.nic.in. This project is not affiliated with JoSAA, NTA, or any institute.
