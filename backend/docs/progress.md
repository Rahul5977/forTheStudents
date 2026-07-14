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
| 2 | Catalog + Predictor *(CORE)* | ⬜ | the hook; caching-heavy — **next** |
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
- [ ] Deploy to `dev` (owner — needs AWS creds + `cdk bootstrap`)
- [ ] Provisioned-concurrency scheduled scaling (deferred to Phase 9)

### Phase 1 — Auth & Identity
- [x] Cognito user pool (email + phone OTP), web client, Google IdP (guarded on secret), hosted UI
- [x] `services/auth-identity` lambdalith — routes: `/auth/bootstrap`, `GET/PATCH /me`, `PATCH /me/rank-prefs`, `POST /me/role`
- [x] handlers → domain (`// TODO(owner)`) → repo (Users DynamoDB) layers + DTOs (zod)
- [x] CDK service stack wiring routes behind the authorizer + table grants
- [ ] Owner: fill `// TODO(owner)` — ✅ name sourcing (OIDC `name` claim → profile); pending: role→Cognito attr, mentor gating, SMS role, Google secret
- [ ] e2e auth test — 🟡 local integration harness green (bootstrap · idempotency · name sourcing · /me · 404); real-Cognito login e2e pending Phase-1 infra

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

---

## Changelog

- **2026-07-14** — **Phase 1 (local dev): feedback loop + first TODO filled (owner, guided).** Added a local integration harness in `services/auth-identity` (`vitest.config.ts` points the SDK at DynamoDB Local via `DDB_ENDPOINT`; `test/helpers.ts` creates the table + fakes verified JWT claims; `test/auth.e2e.test.ts` drives the whole app in-process via `app.request()`). Filled the **display-name sourcing** TODO: added `name?` to `Principal` (`shared/src/auth.ts`, from the OIDC `name` claim) and wired it into `bootstrap` (`domain/profile.ts`). Added `@aws-sdk/client-dynamodb` as a test-only devDep. Verified: `pnpm --filter @sc/auth-identity test` (4 ✓), `pnpm typecheck` (4/4 ✓). No AWS used.
- **2026-07-14** — **Phase 0 + Phase 1 scaffolded.** Monorepo (pnpm+turbo), `packages/shared` + `packages/config`, `infra` CDK (data/auth/foundation/auth-service stacks), `services/auth-identity` lambdalith. Verified: `pnpm typecheck` (4/4 ✓), `pnpm test` (3 ✓), `cdk synth --context stage=dev` (4 stacks synth, Lambda bundled ✓). Deploy pending AWS creds + owner TODOs.
- **2026-07-14** — Exported HLD + LLD as an editable Excalidraw board: <https://excalidraw.com/#json=qxTGcHGRxwob_1rYeg1G5,ItJzbPT2eFo8gyY2I5psXg> (HLD layered architecture, caching ladder, Predictor cache-path, Booking/Payment saga).
- **2026-07-14** — Drafted `architecture.md` (HLD, per-service LLD, data model, caching, scaling, security, cost, tech stack, phase plan, API surface) and this `progress.md`. Status: awaiting approval.

---

## Notes / parking lot
- Confirm real peak numbers with owner (registered/concurrent) to size provisioned concurrency + DynamoDB floors.
- Get JoSAA round-result publish timestamps each season → drives pre-warm schedule.
- Decide recording retention window (safety vs privacy/DPDP).
- WhatsApp BSP choice (e.g., Gupshup/Interakt) for notifications.
