# Student-Counselor Backend — Progress & Status

> **This file is the current state of the build.** Read `architecture.md` for the *target*, read this for *where we are* and *what's next*. Update this file after every change.

---

## 🟡 Current status: **Phases 0–10 LIVE on AWS (`dev` stage = production) · Phase 11 in progress**

Everything through Phase 10 is built, deployed to `ap-south-1` and verified (see the phase tracker +
the deployed-outputs section below). The AI Counsellor (bounded context #11) is planned separately in
`docs/ai-counsellor/`. **Phase 11 — Mentor Onboarding, Mentor Dashboard & Admin Console** is being
built packet-by-packet (see the Phase 11 section) from `CLAUDE_CODE_LOOP_PROMPT.md` at the repo root.

**Next actions:**
1. Finish the open Phase 11 packet (lowest-numbered unchecked task), `pnpm typecheck && pnpm test`, tick it here.
2. Owner: Google Workspace service-account credential for packet 5 (Calendar/Meet) → SSM secrets blob (`GOOGLE_SA_JSON`, `GOOGLE_CALENDAR_IMPERSONATE`). Until then the stub provider is used.

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
| 2 | Catalog + Predictor *(CORE)* | ✅ | predictor+catalog built, real JoSAA data (enriched + HS quota), seeded, deployed, wired to main predictor screen, docs + tests + alarms, e2e green (18/18). Deferred: CloudFront-in-front-of-API, admin ingest UI, split predictor into own service |
| 3 | Planner *(CORE)* | ✅ | shortlist + ordered choice list + List Doctor + optimistic concurrency; **deployed + authed e2e 12/12**; **frontend wired into `/live`** (add-from-predictor, reorder, remove, server-side doctor, export) + redeployed to Amplify. Deferred: PDF render (TODO owner); persisting the dummy main screens |
| 4 | Marketplace & Mentors | ✅ | mentor apply → verify (.ac.in OTP + ID stub) → PENDING_REVIEW → admin approve → public search; availability + optimistic concurrency; events emitted. **Deployed + authed e2e 12/12**; wired into `/live` (become-a-mentor + browse) + Amplify. Deferred: real S3 ID upload + SES/SNS OTP (owner); admin console = Phase 7 |
| 5 | Booking, Payments & Sessions *(CORE)* | ✅ | booking↔payment **saga** (atomic slot-hold, idempotency, exactly-once ledger) + session lifecycle (join/end/rate) + cancel/refund. **Deployed + cross-service e2e 12/12**; wired into `/live`. Razorpay + SFU video = boilerplate/TODO(owner) per architecture |
| 6 | Notifications & Timeline | ✅ | event-driven: EventBridge → SQS(+DLQ) → consumer → in-app feed; feed API + prefs. **Deployed + e2e green** (approval notif arrived in ~3s); wired into `/live`. Channels SES/FCM/WhatsApp = TODO(owner) behind prefs. Cost: all pay-per-use |
| 7 | Admin & Ops | ✅ | `@sc/admin`: stats, append-only audit, moderation (suspend/reinstate), broadcast→notifications. **Deployed + e2e 7/7** (RBAC 403, moderation, broadcast, audit). Admin *console UI* = frontend TODO |
| 8 | Analytics & Reporting | ✅ | `@sc/analytics`: DynamoDB Streams→Lambda→S3 (NDJSON, date-partitioned) + Athena DDL (partition projection, no crawler) + daily ledger reconciliation. **Deployed + verified** (writes land in S3). Razorpay settlement = TODO(owner) |
| 9 | Hardening & Scale | ✅ | API throttling on the stage; WAF/provisioned-concurrency **season-gated OFF by default**; `ScalingStack` (no-op unless `provisionedConcurrency>0`); k6 load-test + `runbooks.md`. Synth + cost-audit PASS |
| 11 | Mentor Onboarding, Dashboard & Admin Console | 🟡 | packets 0–7 ✅ + packet 8 except the DEPLOY (owner go-ahead pending: new S3 bucket, additive Cognito attribute, new routes — see `cdk diff` in the changelog). Superadmin bootstrap · scope enforcement · rich application + S3 uploads · verification state machine · Calendar/Meet interviews · mentor dashboard · admin console · hardening |
| 10 | Go-live & Seasonal Ops | ✅ | `go-live.md` (go/no-go, canary strategy, PITR drill), guarded `deploy.sh`, optional `WarmupStack` (OFF by default), and **`ui-testing-guide.md`**. Canary CodeDeploy wiring = TODO(owner) |

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
- [x] **Real official JoSAA 2024 data** — **11,261 cutoffs across 121 institutes (23 IITs + 31 NITs + IIITs + GFTIs)**, opening + closing ranks per category/quota/gender. **Single source `josaa24.csv`** (has every institute; the earlier dual-source `ORCR.csv` merge was dropped after it caused IIT duplicates + GFTI mistyping — see Changelog). Version `josaa-2024.2`
- [x] **Institute enrichment** (`@sc/catalog-core/enrich.ts`) — `{ short, city, state, nirf, feesLakh }` for all 23 IITs + 31 NITs + major IIITs (curated), with city/state fallback + fee-by-type approximations for the tail. Fills the analysis page (city, NIRF, fees) and drives HS quota
- [x] **Home-State (HS) quota** — `pickByQuota` picks AI if present, else **HS when `institute.state == home`** (the home-state advantage, flagged `homeQuota:true`), else OS. Verified on real data: VNIT/NIT-Calicut surface HS rows only to their home-state students
- [x] **Main predictor screen wired to the API** (`NEXT_PUBLIC_PREDICTOR_API=on`) — real Safe/Target/Reach + enriched cards (city, NIRF, fees, quota) + "Live · official JoSAA" badge; dummy fallback preserved
- [x] **Prediction algorithm documented** — `docs/prediction-algorithm.md` (inputs, dataset, quota selection, exam mapping, ratio→bucket→pct math, worked example, limits)
- [x] **Integration tests** — `@sc/catalog` service test (5 ✓, isolated `sc-test-catalog` table): predict buckets + enrichment, HS quota via API, `/colleges`, `/colleges/:id`, 404. `@sc/catalog-core` (3 ✓). Full suite 20 ✓
- [x] **Prod observability** — CloudWatch alarms → SNS email (`sc-dev-alerts`): API 5xx, auth+catalog Lambda errors, throttles, p95 latency; dashboard extended with a Catalog-Lambda row
- [x] **Deployed e2e green (18/18)** against live API — version, enrichment fields, HS quota (matching-state only), category/type filters, `/colleges` + `/colleges/:id` + 404, cache-control
- [ ] Deferred: per-round history, college placements/median-package (separate content source), PwD/special (GO/JK/LA) quotas, add-to-list/analysis for live results (Phase 3/4), CloudFront-in-front-of-API, admin ingest UI, split predictor Lambda

### Phase 3 — Planner (CORE)
- [x] `@sc/planner` lambdalith — routes behind the Cognito authorizer: `GET/PUT /shortlist`, `GET/PUT /choice-list`, `POST /choice-list/reorder`, `GET /choice-list/doctor`, `POST /choice-list/export`
- [x] Planner DynamoDB table (`sc-<stage>-planner`): per-user `PK=USER#<id>` / `SK=SHORTLIST|CHOICELIST`, `{ ids[], version, updatedAt }`
- [x] **Optimistic concurrency** — atomic `ADD version :one` + `ConditionExpression version = :expected`; a stale write gets a **409** (survives double-taps / two tabs)
- [x] **List Doctor** — server-authoritative, in `@sc/catalog-core/doctor.ts` (pure rules: no-safe / too-few / reach-heavy-top / duplicates), reuses the predictor's `analyze()` to bucket each saved choice by the caller's rank. Twin of the frontend `lib/logic.js#listDoctor` so app + API agree
- [x] **PDF export** = `POST /choice-list/export` boilerplate returning **501** with a clear `// TODO(owner)` (S3 bucket + async render worker deferred — architecture §5.4)
- [x] Read-only Catalog snapshot reader in planner (grants: RW planner table, **read-only** catalog table)
- [x] Infra: `PlannerServiceStack` + planner table in `DataStack` + wired in `bin/app.ts`; observability extended (planner dashboard row + `planner-errors` alarm). **Deployed to AWS dev** (7 routes behind authorizer)
- [x] Local dev server (auth-shim, port 8789) + **integration tests** `@sc/planner` (7 ✓, isolated `sc-test-planner`/`sc-test-catalog-planner`) + `@sc/catalog-core` doctor unit tests (5 ✓)
- [x] **Deployed authed e2e green (12/12)** — throwaway Cognito user → ID token → choice-list PUT/GET, reorder, 409 on stale version, List Doctor buckets+warnings, shortlist isolation, export 501
- [x] Frontend `liveApi` planner methods added (`getShortlist/putShortlist/getChoiceList/putChoiceList/reorderChoice/choiceDoctor/exportChoiceList`)
- [x] **Frontend wired into `/live`** — `＋ List` on each live predictor result, a "My choice list" card (server-side List Doctor + Safe/Target/Reach summary, up/down reorder, remove, export). Persists to the planner API; **redeployed to Amplify** (job 5 SUCCEED). Real cutoff IDs flow from the live predictor → they resolve + bucket correctly
- [ ] Deferred: PDF export render (owner TODO); persisting the **dummy** main screens (`shortlist`/`choiceBuilder`/`choiceExport`) — they use the dummy dataset's fake ids, so real persistence lives on `/live` where real ids flow

### Phase 4 — Marketplace & Mentors
- [x] `@sc/marketplace` lambdalith — mentor self-service + admin queue behind the Cognito authorizer; **public `GET /mentors`** search (no authorizer)
- [x] Mentors table (`sc-<stage>-mentors`): `PK=MENTOR#<id>` / `SK=PROFILE|AVAILABILITY|EMAILOTP` (OTP rows TTL-expire) + **one sparse GSI `gsi1-status`** serving both the approved-search and the admin pending-queue (`gsi1pk=MENTOR#<STATUS>`)
- [x] **Verification state machine** — `POST /mentor/apply` (DRAFT) → `POST /mentor/verify/email` (`.ac.in` OTP; dev returns `devOtp`, real SES/SNS = TODO owner) → `POST /mentor/verify/id` (S3 upload = TODO owner stub) → auto-advance to **PENDING_REVIEW** → admin `POST /admin/mentors/:id/review` (approve/reject) → **APPROVED**
- [x] Locked identity fields (college/branch/year) after approval; editable profile (name/bio/topics/price); **availability** with optimistic concurrency
- [x] **Public search** filters (college/branch/topic/maxPrice) + sort (rating/price); public projection **never leaks** email/OTP/verification internals
- [x] Domain events via `publish()` (local-safe): `mentor.applied` / `.verification.submitted` / `.approved` / `.rejected`
- [x] Infra: `MarketplaceServiceStack` (+ `events:PutEvents` grant) + mentors table + `bin/app.ts` wiring + observability (row + `marketplace-errors` alarm). **Deployed to AWS dev** (10 routes)
- [x] Tests: `@sc/marketplace` integration **12 ✓** (isolated `sc-test-mentors`); full suite **44 ✓**, typecheck **8/8**
- [x] **Deployed authed e2e 12/12** — throwaway mentor + admin (`custom:role=admin`) Cognito users: apply→devOtp→email→id→PENDING→approve→public search (no leak)→availability 409
- [x] **Frontend wired into `/live`** — "Become a mentor" (apply → email OTP → ID → status) + "Browse mentors" (public `GET /mentors`); `liveApi` marketplace methods; redeployed to Amplify (job 6)
- [ ] Deferred: real S3 presigned ID upload + SES/SNS OTP delivery (owner); admin verification-queue console (Phase 7); ratings come from Phase 5 sessions

### Phase 5 — Booking, Payments & Sessions (CORE)
- [x] `@sc/booking` lambdalith — booking/session routes behind the authorizer; **public `POST /payments/webhook`** (signature-verified in prod = TODO owner)
- [x] Bookings table (`sc-<stage>-bookings`): `PK=BOOKING#<id>` (+ `SLOT#`/`IDEMP#`/`LEDGER#` rows) with **gsi1-student** + **gsi2-mentor**, TTL on unpaid holds, stream for analytics/reconciliation
- [x] **The saga** — `POST /bookings` reads mentor price/slot (read-only mentors grant), holds the slot via an **atomic TransactWrite** (booking + slot-hold guarded by `attribute_not_exists`) so two students can't grab one slot; **Idempotency-Key** header dedupes; ledger `order.created`
- [x] **`POST /payments/webhook`** completes the saga: **exactly-once** ledger capture (keyed by provider payment id) → `PENDING_PAYMENT → CONFIRMED`; a re-delivered webhook is a no-op; emits `payment.succeeded` + `booking.confirmed`
- [x] **Session lifecycle** — `POST /sessions/:id/join` (asserts participant + paid + time-window) → LIVE; `/end` → ENDED; `/rate` → RATED (emits `session.rated`); `GET /sessions` (my sessions, both roles); `GET /bookings/:id` (booking + ledger)
- [x] **Google Meet link on payment** — on confirmation a **shared meeting link** is stored on the booking and returned to BOTH student + mentor (`/sessions`, `/join`); real Google Calendar link = **TODO(owner)** (`meeting.ts`), placeholder until then
- [x] **Cancel/refund** — pre-pay cancel releases the hold; post-pay cancel → REFUNDED + ledger `refund.issued` (real Razorpay refund = TODO owner)
- [x] Razorpay + SFU are **boilerplate/interfaces only** (secrets never touch us) — clear `// TODO(owner)` for orders.create, webhook signature (HMAC), refund, and the room-token mint
- [x] Infra: `BookingServiceStack` (RW bookings, read-only mentors, `events:PutEvents`) + bookings table + observability (row + `booking-errors` alarm). **Deployed to AWS dev** (8 routes)
- [x] Tests: `@sc/booking` integration **10 ✓** (isolated tables; asserts atomicity, idempotency, exactly-once ledger, window, refund); full suite **54 ✓**, typecheck **9/9**
- [x] **Deployed cross-service e2e 12/12** — throwaway mentor+admin+student: mentor approved with a live slot → student books → idempotent replay → double-book 409 → webhook CONFIRMED → replay no-op (ledger not doubled) → join → end → rate → confirm+cancel REFUNDED
- [x] **Frontend wired into `/live`** — "Book s1" on browsed mentors + a "My sessions" card driving the lifecycle (Pay-dev → Join → End → Rate → Cancel); `liveApi` booking methods; redeployed to Amplify (job 7)
- [ ] Deferred (owner): Razorpay orders/webhook-signature/refund, SFU room tokens + recording→S3, payout batches (₹80/₹100), mentor-rating rollup consumer; a slot-picker booking UI

### Phase 6 — Notifications & Timeline
- [x] **`@sc/notifications`** — two Lambdas share one table: a **feed API** (authed) + an **SQS consumer**
- [x] **Event pipeline** — one EventBridge rule (`source` prefix `sc.`) fans every domain event → **SQS** (buffer) with a **DLQ** (maxReceiveCount 3, partial-batch-response) → consumer → per-user in-app feed. Cost: SQS + rule + Lambdas all pay-per-use → ₹0 idle
- [x] **Fanout mapping** (`domain/notifications.ts`, pure + tested): `booking.confirmed` → student + mentor (with the Meet link), `mentor.approved`/`rejected` → mentor, `session.rated` → mentor, `refund.issued` → student; unmapped events ignored safely
- [x] Notifications table (`sc-<stage>-notifications`, `PK=USER#<id>` `SK=NOTIF#<ulid>|PREFS`, **TTL** 90d) — feed bounded, cheap
- [x] **API** — `GET /notifications` (feed + unread count), `POST /notifications/:id/read`, `/read-all`, `GET/PUT /notifications/prefs`; prefs gate delivery (in-app on by default)
- [x] **Channel adapters** = `// TODO(owner)` behind prefs — SES (email), FCM (push), WhatsApp BSP; in-app is the free default
- [x] Infra: `NotificationsServiceStack` (feed Lambda + consumer Lambda + SQS + DLQ + EventBridge rule) + table + observability (consumer row, **DLQ-depth widget + alarm**, consumer-errors alarm). **Deployed to AWS dev** (5 routes)
- [x] Tests: `@sc/notifications` integration **6 ✓** (fanout, ingest→feed, mark-read, prefs-suppress, read-all); full suite **61 ✓**, typecheck **10/10**
- [x] **Deployed e2e 5/5** — approved a mentor → `mentor.approved` flowed EventBridge→SQS→consumer→feed in **~3s** ("You're a verified mentor ✅"); mark-read + prefs verified
- [x] **Frontend wired into `/live`** — a 🔔 notifications card (unread badge, mark-all-read, Meet-link deep-link); `liveApi` methods; redeployed to Amplify (job 9)
- [ ] Deferred (owner): SES/FCM/WhatsApp adapters; EventBridge Scheduler deadline reminders (`round.deadline.T-24h`); admin broadcasts (Phase 7)

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

### Phase 11 — Mentor Onboarding, Mentor Dashboard & Admin Console *(building now)*

Spec: `CLAUDE_CODE_LOOP_PROMPT.md` (repo root). **FIRST RUN (2026-08-29): every GROUND TRUTH claim §0–§12 verified against the code.** Conflicts / deviations found and how they are handled:
- **Booking local baseline is NOT 11/11.** `services/booking/test/booking.e2e.test.ts` still drives the pre-accept saga (`PENDING_PAYMENT`) while the domain has the mentor accept/decline step (`REQUESTED → ACCEPTED`); 9 of 11 fail before any Phase 11 change. → Pre-work: bring the test up to the current saga so the regression baseline is real (marketplace 12 · booking 11 · admin 8 · auth 9).
- **Audit table is admin-owned but packets 1 & 3 must write to it** (superadmin promotions in auth-identity; document access in marketplace). → The append-only audit repo moves to `@sc/shared` (`audit.ts`); each service gets `TABLE_AUDIT` + a write grant. Admin's `audit.repo.ts` re-exports it.
- **Packet 6 "Students & prep" needs the student's rank/category/state**, which only the users table holds and the booking service cannot read today. → New read-only access pattern: booking Lambda gets `TABLE_USERS` + read grant; `GET /sessions/:id/student-prep` (mentor of a booked session only).
- **Google/Hosted-UI sign-in uses the implicit flow (no refresh token)** (see 2026-07-18 changelog). Role/scope claims written to Cognito therefore only reach the JWT on the user's *next* sign-in. → Frontend detects a claim/DB mismatch after bootstrap, silently refreshes when it can, otherwise shows a "sign in again to activate" banner.
- **Packet 4 makes approval post-interview only**; the existing marketplace test approves straight from `PENDING_REVIEW` and the deployed `AVerifyQueue` shows `INTERVIEW`. → Test updated; `INTERVIEW` kept as a read alias of `INTERVIEW_SCHEDULED`; the legacy `GET /admin/mentors/pending` route stays for one release.
- **Spec lists four scope↔route pairs**; the deployed nav also gates Sessions/Payments/Analytics on `sessions.view`/`payments.view`. → Those admin booking reads get `sessions.view` too, so UI and API agree everywhere.

**Packet 0 — baseline repair (pre-work)**
- [x] Update `booking.e2e.test.ts` to the accept/decline saga (mentor accepts → student pays) so 11/11 pass locally

**Packet 1 — Superadmin bootstrap + doc correction**
- [x] `SUPERADMIN_EMAIL` in `packages/config` (zod, optional), `.env.example`, `infra/lib/config.ts` → auth-identity env
- [x] `getPrincipal` exposes `emailVerified` (from the `email_verified` claim); bootstrap promotes only on a VERIFIED, case-insensitive exact match → `role=superadmin` in Cognito (`custom:role` + `custom:scopes`) and the users row (all scopes). Idempotent.
- [x] Close the self-demotion hole: `POST /me/role` is 403 for a superadmin (token role OR stored role)
- [x] Audit every promotion (`superadmin.bootstrap`, `admin.promote`, `admin.scopes`, `admin.demote`) via the shared audit repo; auth-identity gets `TABLE_AUDIT` + write grant
- [x] Fix stale headers in `architecture.md` + `progress.md`
- [x] Tests: correct email promoted · different casing promoted · unverified email NOT promoted · lookalike NOT promoted · second run no-op · superadmin `POST /me/role` → 403
- [x] Frontend: after bootstrap, if the token's `custom:role` ≠ `/me.role` → refresh session (or "sign in again" banner when no refresh token)

**Packet 2 — Backend scope enforcement**
- [x] ADR: scopes ride in the JWT as `custom:scopes` (comma-separated), mirroring `custom:role` (ADR-005); changes apply on the next token
- [x] `hasScope(p, scope)` / `requireScope(p, scope)` in `packages/shared/src/auth.ts` (superadmin satisfies every scope; admin hierarchy respected) + unit tests
- [x] Cognito: `custom:scopes` attribute (auth-stack); `setUserRoleAttribute` writes role + scopes; setAdmin/demote/superadmin-bootstrap keep Cognito and the users row in sync
- [x] Apply: `mentors.manage` (queue/review/verify/suspend/reinstate/documents), `mentors.interview` (schedule/reschedule/cancel), `broadcast.send`, `users.view`, `sessions.view` (admin booking reads)
- [x] Dev servers + test helpers accept `scopes`; admin UI copy says scope changes apply on next sign-in
- [x] Tests: admin with scope passes · without → 403 · superadmin passes with no scopes

**Packet 3 — Rich mentor application + real ID upload**
- [x] Extend `ApplyInput` (identity/contact/profile/essays/consent) — existing fields unchanged; DRAFT accepts partial data
- [x] Private S3 bucket `sc-<stage>-mentor-docs-<acct>` (SSE, versioned, block-public, CORS for the app origins, lifecycle: rejected-tagged objects expire) in `data-stack`; marketplace grants
- [x] `POST /mentor/documents/presign` (server-generated key `mentors/<userId>/<docType>/<ulid>.<ext>`, image/PDF ≤ 5 MB, short-TTL PUT) · `POST /mentor/documents/confirm` (HeadObject check, prefix check) · admin `GET /admin/mentors/:id/documents/:docType/url` (short-TTL GET, audited)
- [x] `.ac.in` OTP bound to the signed-in `userId`; per-user + per-email rate limits; SES delivery when configured (prod), `devOtp` only outside prod
- [x] `POST /mentor/submit` — `DRAFT → PENDING_REVIEW` only when complete; the 400 names EVERY missing item
- [x] `publicView` unchanged + a leak test (no essay/document/phone/email)
- [x] Tests: each missing requirement blocks with a precise message · presign rejects bad content-type / oversize · cross-mentor presign/read denied · public leak check

**Packet 4 — Verification state machine**
- [x] `packages/shared/src/mentor-state.ts`: `MentorStatus` incl. `DOCS_VERIFIED`, `INTERVIEW_SCHEDULED`, `SUSPENDED`; `INTERVIEW` legacy alias; one pure `canTransition/assertTransition`; exhaustive unit tests
- [x] Per-field verification `{status: UNVERIFIED|VERIFIED|FLAGGED, by, at, note}` on every submitted detail + document; `POST /admin/mentors/:id/fields/:field`; `POST /admin/mentors/:id/verify-docs` only when all required items are VERIFIED
- [x] Rejection requires a reason; soft (→ `DRAFT`, notes visible, re-apply) vs hard (`REJECTED`, terminal); approval only from `INTERVIEW_SCHEDULED`
- [x] Status history on the row; every transition = audit entry + event (spy-asserted)
- [x] Admin queue `GET /admin/mentors?status=&q=&cursor=&limit=` on a time-ordered `gsi1sk = <changedAt>#<userId>` with a real cursor (never whole-table-in-memory); `GET /admin/mentors/counts`; `GET /admin/mentors/:id` full application; legacy `/admin/mentors/pending` kept
- [x] Admin service: `MentorRow.status` typed strictly; suspend/reinstate go through the shared machine

**Packet 5 — Interview scheduling (Google Calendar + Meet)**
- [x] `CalendarProvider` in `@sc/shared` (`calendar.ts`): `StubCalendarProvider` + `GoogleCalendarProvider` (service account w/ domain-wide delegation, JWT signed with node `crypto`, no extra deps; creds from the SSM secrets blob); selected by `CALENDAR_PROVIDER`
- [x] Booking `meeting.ts` implemented on the provider (stub by default)
- [x] Interview contract migration: accept `{interviewAt, durationMin, note}` AND legacy `{interviewLink}` for one release; link server-generated otherwise; `liveApi.mentorScheduleInterview` + admin screen moved to the new shape
- [x] `DOCS_VERIFIED → INTERVIEW_SCHEDULED` with `{eventId, meetUrl, interviewAt, durationMin, scheduledBy}`; attendees = mentor + interviewing admin; emits `mentor.interview.scheduled`
- [x] `PATCH …/interview` reschedule (same event) · `DELETE …/interview` cancel (deletes event → `DOCS_VERIFIED`) · idempotent on `(mentorId, interviewAt)` · calendar failure never half-commits
- [x] Post-interview `POST /admin/mentors/:id/review {decision, note}`; contract test for the Google provider skips without creds

**Packet 6 — Mentor dashboard (extend `screens/mentor.js`)**
- [x] Application status timeline (Submitted → Docs verified → Interview → Decision) with blockers, next step, interview date + Meet link; rejection reason + re-apply
- [x] Multi-step application form (all packet-3 fields, document upload via presign, essays, consent) replacing the thin verification form
- [x] Profile: editable bio/topics/price/languages; identity fields locked after approval with a "request a change" path
- [x] Availability 409 → "changed elsewhere, reload"
- [x] Sessions with student first name + Meet link + join/end
- [x] Students & prep (rank/category/state/branches/note) — booked sessions only
- [x] Earnings from the booking ledger; pending vs released honest; payouts "coming soon"
- [x] Ratings & feedback (avg, distribution, trend)
- [x] Gating: unapproved → screens 1–2; approved → all; suspended → banner + read-only

**Packet 7 — Admin console (extend `screens/admin.js`)**
- [x] Verification queue: status filter, oldest-first, wait time; application detail with every field/essay + inline document preview (presigned GET), per-field Verify/Flag, "N of M verified", legal actions only
- [x] Mentor directory (all statuses, suspend/reinstate, status history)
- [x] Interview calendar (upcoming first, reschedule/cancel)
- [x] Admin team (superadmin): promote/edit scopes/demote + "applies on next sign-in" copy
- [x] Audit log (filter by actor/action/date, visibly read-only)
- [x] Overview: queue health (waiting, avg time per stage, interviews this week)
- [x] Confirm step on every state-changing action; every new action audited

**Packet 8 — Hardening**
- [ ] Deployed-stage e2e: superadmin sign-in → apply with real upload → verify each field → schedule (stub) → approve → mentor dashboard → booking still green
- [x] No local regressions — final pass: shared 17 (+1 live-skip) · marketplace 23 · admin 9 · booking 18 · auth 17 · notifications 6 · planner 7 · catalog 15 · analytics 6; `pnpm typecheck` 13/13; `next build` ✓ (76 paths)
- [x] CloudWatch alarms: no NEW Lambdas were added (all Phase 11 routes live in the existing marketplace/booking/auth/admin lambdaliths, already covered by `ObservabilityStack` error/throttle/duration alarms); marketplace timeout raised 10→15 s for the Calendar round-trip. Audit coverage: `superadmin.bootstrap`, `admin.promote|scopes|demote`, `mentor.field.verify`, `mentor.docs.verified`, `mentor.interview.schedule|reschedule|cancel`, `mentor.review.approve|reject`, `mentor.document.access`, `mentor.suspend|reinstate`
- [x] `architecture.md`: §5.5 rewritten (state diagram, application, per-field verification) + new §5.5.1 document store, §5.5.2 Calendar/Meet, §5.5.3 superadmin & scopes; §6.1 Mentors row + §14 API surface updated; README §13 + `integrations-setup.md` Phase 11 owner knobs
- [ ] Security pass: no public/long-lived document URL; no essay/email/phone/document in any public response; every new route role- AND scope-gated; OTP + presign rate-limited; static-export gating never a security control
- [ ] `progress.md`: Phase 11 complete, ADRs, changelog

---

## Production-readiness checklist (through Phase 2)

What "production-ready till Phase 2" means here — the auth + predictor slice a real student can use.

**Green (done & verified)**
- ✅ **Correctness** — prediction math + HS quota locked by unit + integration tests (20 ✓); deployed e2e 18/18.
- ✅ **Real data** — 11,261 official JoSAA 2024 cutoffs, 121 institutes, enriched (city/state/NIRF/fees); immutable versioned dataset (`josaa-2024.2`), atomic active-pointer swap.
- ✅ **Input validation** — every route zod-validates query/body; bad input → 400, never a 500.
- ✅ **AuthZ** — predictor routes public (shared, cacheable); profile routes behind the Cognito JWT authorizer; role read from a verified `custom:role` claim.
- ✅ **Least privilege** — per-service IAM, table-scoped grants; no secrets in code (env-driven).
- ✅ **Performance** — in-memory snapshot cache (no per-request DB scan); CDN cache-control on public reads; ARM64 Lambda.
- ✅ **Observability** — dashboard (API/Lambda/DDB) + **alarms → email** (5xx, Lambda errors, throttles, p95) + **budget** guardrail.
- ✅ **Resilience** — DynamoDB on-demand + PITR; scale-to-zero; alarms treat missing data as *not breaching* (quiet ≠ alarm).
- ✅ **Test isolation** — integration tests run on dedicated `sc-test-*` tables; deterministic setup.
- ✅ **Honest UX** — every prediction says "estimate, verify on josaa.nic.in"; algorithm documented.

**Owner actions (one-time)**
- [ ] Click **"Confirm subscription"** in the SNS email so alarms actually reach you.
- [ ] Add the 2 Hostinger CNAMEs so `counsellor.kodexa.in` goes live (records in the outputs section).

**Deferred to Phase 9 (hardening & scale) — not blockers for a Phase-2 launch**
- [ ] API-Gateway per-route throttling / usage plans; WAF-on for prod; stronger prod Cognito password policy.
- [ ] Provisioned concurrency pre-warm on the June–July ramp (cold-start smoothing).
- [ ] Load test to target rps; runbooks; canary deploy.
- [ ] CloudFront in front of the API for edge caching of `/predict`.

---

## Roadmap: Phases 6-10 — detailed build plan (cost-safe)

**Cost guardrails applied to every phase below** (so nothing spikes off-season):
- Everything **scale-to-zero**: Lambda, DynamoDB **on-demand**, SQS, EventBridge — all pay-per-use, ₹0 at idle.
- **No always-on infra**: no NAT gateway, no Aurora/RDS, no ElastiCache, no provisioned concurrency off-season, WAF stays **off** until Phase 9 (and then season-gated).
- **External channels + heavy features behind flags** (`cfg.*` / `SEASON`): in-app + email default; SMS/WhatsApp/push opt-in. Analytics uses **Streams→S3→Athena** (pay-per-query), not always-on pipelines.
- Each new table: on-demand + PITR; TTL on ephemeral rows. Budget alarm ($10) already guards the account.

### Phase 6 — Notifications & Timeline  *(building now)*
- **`@sc/notifications`** consumer: EventBridge rule → **SQS** (buffer + DLQ) → Lambda. Folds domain events (`booking.confirmed`, `mentor.approved`, `session.rated`, `payment.succeeded`…) into a per-user **in-app feed** (`sc-<stage>-notifications`, `PK=USER#<id>` `SK=NOTIF#<ts>`, `gsi1: unread`, TTL).
- **API**: `GET /notifications` (feed, unread count), `POST /notifications/:id/read`, `POST /notifications/read-all`, per-user `GET/PUT /notifications/prefs`.
- **Channel adapters** = `// TODO(owner)`: SES (email), FCM (push), WhatsApp BSP — behind `cfg.channels`. In-app is the always-free default.
- **Deadline reminders**: EventBridge **Scheduler** off the JoSAA calendar (`round.deadline.T-24h`) → same consumer. Cost: scheduler + Lambda = negligible.
- Deliver: service + table + SQS/DLQ + rule + tests + deploy + `/live` feed + commit.

### Phase 7 — Admin & Ops
- **`@sc/admin`** (role=admin): verification-queue actions already exist in marketplace; add **audit log** (`sc-<stage>-audit`, append-only, `PK=ADMIN#<id>` `SK=ACT#<ts>`), **platform metrics** (counts folded from Streams, not live scans), moderation actions (suspend mentor / hide review), broadcast trigger (→ notifications). RBAC via the `admin` group + per-action scopes.
- **Materialized rollups**: DynamoDB **Streams → Lambda → a `Stats` item** (counters), so dashboards never scan live tables (cost + latency).
- Every admin action **audited**. A minimal Next.js `/admin` surface (behind admin role).

### Phase 8 — Analytics & Reporting
- **Streams → S3 (Parquet) → Athena** (+ Glue catalog). A small **Firehose-free** path: Streams → Lambda batches to S3 by day/table; Athena queries on demand (pay-per-scan, partitioned by date to keep scans tiny). Dashboards read pre-aggregated rollups from Phase 7; Athena is for ad-hoc/financial reconciliation only.
- **Ledger reconciliation** job (daily EventBridge Scheduler): fold `sc-*-bookings` ledger vs. the (owner-provided) Razorpay settlement report → flag mismatches. Cost: one scheduled Lambda/day.

### Phase 9 — Hardening & Scale
- **API Gateway throttling / usage plans** (free), **WAF on** (season-gated, `cfg.enableWaf`), stronger prod Cognito password policy, per-route rate limits.
- **Provisioned concurrency** on the hot Lambdas (predictor, auth) **scheduled ON only for Jun–Jul** via Application Auto Scaling + `SEASON` (the biggest cost lever — kept off otherwise).
- **Load test** to target rps (Artillery/k6) → right-size memory + concurrency floors; **runbooks**; DLQ replay drills; alarm coverage review.

### Phase 10 — Go-live & Seasonal Ops
- **Canary / staged rollout** (Lambda alias + weighted deploy), **ramp automation** (pre-warm schedule keyed to JoSAA round dates), synthetic canaries (CloudWatch Synthetics — season-gated), on-call + escalation, cost review, DR/restore drill (PITR), and a go/no-go checklist.

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

- **2026-08-29 · ADR-010 · Superadmin is bootstrapped from a VERIFIED-email match, not seeded.** `POST /auth/bootstrap` promotes the caller iff `email_verified` and `email` (JWT claims, never a body) equal `SUPERADMIN_EMAIL` case-insensitively; writes Cognito `custom:role`+`custom:scopes` FIRST, then the users row, then an audit row. Idempotent. A superadmin cannot `POST /me/role` (token OR stored role). *Alternative:* a one-off script — rejected: not reproducible across redeploys (Cognito ids change on every `cdk deploy` from scratch).
- **2026-08-29 · ADR-011 · Admin permission scopes ride in the JWT as `custom:scopes`** (comma-separated), written next to `custom:role` (ADR-005) and parsed in `getPrincipal` → `p.scopes`; `requireScope(p, scope)` = `requireRole(p,'admin')` + `hasScope`; superadmin satisfies every scope. **Scope changes reach the API on the user's NEXT token** (silent refresh for email/password sign-in; Google/Hosted-UI implicit flow → "sign in again" banner). *Alternative:* load scopes from the users row per request — rejected: every scoped service would need a cross-service read grant + a users reader + test fixtures, for admin traffic that is tiny; token-carried scopes mirror the existing role design and stay scale-free.
- **2026-08-29 · ADR-012 · ONE mentor state machine in `@sc/shared` (`mentor-state.ts`).** `DRAFT → PENDING_REVIEW → DOCS_VERIFIED → INTERVIEW_SCHEDULED → APPROVED ⇄ SUSPENDED`, hard `REJECTED` terminal, soft reject = back to `DRAFT`; `INTERVIEW` legacy alias mapped on read. Marketplace AND admin call `assertTransition` and their repos enforce the same edge atomically (`ConditionExpression` on the current status) → a lost race is a 409, never a half-write. Every transition appends to the row's `history` and re-keys `gsi1sk = <changedAt>#<userId>` (time-ordered queue with a real cursor; EVERY status is indexed now).
- **2026-08-29 · ADR-013 · Per-field manual verification, not one Approve button.** Each submitted detail/document carries `{status: UNVERIFIED|VERIFIED|FLAGGED, by, at, note}`; `DOCS_VERIFIED` is reachable only when every REQUIRED item is VERIFIED; a later FLAG drops the application back to `PENDING_REVIEW`; approval is legal only after the interview.
- **2026-08-29 · ADR-014 · Mentor ID documents: private S3, server-minted keys, presigned URLs only, audited reads.** Bucket `sc-<stage>-mentor-docs-<acct>` (block-public, SSE, versioned, CORS for the app origins, lifecycle: `status=rejected`-tagged objects expire after 90 d). Key = `mentors/<userId>/<docType>/<ulid>.<ext>`; content-type is part of the PUT signature; size is enforced at confirm (HeadObject; oversize → deleted). Admin preview = 3-min presigned GET minted per click + `mentor.document.access` audit row. Local/tests use an in-memory store with the same contract.
- **2026-08-29 · ADR-015 · Meeting links through a `CalendarProvider` (`@sc/shared calendar.ts`).** `StubCalendarProvider` (default, deterministic `/lookup/` placeholders) vs `GoogleCalendarProvider` (service account + domain-wide delegation, JWT signed with `node:crypto`, plain `fetch`, no SDK; creds `GOOGLE_SA_JSON` + `GOOGLE_CALENDAR_IMPERSONATE` in the SSM secrets blob). Interviews: create event → then DB transition; DB failure → compensating cancel (never an orphaned event); idempotent on `(mentorId, interviewAt)`; reschedule PATCHes the same event; cancel deletes it. Paid sessions fall back to the placeholder on a Calendar failure (a captured payment must never fail). `CALENDAR_PROVIDER=google` without creds → 503, never silent placeholders.
- **2026-08-29 · ADR-016 · The append-only audit repo moved to `@sc/shared`** so auth-identity (promotions), marketplace (verification, document access) and admin (moderation) write one trail; each Lambda gets `TABLE_AUDIT` + a write grant.
- **2026-08-29 · ADR-017 · Interview endpoint contract migration in two steps.** `POST /admin/mentors/:id/interview` accepts `{interviewAt, durationMin?, note?}` (link server-generated) AND the legacy `{interviewLink}` for one release; `liveApi.mentorScheduleInterview` moved to the new shape; `interviewLink` is dropped from the schema next release. The deployed caller never breaks mid-deploy.

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
- **2026-08-29** — **Phase 11 packets 6–7 (frontend) + packet 8 hardening (except deploy).** Mentor app: `mentor.js` split into `mentor-shared/application/students/money.js` — application status timeline + 6-step application form (OTP inline, presigned document uploads, essays with counters, consent), profile with locked identity fields, availability 409 handling, sessions with student first name + Meet link, new `mStudents` prep sheet, honest earnings (released/pending, payouts "coming soon"), ratings distribution/trend, `useMentorGate` gating + suspended banner, inline confirm modals; `MentorOnboarding`/`VerifyStatus` updated. Admin console: `admin.js` split into `admin-shared/verify/mentors/audit.js` — status-tabbed oldest-first verification queue with cursor + wait time, application detail with per-field Verify/Flag, audited inline document preview, "N of M verified", `legalActions`-driven buttons, interview schedule/reschedule/cancel forms, soft/hard reject with reason; mentor directory with history + suspend/reinstate; new `aInterviews` calendar and `aAudit` log; Admins page states next-sign-in scope activation; overview queue health. All `window.prompt`s removed. Docs: architecture §5.5 + 5.5.1–5.5.3, README §13, `integrations-setup.md` Phase 11 knobs; `readme_sc.md` removed (superseded). **Deploy footprint (`cdk diff`, not applied):** `sc-dev-data` +S3 bucket; `sc-dev-auth` ~UserPool (+`custom:scopes`); `sc-dev-foundation` +19 routes / −`POST /mentor/verify/id`; Lambda code + IAM updates on auth/marketplace/booking/admin/notifications/catalog/planner. Then frontend Amplify deploy.
- **2026-08-29** — **Phase 11 packets 0–5 built + green locally (backend + infra).** Packet 0: booking suite brought up to the accept/decline saga (was 2/11 before any change). Packet 1: `SUPERADMIN_EMAIL` (config + infra), verified-email superadmin bootstrap (idempotent, audited), self-demotion guard, `custom:scopes` Cognito attribute, frontend role-stale banner, stale doc headers fixed. Packet 2: `hasScope/requireScope` in `@sc/shared` (+ unit tests) applied to every scoped admin route across marketplace/admin/auth-identity/booking; dev servers + test helpers carry scopes. Packet 3: rich `ApplyInput` (identity/contact/profile/essays/consent), private S3 bucket + presign/confirm/admin-URL document flow (in-memory store locally), OTP bound to the signed-in user with per-user + per-email rate limits and SES delivery when configured, `POST /mentor/submit` listing EVERY missing item. Packet 4: shared state machine (exhaustive unit test), per-field verification, `verify-docs`, soft/hard rejection with reasons, status history, cursor-paged time-ordered admin queue + counts + full application + legacy `/pending`. Packet 5: `CalendarProvider` (stub + Google, fake-fetch unit tests + skip-without-creds live contract test), interview schedule/reschedule/cancel with compensation + idempotency, booking Meet links on the provider, `GET /sessions/:id/student-prep`. Notifications map every new mentor event. **Suites:** shared 17 · marketplace 22 · admin 9 · booking 18 · auth 17 · notifications 6 · planner 7 · catalog 15 · analytics 6; `pnpm typecheck` 13/13. Not deployed yet (packet 8).
- **2026-08-29** — **AI Counsellor planned** (bounded context #11). `docs/ai-counsellor/Plan.md` (v3, three design iterations: RAG → tool-grounded agent → + cost/scale/safety/evals) + `docs/ai-counsellor/progress.md` (phase tracker C0–C5, AC-ADRs, open decisions). Awaiting owner approval; no code.

- **2026-08-20** — **Official JoSAA ORCR corpus acquired: all rounds, all institute types, 2020–2025.** Re-derived the cutoff corpus from the **official** JoSAA *Archive of Opening and Closing Rank* (`josaa.admissions.nic.in`) instead of the third-party GitHub mirrors used in `docs/forecast-data-acquisition.md`, and widened it from **one round per year to every round** — **360,975 rows / 140 of 140 partitions / 0 gaps / all checksum-clean** (IIT 101,300 · NIT 196,948 · IIIT 28,137 · GFTI 34,590). The source has no API (ASP.NET WebForms), so **`scripts/josaa-orcr.ts`** drives its cascading-dropdown postback chain — one request per (year, round, instype) with institute/branch/seatType=`ALL`; resumable, sha256-checksummed at fetch time, rounds discovered live from the dropdown, 1.2s throttle. **`scripts/josaa-build.ts`** re-verifies every partition against its recorded hash and folds them into per-year gzipped artifacts (**3.6MB committed**; the 140 raw partitions are a gitignored working dir). Adding 2026 is one command per type — no code change. **Cross-checked against the mirror data in production: 61,460 overlapping rows, ZERO rank disagreements** — the served numbers are faithful. Defects found are in *labelling and identity*: (1) **715 preparatory ranks lost their `P` flag** in the 2021/2022/2023/2025 mirrors — `num()` strips non-digits so `687P` reads as rank 687, making SC/ST/PwD cutoffs look 1–2 orders of magnitude better than reality; (2) **`josaa24.csv` is Round 5 stamped Round 6** (2024 had no R6) — proven, R5 matches with 0 mismatches vs 870 for R1; (3) **`instituteId()`'s 46-char truncation fuses distinct colleges** (IIIT Bhubaneswar ≡ IIIT Naya Raipur, NIELIT ×5, NIFTEM ×3) — pre-existing, highest severity; (4) **IIEST Shibpur** is `NIT` per JoSAA but `GFTI` per `deriveType()`. Also: IITs/IIITs are 100% `AI` quota, NITs carry **no `AI` at all** (OS/HS/JK/GO/LA), and the archive caps closing ranks just under 1,000,000. **Nothing served changed** — `seed.ts` untouched, no `DATASET_VERSION` bump, no reseed; promotion + the four fixes are `TODO(owner)` in **`docs/josaa-orcr-dataset.md` §7**. New scripts: `pnpm --filter @sc/catalog josaa:rounds|josaa:fetch|josaa:verify|josaa:build`. Typecheck ✓.
- **2026-07-19** — **Full stack RE-DEPLOYED from scratch (Google-only auth) + ~$0 posture.** After the same-day teardown, re-bootstrapped CDK and re-deployed all 12 `sc-dev-*` stacks to ap-south-1 (acct 058264128057). Reseeded catalog `josaa-2026f.2` (11,261 cutoffs). **New IDs:** API `https://um9t7ip0g9.execute-api.ap-south-1.amazonaws.com`, Cognito pool `ap-south-1_ubGSCKVZz`, client `5ijb4moldr63q261m1esr0qitb`, Hosted-UI unchanged (`sc-dev-058264128057.auth…`). **Google-only login:** Google creds restored to SSM `/sc-dev/google-client-secrets` (from `backend/.env`); Cognito Google IdP redeployed + verified (`/oauth2/authorize` → 302 accounts.google.com); frontend email/password UI hidden behind `PASSWORD_LOGIN=false` in `screens/auth.js` (reversible; Cognito native path retained, unused). **Frontend:** fresh Amplify app `d32971gyq5jq34` (old one was deleted) → `https://main.d32971gyq5jq34.amplifyapp.com` (job 1 SUCCEED); `.env.local` regenerated for new IDs; `corsOrigins` updated + `sc-dev-auth`/`sc-dev-foundation` redeployed so the new origin is an allowed callback/CORS origin. **Custom domain:** re-associated `counsellor.kodexa.in` → new CloudFront `d2u66q58y4x03k.cloudfront.net` (owner updates 2 Hostinger CNAMEs; ACM validation record is identical to before). **Cost:** WAF off, all DynamoDB on-demand, no provisioned concurrency/warmers → ~$0 idle. **Verified e2e** (throwaway users, USER_PASSWORD_AUTH): student bootstrap/`me` 200; mentor apply → profile `DRAFT`; RBAC student→403 vs admin→200 on `/admin/stats` + `/admin/mentors/pending`. **Owner actions pending:** (1) update Hostinger DNS, (2) log in via Google once → then set `rahul.raj9237@gmail.com` to `custom:role=superadmin` + `sc-dev-users role=superadmin`.
- **2026-07-18** — **Prod-grade auth (refresh tokens), AI-Counsellor hero, demo-mentor cleanup, owner→admin.** (1) **Auth no longer logs users out daily:** added `auth.js#refreshSession()` (SDK `getSession()` silently renews the id token from the stored refresh token) wired into `store.js` on mount + a 30-min timer, and bumped Cognito `refreshTokenValidity` 30→**90 days** (deployed `sc-dev-auth`; id/access stay 1h, renewed silently). Email/password path fully covered; **Google/Hosted-UI still uses the implicit flow (no refresh token) — TODO: switch to auth-code + PKCE** for federated refresh. (2) **AI Counsellor** promoted to a bold gradient hero banner at the top of the dashboard ("Launching next month") + removed the small duplicate tools-row button. (3) **Demo mentors removed:** all 13 e2e-test mentors in `sc-dev-mentors` hidden (status→REJECTED, `gsi1pk` cleared → dropped from the sparse GSI); live `GET /mentors` now returns **0** (reversible; rows retained). (4) **Owner made admin:** `rahul.raj9237@gmail.com` → Cognito `custom:role=admin` + `sc-dev-users` `role=admin` (needs a re-login for the fresh JWT claim). Frontend Amplify **job 23**. Razorpay verified earlier this session: live keys stored + authenticate (200) + booking Lambda rolled.
- **2026-07-19** — **Phases 2–5 shipped (mentor model, booking-with-approval, RBAC, admin console).** **P2 additive mentor:** role decoupled from mentor — a user stays `student`, an APPROVED mentor gets a toggled-into mentor area (Chrome nav switch; gate requires mentorStatus APPROVED). **P3 booking saga:** REQUESTED→ACCEPTED→CONFIRMED→LIVE→ENDED→RATED (+DECLINED/CANCELLED); mentor accepts/declines requests (`POST /bookings/:id/accept|decline`), payment only after accept; real availability via public `GET /mentors/:id/slots` (no more hardcoded s1); notifications fanout; also fixed booking-action buttons (string ids broke `runAct`'s `+id`). **P4 RBAC:** superadmin⊇admin⊇student; `requireRole` hierarchy-aware + `requireSuperadmin`; per-admin `permissions[]`; superadmin-only `/admin/admins` (list/promote/edit/demote); frontend `can(scope)` + scope-gated sidebar + aAdmins page; **rahul → superadmin**. **P5 admin console:** mentor INTERVIEW state (`POST /admin/mentors/:id/interview`, review from INTERVIEW, queue+verifyStatus show it); bookings `gsi3-byday` (date-partitioned, scale-safe) + `GET /admin/bookings` + `/admin/mentors/:id/bookings`; ASessions/APayments now REAL. **KEY DEPLOY NOTE:** `httpApi.addRoutes` in service stacks synths routes into **`sc-dev-foundation`** — always `cdk deploy sc-dev-foundation` after adding a route. Amplify jobs 24–29; each phase verified live e2e (throwaway users). Follow-ups: Streams-fed KPI rollup, per-scope backend enforcement (v1 frontend-gated), Google auth-code+PKCE refresh, SES email verification.
- **2026-07-18** — **Big-rework plan approved; Phase 0 + 1 shipped.** New multi-phase plan (onboarding → additive mentor → booking-with-approval → RBAC/superadmin → admin console) approved by owner. **Phase 0 (add-to-list bug):** the choice-list PUT sent `version:null` which the planner `z.number().optional()` rejects (confirmed live: 400 vs 200) → `liveApi` now omits `version` unless it's a number; `INITIAL.choiceList/shortlist` → `[]` (were dummy ids). **Phase 1 (onboarding):** signup → `roleSelect` (student|mentor); `DEFAULT_PROFILE` ranks 850/4200 → 0; auth-gate routes a signed-in-but-not-onboarded user to role-select (onboarded = has ranks OR a mentor application OR admin); onboarding collects NAME; role is no longer swapped for mentors (additive); `auth-identity` rank-prefs allow one rank = 0 (Main-only/Adv-only) with a domain "≥1 rank" check (verified: main-only 200, both-zero 400). Deployed `sc-dev-svc-auth` + Amplify jobs 24/25. Also (ops) hid 13 demo mentors, rahul → admin, Razorpay live verified, Google sign-in live, refresh-token sessions. Remaining: Phases 2–5.
- **2026-07-18** — **Google sign-in enabled — creds from SSM (no Secrets Manager).** Replaced the Secrets-Manager `googleOAuthSecretArn` config with `googleOAuthParam` = an **SSM Parameter Store** name (free: Standard tier + default `aws/ssm` KMS key). New `infra/lib/google-creds.ts` reads that SecureString at **synth time** via the AWS CLI (no new SDK dep) and tolerantly parses JSON **or** dotenv `KEY=VALUE` (owner stored it as `GOOGLE_CLIENT_ID=…`/`GOOGLE_CLIENT_SECRET=…` at `/sc-dev/google-client-secrets`); `bin/app.ts` passes the parsed creds to `AuthStack`, which wires the Cognito Google IdP (`SecretValue.unsafePlainText`, + a client→IdP `DependsOn`). Read failures degrade gracefully (warn → Google OFF) so a credential-less CI `cdk synth` never breaks. Why synth-read not a `{{resolve:ssm-secure}}` ref: Cognito's IdP ClientSecret doesn't support it, and a dynamic ref can't extract one field from a multi-line param. Deployed `sc-dev-auth` (Google IdP CREATE_COMPLETE, WebClient now `[COGNITO, Google]`); **verified** the Hosted-UI `/oauth2/authorize?identity_provider=Google` returns **302 → accounts.google.com**. Frontend `NEXT_PUBLIC_GOOGLE_AUTH=on` (in the git-ignored `.env.local`), rebuilt + Amplify **job 22 SUCCEED**. Caveat noted to owner: the client secret lands in the CFN template (inherent to Cognito federation). Email-verification (SES) path is unchanged/still owner-pending.
- **2026-07-18** — **Predictor: Reach split into its own tab (main = Safe + Target).** Reworked `screens/student.js#Predictor` so the main results list no longer mixes in long-shots: two tabs above the list — **"Safe & Target"** (default) and **"Reach"** — filter the list (`tab === 'reach'` → reach rows, else safe+target). The Safe/Target/Reach overview tiles are clickable and switch tabs (active tab ringed); the Reach tab shows a "<40% chance, aim for a few" explainer; empty states are tab-aware ("no Safe/Target — see N in the Reach tab"). Dropped the redundant sidebar "Result stage" filter (tabs own stage now); the Advanced-filters Reach stage still deep-links to the Reach tab (tab inits from `filters.bucket`). `next build` green (78/78), committed `b0dfd9c`, Amplify deploy **job 21 SUCCEED**, verified live on both domains.
- **2026-07-18** — **Student Dashboard redesigned (spacious) + deployed.** Rebuilt `screens/student.js#Dashboard` to the owner's reference layout: a large "Namaste, <name>" hero + "three simple steps" intro, a full-width deadline banner driven by the active JoSAA round (friendly days-left countdown), three big "What would you like to do?" action cards (Find my colleges / My college list / Talk to a senior, with the live choice-list count), a **"Where do you stand?"** panel showing the REAL Safe/Target/Reach distribution for the student's rank (via `predictCached`, so cached + stable) in plain English ("Almost sure to get / Good chance / Hard to get") **with the % band behind each** (≥80 / 40–80 / <40) so the buckets and their odds are unambiguous, plus "Your next video call" and "Important dates" (from `ROUNDS`). Still fully wired to live data. `next build` green (78/78), committed to `main` (65ebb5a), manual Amplify deploy **job 20 SUCCEED** — live dashboard verified on both `main.dy6751tudpsop.amplifyapp.com` and `counsellor.kodexa.in`. (Frontend-only; no backend change.)
- **2026-07-16** — **Real frontend live: all ~70 designed screens wired to the backend at counsellor.kodexa.in.** Built via multi-agent workflows (foundation → parallel screen wiring → build-fix). `store.js` is now backend-backed (auth gate + hydration of profile/shortlist/choice-list/sessions/notifications; optimistic `book/pay/join/end/rate/cancel`; `resolveCollege` cache; `doLogin/doSignup/doConfirm`), `auth.js` does real Cognito email/password via `amazon-cognito-identity-js` (dev auto-confirms). Screens wired (design unchanged, only data+actions): **auth** (login/signup/onboarding), **student** (23: predictor→list→booking→pay→Google Meet link→rate→notifications→profile), **mentor** (10: profile/availability/verification/bookings/session/earnings), **admin** (stats/queue/moderation/broadcast), marketing CTAs, and the `Chrome.js` shell/nav (login/logout/role + notifications bell). `liveApi` admin moderation paths fixed to `/admin/mentors/:id/{suspend,reinstate}`. `next build` green (75/75 static pages); deployed to Amplify (job 10). Runtime auth flows use the real Cognito pool; `// TODO(owner)` where no backend exists yet (Razorpay checkout UI, JoSAA rounds feed, per-college reviews, payout ledger). Recovery notes: the first two workflow runs failed on a structured-output cap then a session-limit reset — foundation work persisted on disk both times and was reused.
- **2026-07-15** — **Phases 7-10 built via multi-agent orchestration + deployed + tested.** Ran a `build-phases-7-10` workflow (4 parallel authoring agents → sequential integrator → synth/cost verifier; 6 agents, 0 errors). Result: **`@sc/admin`** (Phase 7 — role-gated stats/audit/moderation/broadcast, append-only `sc-dev-audit` table) and **`@sc/analytics`** (Phase 8 — DynamoDB Streams→Lambda→S3 NDJSON + Athena partition-projection DDL + daily reconciliation), plus **Phase 9** hardening (API stage throttling, `ScalingStack` no-op unless `provisionedConcurrency>0`, k6 load-test, `runbooks.md`) and **Phase 10** go-live (`go-live.md`, guarded `deploy.sh`, optional `WarmupStack`, and the comprehensive **`ui-testing-guide.md`**). Integrator: **typecheck 12/12, tests 12/12** (new: admin 8, analytics 6 → suite **75 ✓**). Verifier **cost-safety audit PASS** — no NAT/RDS/idle-WAF/provisioned-concurrency/warmers; S3 BlockPublicAccess+SSL+365d-lifecycle; all 7 DynamoDB tables on-demand. Deployed admin + analytics + audit table + mentors stream + API throttling + observability. Fixed a global S3-name collision (`sc-dev-analytics` → `sc-dev-analytics-<account>`) and re-deployed foundation (admin routes had been skipped when the first analytics deploy aborted). **Deployed e2e 7/7** — admin stats/RBAC-403/suspend-drops-from-search/reinstate/broadcast→🔔/audit + analytics writes landing in S3. All new infra is pay-per-use → ₹0 idle. (WAF-on-HTTP-API, prod `live` alias for scaling, and Razorpay settlement remain `// TODO(owner)`, all OFF/inert by default.)
- **2026-07-15** — **Phase 6 (Notifications) built end-to-end + deployed + tested + wired.** New `@sc/notifications` = a feed API Lambda + an SQS **consumer** Lambda over one table. One EventBridge rule (source prefix `sc.`) fans **every domain event** → SQS (buffer) + **DLQ** (partial-batch-response) → consumer → per-user in-app feed. Pure, tested **fanout** maps `booking.confirmed`/`mentor.approved`/`session.rated`/`refund.issued` → the right users (with the Meet link). API: feed + unread + mark-read/read-all + prefs (delivery gated per-channel; in-app free default; SES/FCM/WhatsApp = TODO owner). Infra: `NotificationsServiceStack` + table (TTL 90d) + observability (DLQ-depth widget + alarm, consumer-errors alarm) — all **pay-per-use, ₹0 idle**. Deployed (5 routes). Tests: integration **6 ✓** (suite **61 ✓**, typecheck **10/10**); **deployed e2e 5/5** — approval notification flowed EventBridge→SQS→consumer→feed in ~3s. Frontend: `liveApi` methods + a `/live` 🔔 card, Amplify job 9. Also detailed **Phases 6-10 build plan** added above (cost-safe).
- **2026-07-15** — **Google Meet link after payment (both sides) + full Phase 0-5 e2e re-verified.** On `payment.captured` the saga now mints a **shared meeting link** (stored on the booking, returned to BOTH student + mentor in `/sessions`, `/bookings/:id`, `/join`) — see `services/booking/src/domain/meeting.ts`. Real Google Meet via the **Google Calendar API is `// TODO(owner)`** (service account + `events.insert` with `conferenceData` → `hangoutLink`; Calendar API is free, no cost impact); until then a clearly-labelled placeholder (`provider:'stub'`, `/lookup/` form so a click never joins a random room) keeps the flow demoable, shown as "🎥 Meet (placeholder)" in `/live`. Booking integration tests **11 ✓**; redeployed booking Lambda + Amplify (job 8). **Full Phase 0-5 e2e green:** local **55 ✓**; deployed — predictor **18/0**, planner **12/0**, marketplace **12/0**, booking+Meet **15/0** (both sides confirmed to see the same link).
- **2026-07-15** — **Phase 5 (Booking, Payments & Sessions) built end-to-end + deployed + tested + wired.** New `@sc/booking` lambdalith implementing the **booking↔payment saga**: `POST /bookings` holds a mentor's slot with an **atomic TransactWrite** (booking + `attribute_not_exists` slot-hold → no double-booking) + **Idempotency-Key** dedupe + TTL on unpaid holds; the **public payment webhook** completes it via an **exactly-once append-only ledger** (keyed by provider payment id) → `CONFIRMED`, then session lifecycle join(→video-token stub)/end/rate and cancel/refund. Razorpay + the SFU are **boilerplate/interfaces only** (`// TODO(owner)`; secrets never touch us). New `sc-dev-bookings` table (gsi1-student + gsi2-mentor, TTL, stream). Infra: `BookingServiceStack` (RW bookings, read-only mentors, PutEvents) + observability (row + alarm), **deployed** (8 routes). Tests: integration **10 ✓** (suite **54 ✓**, typecheck **9/9**); **deployed cross-service e2e 12/12** (mentor approve → book → idempotency → double-book 409 → webhook confirm → replay no-op → join/end/rate → refund). Frontend: `liveApi` methods + a `/live` "My sessions" card driving the saga, redeployed to Amplify (job 7).
- **2026-07-15** — **Phase 4 (Marketplace & Mentors) built end-to-end + deployed + tested + wired.** New `@sc/marketplace` lambdalith: mentor **apply → verify (.ac.in email OTP + ID-stub) → PENDING_REVIEW → admin approve → APPROVED**, editable profile, availability (optimistic concurrency), and a **public `GET /mentors`** search (filters + sort, projection hides email/OTP). New `sc-dev-mentors` table with one sparse GSI (`gsi1-status`) doing double duty for the approved-search and the admin pending-queue. Events emitted via `publish()`. Infra: `MarketplaceServiceStack` (+ PutEvents grant) + mentors table + observability (row + alarm), **deployed to AWS dev** (10 routes). Tests: integration **12 ✓** (suite **44 ✓**, typecheck **8/8**); **deployed authed e2e 12/12** via throwaway mentor + admin Cognito users. Frontend: `liveApi` methods + a `/live` "Mentors" section (become-a-mentor flow + public browse), redeployed to Amplify (job 6). Deferred to owner/Phase 7: real S3 ID upload, SES/SNS OTP, admin console.
- **2026-07-15** — **Phase 3 frontend wired into `/live` + redeployed.** Added a `＋ List` button on each live predictor result and a "My choice list" card that reads the saved list back through the **planner API** (the `/choice-list/doctor` call returns the decorated, bucketed list AND the List Doctor warnings in one shot), with up/down reorder, remove, Safe/Target/Reach summary, and an Export button (shows the 501 "coming soon"). Real cutoff ids flow from the live predictor so they resolve + bucket. `next build` ✓; manual-deployed `out/` to Amplify (job 5 SUCCEED). The dummy main planner screens stay design-only (they use fake ids).
- **2026-07-15** — **Phase 3 (Planner) backend built end-to-end + deployed + tested.** New `@sc/planner` lambdalith (per-user, behind the Cognito authorizer): `GET/PUT /shortlist`, `GET/PUT /choice-list`, `POST /choice-list/reorder`, `GET /choice-list/doctor`, `POST /choice-list/export`. Per-user `sc-dev-planner` table (`SHORTLIST`/`CHOICELIST` rows) with **optimistic concurrency** (atomic version bump + conditional write → 409 on stale). **List Doctor** added to `@sc/catalog-core` (`doctor.ts`, pure rules mirroring the frontend) and made server-authoritative by reusing `analyze()` to bucket saved choices. PDF export = **501 TODO(owner)** stub (S3 + async render deferred). Infra: `PlannerServiceStack`, planner table in `DataStack`, wired in `bin/app.ts`, observability extended (planner row + `planner-errors` alarm) — **deployed to AWS dev** (7 routes). Tests: `@sc/planner` integration **7 ✓** + `@sc/catalog-core` doctor **5 ✓** (full suite **32 ✓**, typecheck **7/7**). **Deployed authed e2e 12/12** via a throwaway Cognito user (choice-list CRUD, reorder, 409, List Doctor, isolation, export). Frontend `liveApi` planner methods added. Also fixed `.gitignore` `lib/` rule that had hidden all CDK infra + frontend live-API source (now committed).
- **2026-07-15** — **Phase 2 finalized: enrichment + HS quota + docs + tests + alarms + prod-ready.** Added institute **enrichment** (`enrich.ts`: short/city/state/NIRF/fees for all IITs+NITs+major IIITs, with fallbacks) so the analysis page fills in, and **Home-State quota** (`pickByQuota`: AI → HS-if-home → OS, `homeQuota` flag). **Deduped the dataset** to a single source (`josaa24.csv`, **11,261 cutoffs / 121 institutes**, `josaa-2024.2`) after the ORCR merge caused IIT duplicates + GFTI mistyping; `deriveType` now checks IIIT before IIT. Wrote **`docs/prediction-algorithm.md`**. Added **integration tests** on isolated tables (`@sc/catalog` 5 ✓ incl. HS quota via API; auth e2e made deterministic with `resetUsers` + `sc-test-users`) — full suite **20 ✓**, typecheck **6/6**. Added **CloudWatch alarms → SNS email** (`sc-dev-alerts`: API 5xx, auth+catalog Lambda errors, throttles, p95 latency) + a Catalog-Lambda dashboard row (deployed ✓). Restored root `esbuild` devDep (bundling regression). **Deployed e2e 18/18 green** against the live API (enrichment, HS-quota-by-state, filters, `/colleges(/:id)`, 404, cache-control). Frontend unchanged this pass (already wired in the prior entry).
- **2026-07-15** — **Real official JoSAA data + main predictor wired.** Replaced the 26-row dummy dataset with **14,023 real JoSAA 2024 cutoffs** (all 144 institutes: IITs/NITs/IIITs/GFTIs; opening+closing per category/quota/gender). Rebuilt `@sc/catalog-core` (types/parse/predict over real cutoffs, quota = AI|OS, IIT→adv / rest→main), unified CSV importer, re-seeded local+cloud (v`josaa-2024`), redeployed catalog Lambda. Wired the **main `/predictor` screen** to the real API (env-gated, dummy fallback) with a live badge + adapted result card (real institute/branch/open/close/quota). Verified: catalog-core tests, deployed `/predict` = 1087 results for adv850/Open (top: IIT Indore CSE Safe), deployed predictor bundle calls the API, CORS from Amplify. **Attribution:** data via Quantum-Codes/JoSAA_2024 (JoSAA site + JIC report) — always verify on josaa.nic.in.
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

## Deployed dev-stack outputs (2026-07-19 redeploy · ap-south-1 · acct 058264128057)

| Key | Value |
|---|---|
| API base URL | `https://um9t7ip0g9.execute-api.ap-south-1.amazonaws.com` |
| Cognito User Pool | `ap-south-1_ubGSCKVZz` |
| User Pool Client | `5ijb4moldr63q261m1esr0qitb` |
| Hosted UI domain | `https://sc-dev-058264128057.auth.ap-south-1.amazoncognito.com` |
| Users table | `sc-dev-users` |
| Catalog table | `sc-dev-catalog` (seeded `josaa-2024.2` — 11,261 cutoffs, 121 institutes) |
| Predictor (public) | `GET {API}/predict` · `/predict/summary` · `/colleges` · `/colleges/:id` |
| Planner table | `sc-dev-planner` (per-user `SHORTLIST`/`CHOICELIST`) |
| Planner (authed) | `GET/PUT {API}/shortlist` · `GET/PUT /choice-list` · `POST /choice-list/reorder` · `GET /choice-list/doctor` · `POST /choice-list/export` |
| Mentors table | `sc-dev-mentors` (`MENTOR#<id>` · gsi1-status) |
| Mentors (authed) | `POST {API}/mentor/apply` · `/mentor/verify/email\|id` · `GET/PUT /mentor/profile\|availability` · `GET /admin/mentors/pending` · `POST /admin/mentors/:id/review` |
| Mentors (public) | `GET {API}/mentors?college&branch&topic&maxPrice&sort` |
| Bookings table | `sc-dev-bookings` (`BOOKING#<id>` · gsi1-student · gsi2-mentor · TTL · stream) |
| Booking (authed) | `POST {API}/bookings` (Idempotency-Key) · `GET /bookings/:id` · `POST /bookings/:id/cancel` · `GET /sessions` · `POST /sessions/:id/join\|end\|rate` |
| Payments (public) | `POST {API}/payments/webhook` (Razorpay-style; sig-verified in prod) |
| Notifications table | `sc-dev-notifications` (`USER#<id>` · `NOTIF#`/`PREFS` · TTL 90d) |
| Notifications (authed) | `GET {API}/notifications` · `POST /notifications/:id/read` · `/read-all` · `GET/PUT /notifications/prefs` |
| Event pipeline | EventBridge rule `sc-dev-domain-events` → SQS `sc-dev-notifications` (+ DLQ) → consumer `sc-dev-notifications-consumer` |
| Audit table | `sc-dev-audit` (append-only `ADMIN#<id>` · `ACT#<ts>`) |
| Admin (authed, role=admin) | `GET {API}/admin/stats` · `/admin/audit` · `POST /admin/mentors/:id/suspend\|reinstate` · `POST /admin/broadcast` |
| Analytics | S3 `sc-dev-analytics-058264128057` (streams→NDJSON, 365d TTL) · Lambdas `sc-dev-analytics-stream` + `-reconcile` (daily) · Athena DDL in `docs/analytics-athena.md` |
| Alerts topic | `sc-dev-alerts` (SNS → email; **owner must click "Confirm subscription"**) |
| **Frontend (Amplify)** | app `d32971gyq5jq34` · **https://main.d32971gyq5jq34.amplifyapp.com** |
| **Custom domain** | `counsellor.kodexa.in` (Amplify → CloudFront `d2u66q58y4x03k.cloudfront.net`) — PENDING owner DNS at Hostinger |

Frontend `.env.local` points at these in Cognito mode. Cognito callbacks + API CORS allow all three origins (localhost, Amplify URL, custom domain). Tear down: `pnpm --filter @sc/infra run destroy -- --context stage=dev`; delete Amplify app `dy6751tudpsop`.

**Hostinger DNS to add (kodexa.in zone) for the custom domain:**
| Purpose | Type | Name | Value |
|---|---|---|---|
| SSL cert validation | CNAME | `_b58439fee0cb6feda31a4a6e9c4dc919` | `_2a39a1aad07abdab47479d35ec8a827d.jkddzztszm.acm-validations.aws` |
| Subdomain | CNAME | `counsellor` | `d2u66q58y4x03k.cloudfront.net` (2026-07-19 redeploy — new target; old `d1m73c1l14jkpt` is dead) |

**Cost note:** the only real fixed cost in this dev stack is the **WAF WebACL (~$5–6/mo)** — and it isn't associated with the API yet (association is a Phase 9 task). Consider removing WAF from the dev stack until Phase 9 to make dev ≈ $0. Everything else (Cognito Lite, DynamoDB on-demand, Lambda, HTTP API) is free-tier at dev volume.

## Notes / parking lot
- Confirm real peak numbers with owner (registered/concurrent) to size provisioned concurrency + DynamoDB floors.
- Get JoSAA round-result publish timestamps each season → drives pre-warm schedule.
- Decide recording retention window (safety vs privacy/DPDP).
- WhatsApp BSP choice (e.g., Gupshup/Interakt) for notifications.
