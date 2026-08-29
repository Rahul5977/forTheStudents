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
15. [Interview prep — likely questions from this project](#15-interview-prep--likely-questions-from-this-project)

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
| Mentors | `POST /mentor/apply` · `/mentor/verify/email` · `/mentor/documents/presign\|confirm` · `/mentor/submit` · `GET/PUT /mentor/profile\|availability` · public `GET /mentors` + `/mentors/:id/slots` |
| Booking | `POST /bookings` (Idempotency-Key) · `/bookings/:id/accept\|decline\|cancel` · `GET /sessions` · `GET /sessions/:id/student-prep` (mentor) · `POST /sessions/:id/join\|end\|rate` |
| Payments | `POST /payments/webhook` (signature-verified) |
| Notifications | `GET /notifications` · `POST /notifications/:id/read` · `/read-all` · `GET/PUT /notifications/prefs` |
| Admin (role **+ scope** gated) | `/admin/stats` · `/admin/audit` · `GET /admin/mentors[?status,q,cursor]` · `/admin/mentors/counts` · `/admin/mentors/:id` (+ `/documents/:docType/url`, `/fields/:field`, `/verify-docs`, `POST\|PATCH\|DELETE /interview`, `/review`, `/suspend\|reinstate`) · `/admin/bookings` · `/admin/users` · `/admin/admins` (superadmin) · `/admin/broadcast` |

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
| `backend/docs/ai-counsellor/Plan.md` · `progress.md` | **AI Counsellor** (bounded context #11): agentic Claude counsellor over the platform tools — three design iterations, HLD/LLD, tool surface, cost&scale architecture for 1M students, evals, phases C0–C5 + tracker |

---

## 15. Interview prep — likely questions from this project

> Grouped by how interviewers actually drill: an opener, then follow-ups that test whether you built it or just described it. Answer pointers reference the sections above — the answers are all in this repo.

### A. The resume-bullet openers (know these cold)

1. **"Walk me through the predictor end-to-end — from a student typing a rank to the result."** → §5.3: filter to competition set → quota selection (AI → HS-if-home → OS) → exam mapping (Adv for IIT, Main for the rest) → ratio buckets → forecast-based chance %. Follow-up: *"Where does each step run — edge, Lambda, or DB?"*
2. **"Your resume says 11,261 cutoffs across 121 institutes. Why is the dataset that small, and does size matter here?"** → It's the *served snapshot* (one year, final round). The point: the dataset being small and immutable-within-a-round is *the* architectural insight — it's why compute-not-query works. The full historical corpus behind the forecasts is 360,975 rows (§5.1).
3. **"1.5M candidates, result-day spikes — what actually breaks first at 50k concurrent, and how do you know?"** → Nothing before the origin: ~90% of reads die at CloudFront. The earliest failure signal is a *cache hit-ratio drop*, not CPU. Then: Lambda account concurrency (raised pre-season), then DynamoDB — which is on-demand and mostly idle anyway.
4. **"Why serverless? Defend it against a Fargate service behind an ALB."** → §2: scale-to-zero matches 10 idle months; spikes are predictable in *time* but not worth owning capacity for; small team. Concede honestly where containers win: steady 24×7 load, long-lived connections, WebSockets.

### B. Caching & performance (your third bullet — expect the deepest drilling)

5. "You cache predictor results at the CDN — but every student has a different rank. **How is personalized output cacheable?**" → The result is a pure function of (rank, category, state, filters), not identity; inputs are normalized into a stable cache key, so many students collapse onto one entry (§6).
6. **"How do you invalidate when a new round publishes?"** → Immutable versioned snapshots + atomic `activeVersion` pointer flip + one CDN invalidation. Rollback = flip back. No per-key busting.
7. **"What stops a cache stampede when that invalidation happens at peak?"** → `stale-while-revalidate`: the edge keeps serving stale while a single request revalidates; origin sees one miss, not 50k.
8. **"Why Lambda module memory instead of Redis/ElastiCache? When would you add Redis?"** → ADR-008: ~11k rows fit in process memory; Redis has a ~$12+/mo idle floor buying nothing. Add it only if profiling shows cold-start snapshot loads hurt at real scale.
9. **"What's your cold-start story, concretely?"** → ARM64 + esbuild bundles < 5 MB + lambdalith (fewer, warmer functions) + *scheduled* provisioned concurrency only for Jun–Jul, pre-warmed ahead of published round-result timestamps.
10. **"A cold Lambda must load 11k rows from DynamoDB — what does that do to p99, and how would you measure it?"** → It's the known p99 tail; bounded by a single bulk read of one partition (`CUTOFF#<version>`). Measure: CloudWatch p99 vs p50 split by cold-start (init duration present), plus the load-test harness.
11. **"Estimate the memory footprint of the snapshot and the per-request CPU cost."** → ~11k rows × a few hundred bytes ≈ single-digit MB; a request is a filter+sort over an in-memory array — microseconds to low ms. This is why misses are cheap and horizontal scaling is trivial.

### C. System design & architecture

12. **"Why one Lambda per bounded context instead of per-route functions or one monolith?"** → The middle ground: few enough to stay warm, separate enough for independent deploys, IAM surfaces, and blast radius (§2, §4).
13. **"How do services talk to each other?"** → They don't, synchronously. Domain events on EventBridge → SQS (+DLQ) → consumers. Ask yourself *why*: spikes must not cascade; a slow notification consumer can't slow a booking.
14. **"Design the booking flow. What are the failure modes?"** → Saga: REQUESTED → ACCEPTED → CONFIRMED(paid) → LIVE → ENDED → RATED. Payment only *after* mentor accept. Failures: double-submit (Idempotency-Key), payment-webhook replay (ledger keyed on provider event id), mentor no-show (state timeouts/TTL).
15. **"Where would you add a queue you don't have today, and where is a queue the wrong tool?"** → Wrong on the predictor read path (latency-bound, cacheable); right anywhere write bursts exceed a downstream's comfort (already: notifications, analytics).
16. **"The video calls — why isn't that on Lambda?"** → Media is long-lived, stateful, latency-sensitive — everything Lambda is bad at. Managed SFU carries media; Lambda only mints join tokens and handles webhooks.
17. **"How would you take this multi-region?"** → Honest answer: you mostly don't need to — CloudFront is already global, the origin is regional-single. If forced: DynamoDB global tables to ap-south-2, Route 53 failover; the hard part is Cognito, which doesn't replicate cleanly.

### D. DynamoDB & data modeling

18. **"Why DynamoDB over Postgres? What did you give up?"** → Known, few access patterns + scale-to-zero + no connection pools from Lambda. Gave up: ad-hoc queries (recovered via Streams → S3 → Athena) and cross-item transactions beyond what `TransactWriteItems` covers.
19. **"Walk me through the `bookings` table's GSIs. Why is one of them date-partitioned?"** → GSIs by student, by mentor, and `gsi3-byday` for admin views — partitioned by day so an admin console at 10k bookings/day never scans, and no single hot partition grows unbounded (§7).
20. **"How do you avoid hot partitions on result day?"** → The hot *read* path never touches DynamoDB (snapshot in memory). Writes are per-user keys (naturally spread). The one shared key — the cutoff snapshot — is read once per cold start, not per request.
21. **"How is the payments ledger idempotent?"** → Append-only events keyed `ACCT#id / EVT#ts#providerEvtId` + a GSI on the provider event id: a replayed webhook writes the same key → condition-failed → no double credit. Balance = fold over events.
22. **"What's your backup/recovery story?"** → PITR on all tables; the catalog is trivially rebuildable from the committed corpus (reseed); analytics lake is append-only S3.

### E. The algorithm & statistics (expect this if the interviewer is data-inclined)

23. **"Why is your default sort closing-rank-ascending and not chance-descending?"** → JoSAA allots the *highest choice you clear*, so the UI should read like a choice list. Chance-sort floats your weakest backups to #1 — actively harmful (§5.3). This is the best "product sense" answer in the project.
24. **"Your chance % — is it a real probability? Defend it."** → Two-tier honesty: when a forecast band exists, yes — P(admit) = Φ((R̂ − rank)/σ) against a backtested distribution (92.9% band coverage vs 80% target). The ratio fallback is explicitly a monotone communication aid, and the API labels which one you got (`chanceBasis`).
25. **"Why can't you compare a rank of 10,000 in 2020 with one in 2025?"** → The candidate pool grew ~0.87M → ~1.3M; ranks are normalized to percentiles per year, trend-fit in logit space, and rescaled by the projected pool (§5.4).
26. **"Why a median-of-six ensemble instead of one regression — or an LSTM?"** → ≤ 8 points per series: any deep model is theater. Six cheap estimators across two spaces (percentile vs absolute log-rank) hedge two failure modes: pool-growth distortion and ultra-elite seats whose absolute cutoff barely moves. Median = robust to any one estimator going wild.
27. **"How do you handle COVID years and the EWS quota introduction?"** → Anomaly weights: 2020/21 × 0.45; EWS series drop pre-2019 entirely (the quota didn't exist) and get `limitedHistory` flagged.
28. **"How did you validate the forecast? What surprised you?"** → Hold-out-a-year backtest. Surprise: filling the 2021–23 *data gap* cut median error 39.6% → 13.2% — data completeness beat every modeling idea (§5.5).
29. **"What's a preparatory rank and why did it almost poison your model?"** → IIT `P`-suffixed ranks are a *separate rank list*; mirrors stripped the flag on 715 rows, making SC/ST/PwD cutoffs look ~100× better. Caught by cross-checking mirrors against the official archive (§5.1).
30. **"Where does the model fail today?"** → Sparse series (new programs, PwD sub-pools), renamed institutes breaking series identity, home-state quota for GFTIs with thin curation, and it forecasts final-round only — round-to-round drift is unmodeled (the all-rounds corpus exists, unexploited).

### F. Data engineering & the scraper

31. **"The source has no API. How did you get the data?"** → Reverse-engineered the ASP.NET WebForms postback chain (`__VIEWSTATE`/`__EVENTVALIDATION` echoed per step, cascading dropdowns on one session cookie) — §5.2.
32. **"How do you make a 140-request scrape reliable against a flaky government site?"** → Partition-level resumability (per-type manifest), exponential-backoff retries, sha256 recorded at fetch time and re-verified at build, politeness delay, live round discovery.
33. **"Why commit the data to git instead of S3 or fetching at deploy time?"** → Immutable-once-published history: diffable, reviewable, versioned with the code that parses it; 3.6 MB gzipped. S3 adds a moving part for zero benefit at this size.
34. **"How do you know your scrape is correct?"** → Cross-validation: 61,460 overlapping rows against an independently-sourced corpus, zero rank mismatches — and the diff *found* real defects in the other source (round mislabel, stripped P-flags), which is what a good validation should do.
35. **"Two colleges renamed themselves across years. Why is that hard, and what's your fix?"** → Series identity is keyed on name; a rename splits one series into two short ones (worse forecasts). Fix: a curated alias crosswalk applied at parse time.

### G. Auth, security & correctness

36. **"Why Google-only login?"** → Users are minors: no password custody, no reset flows, no credential-stuffing surface. Cognito Hosted UI keeps OAuth out of our code.
37. **"How is RBAC enforced — and where could a client bypass it?"** → `custom:role` claim in the JWT, hierarchy-aware middleware server-side (`superadmin ⊇ admin ⊇ student`); per-admin permission scopes. Frontend gating is UX only — every admin route re-checks server-side.
38. **"A Razorpay webhook arrives twice, out of order, or forged — walk through each."** → Forged: signature verification. Twice: ledger idempotency key. Out of order: state machine only advances on legal transitions; stale events no-op.
39. **"How do you prevent user enumeration at signup?"** → Cognito `preventUserExistenceErrors` + identical responses either way.
40. **"Where are your secrets?"** → SSM Parameter Store (Google client secret); zero secrets in code or env-committed files; per-Lambda least-privilege IAM.

### H. Operations, cost & testing

41. **"What's on your dashboard, and which single metric pages you first?"** → API 5xx, Lambda errors/throttles, p95, DynamoDB throttles — but the *leading* indicator is CDN hit ratio; it degrades before anything else turns red.
42. **"How do you keep an AWS bill near zero, mechanically?"** → No idle-cost services (no NAT, no Redis, no WAF off-season, no provisioned concurrency off-season), on-demand billing everywhere, plus a $10 AWS Budget alarm as the tripwire (§10).
43. **"How would you load-test the result-day spike before the season?"** → k6/Artillery replaying the spike shape to 5k rps on the predictor with a realistic write mix; watch SLOs, hit ratio, throttles, cold-start p99, and *cost per 100k requests*.
44. **"What do your tests cover, and what's deliberately untested?"** → Pure packages (predictor, forecast, stats) unit-tested; services integration-tested against DynamoDB Local on isolated tables; deployed e2e against the live API. Untested by choice: the scraper's HTML parsing beyond golden partitions (validated by checksums + cross-source instead).
45. **"You deploy a bad cutoff dataset at peak. Recovery, step by step?"** → Snapshot versions are immutable: flip `activeVersion` back, one CDN invalidation, done in seconds. The bad version stays for forensics. This is the payoff of never mutating in place.

### I. Trade-offs you should volunteer before they ask

- **CAP-flavored:** predictor reads are eventually consistent by design (cached, versioned); payments are strongly consistent (conditional writes, ledger). Different flows, different consistency — deliberately.
- **The dataset in Lambda memory is a scale ceiling** — at ~100× more rows, module memory stops working; the documented path is Redis (ADR-008 reversal) or precomputed shards.
- **Single region** is accepted risk for a domestic, seasonal product; the mitigation is CDN + fast rebuild, not active-active.
- **`chanceBasis` duality** — shipping a calibrated number and a heuristic number side-by-side, labeled, instead of pretending one method covers everything.

---

## ⚖️ Data attribution & disclaimer

Cutoff data is sourced from the official **JoSAA Opening/Closing Rank archive** (`josaa.admissions.nic.in`), acquired with per-partition provenance and checksums. Predictions are **estimates for the coming season, not guarantees** — the UI always tells students to verify on josaa.nic.in. This project is not affiliated with JoSAA, NTA, or any institute.
