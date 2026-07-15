# Student-Counselor Backend — Progress & Status

> **This file is the current state of the build.** Read `architecture.md` for the *target*, read this for *where we are* and *what's next*. Update this file after every change.

---

## 🟡 Current status: **Phase 0 + Phase 1 scaffolded (boilerplate)** — owner to fill logic

Architecture **approved with defaults** (2026-07-14). Phase 0 (Foundations) and Phase 1
(Auth & Identity) are scaffolded as boilerplate with `// TODO(owner)` markers. Not yet
deployed (needs AWS creds + `cdk bootstrap` + the Google OAuth / SMS TODOs filled).

**Next actions:**
1. Owner: fill `// TODO(owner)` blocks in `services/auth-identity` + `infra/lib/*` (Google OAuth secret, SMS/SNS for OTP, CORS/callback URLs), run `pnpm install && pnpm typecheck && pnpm test`, then `pnpm deploy:dev`.
2. Then start **Phase 2 (Catalog + Predictor)** — the CORE hook.

---

## How Claude uses these docs (every session)
1. Read `architecture.md` (target) → then this file (status).
2. Work only on the **current phase**; do the **next unchecked task**.
3. Scaffold **boilerplate + `// TODO(owner)` markers only** — do not invent business logic. Document each TODO's expected input/output.
4. After changes: tick the task, update **Changelog**, add an **ADR** entry if a decision was made.
5. Get owner review at each phase boundary before starting the next.

---

## Phase tracker

Legend: ⬜ not started · 🟡 in progress · ✅ done · ⛔ blocked

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Foundations (monorepo, CDK, CI/CD, shared libs, obs) | 🟡 | scaffolded; deploy pending AWS creds |
| 1 | Auth & Identity (Cognito, JWT, profile, roles) | 🟡 | scaffolded; owner fills logic + Google/SMS TODOs |
| 2 | Catalog + Predictor *(CORE)* | 🟡 | predictor+catalog built, seeded, deployed, wired to `/live`, tested e2e. Deferred: CloudFront-in-front-of-API, admin ingest UI, split predictor into own service |
| 3 | Planner *(CORE)* | ⬜ | choice list + List Doctor |
| 4 | Marketplace & Mentors | ⬜ | verification workflow |
| 5 | Booking, Payments & Sessions *(CORE)* | ⬜ | booking↔payment saga; video |
| 6 | Notifications & Timeline | ⬜ | event-driven |
| 7 | Admin & Ops | ⬜ | verification queue, moderation |
| 8 | Analytics & Reporting | ⬜ | streams → Athena |
| 9 | Hardening & Scale | ⬜ | load test to 5k rps, runbooks |
| 10 | Go-live & Seasonal Ops | ⬜ | canary, ramp automation |

### Phase 0 — Foundations
- [x] Monorepo (pnpm + turbo), `tsconfig.base`, `.nvmrc`, `.gitignore`, `.env.example`
- [x] `packages/shared` — logger, observability, errors, http (Hono factory), auth (JWT claims), ddb, ids, types
- [x] `packages/config` — validated env (zod)
- [x] `infra/` CDK app + per-stage config + Foundation stack (HTTP API + JWT authorizer + WAF) + Data stack (Users table)
- [x] CI workflow (typecheck, test, `cdk synth`)
- [x] LocalStack/DynamoDB-Local docker-compose
- [x] Deploy to `dev` (bootstrapped + deployed 2026-07-15)
- [ ] Provisioned-concurrency scheduled scaling (deferred to Phase 9)

### Phase 2 — Catalog + Predictor (CORE)
- [x] `@sc/catalog-core` — dataset (26 offerings) + predictor logic (chance/decorate/predict/chart), ported from frontend; 4 tests lock the math (rank 850 → 12/3/3)
- [x] Catalog DynamoDB table (`sc-dev-catalog`, versioned: `CATALOG#<v>` offerings + `CONFIG/ACTIVE` pointer)
- [x] `@sc/catalog` lambdalith — public routes `GET /predict`, `/predict/summary`, `/colleges`, `/colleges/:id`; **in-memory snapshot cache** (ADR-008, no Redis); CDN cache-control headers
- [x] Seed script (local + cloud); deployed to AWS dev; cloud table seeded (v2025.1)
- [x] Frontend `/live` "Live predictor" section → calls the real public `/predict`, shows Safe/Target/Reach from the cloud DB; redeployed to Amplify
- [x] e2e verified: local HTTP (12/3/3), deployed `/predict` (12/3/3, cache-control set), CORS from Amplify origin, predictor code in deployed bundle
- [ ] Deferred: CloudFront in front of the API (edge cache), admin cutoff-ingest UI, split `predictor` into its own Lambda (hottest-path scaling)

### Phase 1 — Auth & Identity
- [x] Cognito user pool (email + phone OTP), web client, Google IdP (guarded on secret), hosted UI
- [x] `services/auth-identity` lambdalith — routes: `/auth/bootstrap`, `GET/PATCH /me`, `PATCH /me/rank-prefs`, `POST /me/role`
- [x] handlers → domain → repo (Users DynamoDB) layers + DTOs (zod)
- [x] CDK service stack wiring routes behind the authorizer + table grants
- [x] **Deployed to AWS `dev`** (account 058264128057, ap-south-1) — Cognito + API GW + Lambda + DynamoDB + WAF
- [x] **Real cloud e2e green:** Cognito sign-up → real JWT (verified by API GW) → `/auth/bootstrap` → `/me` → `/me/rank-prefs` → item confirmed in cloud `sc-dev-users`
- [x] Frontend `.env.local` → Cognito mode (Hosted-UI redirect) against the deployed API
- [x] Fill `// TODO(owner)` — name sourcing, role→Cognito `custom:role` sync (+IAM), `user.bootstrapped`/`user.role_changed` events (+IAM), editable-vs-locked fields + normalize, generic UpdateExpression builder, rank-prefs cross-field rules, env bad-config alerting, role-claim decided (ADR-005). Remaining infra TODOs = Google OAuth secret + SMS/SNS (only needed for those login methods).
- [x] Local dev server (`pnpm --filter @sc/auth-identity dev`) with dev-auth shim → real frontend `/live` drives real backend + DynamoDB Local
- [x] e2e: `pnpm --filter @sc/auth-identity test` (9 ✓) + full HTTP loop (login → token → bootstrap → /me → rank-prefs → role) + frontend `/live` page live
- [ ] Real-Cognito login e2e on AWS — **blocked on owner AWS credentials** (Task 14)

---

## Open decisions — awaiting owner (mirrors architecture.md §15)

| # | Decision | Default (recommended) | Owner choice |
|---|---|---|---|
| 1 | DB path | **A: DynamoDB-only + Athena** | ✅ approved |
| 2 | Video provider | **100ms** | ✅ approved |
| 3 | IaC | **AWS CDK (TS)** | ✅ approved |
| 4 | API composition | **Lambdalith per service (Hono)** | ✅ approved |
| 5 | Payments gateway | **Razorpay** | ✅ approved |
| 6 | Auth | **Cognito** | ✅ approved |
| 7 | Monorepo home | **Same repo as frontend** | ✅ approved (`backend/` sibling of `student-counselor/`) |

_All decisions approved 2026-07-14 ("go with the defaults")._

---

## Decision log (ADRs)

> Short, append-only. One entry per real decision. Format: date · decision · why · alternatives.

- **2026-07-14 · ADR-000 · Docs-driven workflow.** `architecture.md` = target, `progress.md` = status; update both on every change. *Why:* keep design and code from drifting across sessions.
- **2026-07-14 · ADR-001 · Serverless-first, cache-hard, compute-not-query.** Lambda + DynamoDB + multi-layer cache; managed SFU for video; optional SQL off hot path. *Why:* seasonal scale-to-zero + read-dominated shareable load. *Alternatives:* ECS Fargate (pays while idle), Aurora-primary (idle cost + conn mgmt). *Status:* **accepted.**
- **2026-07-14 · ADR-002 · Approved stack defaults.** DynamoDB-only(+Athena), 100ms video, AWS CDK, lambdalith-per-service (Hono), Razorpay, Cognito, same-repo monorepo. *Why:* owner approved the recommended defaults.
- **2026-07-14 · ADR-003 · Per-service DynamoDB tables (not one single-table).** Clear ownership + independent scaling; streams per table. *Alternative:* one single-table design (harder to hand off per service).
- **2026-07-14 · ADR-004 · ARM64 (Graviton) + esbuild-bundled CJS Lambdas, extensionless internal imports.** Cheaper/faster cold start; avoids the ESM `.js`-extension vs bundler resolution friction.
- **2026-07-14 · ADR-005 · App role travels as Cognito `custom:role`.** Written by `switchRole`; read in `getPrincipal`. *Alternative:* `cognito:groups` (better for coarse RBAC — revisit if role logic grows).
- **2026-07-15 · ADR-006 · Dev-only auth conveniences.** Pre-sign-up auto-confirm trigger + `USER_PASSWORD_AUTH` + Hosted-UI implicit grant, gated to non-prod, so first cloud e2e needs no Google/SMS setup. Prod uses SRP/PKCE + real verification.
- **2026-07-15 · ADR-008 · Defer Redis; cache in Lambda memory.** ElastiCache isn't free (~$12+/mo). The cutoff dataset is small → load it from DynamoDB into Lambda module-scope on cold start, reuse across warm invocations (+ CloudFront for shared slices). Same compute-not-query outcome, $0. Revisit Redis only if profiling demands it.
- **2026-07-15 · ADR-009 · Phase 2 as one `catalog` lambdalith (v1).** Serves both college reads and the predictor from one service reading the Catalog table (in-memory snapshot). Architecture keeps predictor as its own service long-term (hottest path, independent scaling) — split when load justifies it. Predict/analysis routes are **public** (no auth): predictions are shared + cacheable.
- **2026-07-15 · ADR-007 · Cost target: near-free.** Keep it ~$0 in build/off-season and low-tens-$/mo at full peak. Levers: (1) auth cost = 0 by planning a **Cognito → Firebase Auth (or Google-direct JWT)** migration before high MAU; (2) **WAF off** until Phase 9 (`cfg.enableWaf=false`) — removed from dev; (3) **video is Phase-5 + revenue-funded** (₹~17 cost vs ₹100), deferrable, free-tier providers; (4) DynamoDB on-demand + no idle Aurora/EC2 + CloudFront always-free 1 TB. Details in architecture.md §11. *Cognito stays for now (free at current scale, working); swap when we approach the MAU threshold or on request.*

---

## Changelog

- **2026-07-15** — **Phase 2 (Catalog + Predictor) built end-to-end + deployed + tested.** New `@sc/catalog-core` (dataset + predictor logic, 4 tests) and `@sc/catalog` lambdalith (public `/predict`, `/predict/summary`, `/colleges`, `/colleges/:id`; Lambda-memory snapshot cache per ADR-008; CDN cache-control). Added versioned `sc-dev-catalog` table + seed script. Deployed to AWS dev + seeded cloud (v2025.1). Wired frontend `/live` "Live predictor" → real public `/predict`, redeployed to Amplify. Verified: local + deployed `/predict` = 12 Safe / 3 Target / 3 Reach, `/colleges/:id` analysis + chart, CORS from Amplify origin, predictor in deployed bundle. typecheck 6/6 ✓, catalog-core tests 4 ✓.
- **2026-07-15** — **Phase 0/1 security review + hardening.** Reviewed all backend/infra/frontend: no secrets in code, least-privilege IAM, zod-validated inputs, parameterized DynamoDB, no error leakage, explicit CORS, no PII in logs, dev-only code isolated/gated. **Fixed:** gated `USER_PASSWORD_AUTH` + OAuth implicit grant to non-prod, added `preventUserExistenceErrors` (anti-enumeration). Deferred to Phase 9: API-GW per-route throttling, stronger prod password policy, WAF-on. Typecheck 4/4 ✓.
- **2026-07-15** — **Observability + spend guardrail (CDK).** New `sc-dev-observability` stack: CloudWatch dashboard `sc-dev` (API GW requests/errors/latency, Lambda invocations/errors/throttles/duration/concurrency, DynamoDB capacity + request latency, at-a-glance error tiles) and an AWS **Budget** `sc-dev-monthly` ($10/mo) emailing `rahul.raj9237@gmail.com` at 50%/80% actual + 100% forecast (`cfg.alertEmail`/`cfg.monthlyBudgetUsd`). Deployed ✓.
- **2026-07-15** — **Frontend hosted on AWS Amplify (all-AWS, CloudFront-backed).** Static-exported the Next.js app (`output:'export'` + `trailingSlash` + `images.unoptimized`; split catch-all into a Server page with `generateStaticParams` over all screens + a client `ScreenRouter`; store/idToPath trailing-slash aware; Cognito redirect now uses `window.origin`). Created Amplify app `dy6751tudpsop`, `main` branch, manual-deployed the `out/` build (job 1 SUCCEED) → live at `main.dy6751tudpsop.amplifyapp.com`. Started `counsellor.kodexa.in` domain association (records emitted for Hostinger). Added Amplify URL + custom domain to `cfg.corsOrigins` → Cognito callbacks + API CORS updated (verified 6 callback URLs) and backend redeployed. **Pending: owner adds 2 CNAMEs at Hostinger → cert validates → custom domain goes live.**
- **2026-07-15** — **Cost rework + fixes.** Fixed Cognito Hosted-UI domain bug (`amazonaws.com` → `amazoncognito.com`) in output + frontend `.env.local` (was causing `DNS_PROBE_FINISHED_NXDOMAIN` on Sign in with Cognito). Made WAF optional (`cfg.enableWaf`, default off) and **removed it from dev** (redeployed; DELETE_COMPLETE) → dev ≈ $0/mo. Rewrote architecture.md §11 as a **near-free cost model** (ADR-007) + added §3.5 frontend-hosting/DNS for `counsellor.kodexa.in`. Corrected the earlier "thousands" estimate: that was Cognito-at-3-lakh-MAU + gross video; real target is ≈$0 build/off-season, ~$20–100/mo full peak if cost-optimized.
- **2026-07-15** — **Phase 1 deployed to AWS `dev` + real cloud e2e green.** `cdk bootstrap` + `deploy:dev` (4 stacks). Added (dev/staging only) a pre-sign-up auto-confirm Lambda trigger, `USER_PASSWORD_AUTH`, Hosted-UI implicit grant + `/live` callback, account-suffixed unique domain (ADR-006). Verified real flow: Cognito sign-up → JWT → deployed `/auth/bootstrap`+`/me`+`/me/rank-prefs` → item present in cloud `sc-dev-users`. Frontend `.env.local` → Cognito mode. Outputs recorded above. **Owner action pending: rotate the AWS access key exposed in chat; consider removing dev WAF (~$6/mo).**
- **2026-07-14** — **Phase 1 complete locally, end-to-end (frontend + backend + DB).** Filled all remaining backend TODOs (role→Cognito `custom:role` sync via `AdminUpdateUserAttributes` +IAM; `user.bootstrapped`/`user.role_changed` → EventBridge default bus +IAM; editable/locked fields + name normalize; generic `buildSet` UpdateExpression builder; rank-prefs cross-field rules + normalize; env bad-config structured alerting; role-claim ADR-005). Added local dev server (`@hono/node-server` + dev-auth shim, `POST /dev/login`) so the real frontend drives the real backend on DynamoDB Local. Added frontend `/live` page (dev + Cognito Hosted-UI modes) + `liveConfig/liveAuth/liveApi`. Verified: auth-identity tests **9 ✓**, `pnpm typecheck` 4/4 ✓, frontend `next build` ✓ (`/live` route), full HTTP loop login→token→bootstrap→/me→rank-prefs→role ✓, 3 rows in DynamoDB Local. **Still local only — AWS deploy (real Cognito JWT) blocked on owner creds.**
- **2026-07-14** — **Phase 1 (local dev): feedback loop + first TODO filled (owner, guided).** Added a local integration harness in `services/auth-identity` (`vitest.config.ts` points the SDK at DynamoDB Local via `DDB_ENDPOINT`; `test/helpers.ts` creates the table + fakes verified JWT claims; `test/auth.e2e.test.ts` drives the whole app in-process via `app.request()`). Filled the **display-name sourcing** TODO: added `name?` to `Principal` (`shared/src/auth.ts`, from the OIDC `name` claim) and wired it into `bootstrap` (`domain/profile.ts`). Added `@aws-sdk/client-dynamodb` as a test-only devDep. Verified: `pnpm --filter @sc/auth-identity test` (4 ✓), `pnpm typecheck` (4/4 ✓). No AWS used.
- **2026-07-14** — **Phase 0 + Phase 1 scaffolded.** Monorepo (pnpm+turbo), `packages/shared` + `packages/config`, `infra` CDK (data/auth/foundation/auth-service stacks), `services/auth-identity` lambdalith. Verified: `pnpm typecheck` (4/4 ✓), `pnpm test` (3 ✓), `cdk synth --context stage=dev` (4 stacks synth, Lambda bundled ✓). Deploy pending AWS creds + owner TODOs.
- **2026-07-14** — Exported HLD + LLD as an editable Excalidraw board: <https://excalidraw.com/#json=qxTGcHGRxwob_1rYeg1G5,ItJzbPT2eFo8gyY2I5psXg> (HLD layered architecture, caching ladder, Predictor cache-path, Booking/Payment saga).
- **2026-07-14** — Drafted `architecture.md` (HLD, per-service LLD, data model, caching, scaling, security, cost, tech stack, phase plan, API surface) and this `progress.md`. Status: awaiting approval.

---

## Deployed dev-stack outputs (2026-07-15 · ap-south-1 · acct 058264128057)

| Key | Value |
|---|---|
| API base URL | `https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com` |
| Cognito User Pool | `ap-south-1_OQv6ssgbO` |
| User Pool Client | `5f22b9n70k3bolqppvvrast0en` |
| Hosted UI domain | `https://sc-dev-058264128057.auth.ap-south-1.amazonaws.com` |
| Users table | `sc-dev-users` |
| Catalog table | `sc-dev-catalog` (seeded v2025.1, 26 offerings) |
| Predictor (public) | `GET {API}/predict` · `/predict/summary` · `/colleges` · `/colleges/:id` |
| **Frontend (Amplify)** | app `dy6751tudpsop` · **https://main.dy6751tudpsop.amplifyapp.com** |
| **Custom domain** | `counsellor.kodexa.in` (Amplify → CloudFront `d1m73c1l14jkpt.cloudfront.net`) — PENDING owner DNS at Hostinger |

Frontend `.env.local` points at these in Cognito mode. Cognito callbacks + API CORS allow all three origins (localhost, Amplify URL, custom domain). Tear down: `pnpm --filter @sc/infra run destroy -- --context stage=dev`; delete Amplify app `dy6751tudpsop`.

**Hostinger DNS to add (kodexa.in zone) for the custom domain:**
| Purpose | Type | Name | Value |
|---|---|---|---|
| SSL cert validation | CNAME | `_b58439fee0cb6feda31a4a6e9c4dc919` | `_2a39a1aad07abdab47479d35ec8a827d.jkddzztszm.acm-validations.aws` |
| Subdomain | CNAME | `counsellor` | `d1m73c1l14jkpt.cloudfront.net` |

**Cost note:** the only real fixed cost in this dev stack is the **WAF WebACL (~$5–6/mo)** — and it isn't associated with the API yet (association is a Phase 9 task). Consider removing WAF from the dev stack until Phase 9 to make dev ≈ $0. Everything else (Cognito Lite, DynamoDB on-demand, Lambda, HTTP API) is free-tier at dev volume.

## Notes / parking lot
- Confirm real peak numbers with owner (registered/concurrent) to size provisioned concurrency + DynamoDB floors.
- Get JoSAA round-result publish timestamps each season → drives pre-warm schedule.
- Decide recording retention window (safety vs privacy/DPDP).
- WhatsApp BSP choice (e.g., Gupshup/Interakt) for notifications.
