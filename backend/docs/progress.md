# Student-Counselor Backend — Progress & Status

> **This file is the current state of the build.** Read `architecture.md` for the *target*, read this for *where we are* and *what's next*. Update this file after every change.

---

## 🔴 Current status: **PLANNING — awaiting owner approval**

Nothing is built yet. `architecture.md` is drafted with HLD + per-service LLD, data model, caching, scaling, security, cost, tech stack, phase plan, and API surface. **No boilerplate will be written until the owner approves the architecture and resolves the open decisions (§15).**

**Next action (blocked on approval):** once approved → scaffold **Phase 0 (Foundations)**, then **Phase 1 (Auth & Identity)**, boilerplate-only with `// TODO(owner)` markers.

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
| 0 | Foundations (monorepo, CDK, CI/CD, shared libs, obs) | ⬜ | blocked on approval |
| 1 | Auth & Identity (Cognito, JWT, profile, roles) | ⬜ | |
| 2 | Catalog + Predictor *(CORE)* | ⬜ | the hook; caching-heavy |
| 3 | Planner *(CORE)* | ⬜ | choice list + List Doctor |
| 4 | Marketplace & Mentors | ⬜ | verification workflow |
| 5 | Booking, Payments & Sessions *(CORE)* | ⬜ | booking↔payment saga; video |
| 6 | Notifications & Timeline | ⬜ | event-driven |
| 7 | Admin & Ops | ⬜ | verification queue, moderation |
| 8 | Analytics & Reporting | ⬜ | streams → Athena |
| 9 | Hardening & Scale | ⬜ | load test to 5k rps, runbooks |
| 10 | Go-live & Seasonal Ops | ⬜ | canary, ramp automation |

### Current phase task checklist
_(Populated when Phase 0 starts. Example shape:)_
- [ ] `infra/` CDK app + per-env config
- [ ] `packages/shared` (logger, errors, DDB/Redis clients, auth util)
- [ ] CI/CD pipeline (lint, test, `cdk diff`, deploy dev)
- [ ] Hello-world service behind API GW + Cognito authorizer stub
- [ ] Observability baseline (structured logs, X-Ray, dashboards)

---

## Open decisions — awaiting owner (mirrors architecture.md §15)

| # | Decision | Default (recommended) | Owner choice |
|---|---|---|---|
| 1 | DB path | **A: DynamoDB-only + Athena** | _pending_ |
| 2 | Video provider | **100ms** | _pending_ |
| 3 | IaC | **AWS CDK (TS)** | _pending_ |
| 4 | API composition | **Lambdalith per service (Hono)** | _pending_ |
| 5 | Payments gateway | **Razorpay** | _pending_ |
| 6 | Auth | **Cognito** | _pending_ |
| 7 | Monorepo home | **Same repo as frontend** | _pending_ |

---

## Decision log (ADRs)

> Short, append-only. One entry per real decision. Format: date · decision · why · alternatives.

- **2026-07-14 · ADR-000 · Docs-driven workflow.** `architecture.md` = target, `progress.md` = status; update both on every change. *Why:* keep design and code from drifting across sessions.
- **2026-07-14 · ADR-001 (proposed) · Serverless-first, cache-hard, compute-not-query.** Lambda + DynamoDB + multi-layer cache; managed SFU for video; optional SQL off hot path. *Why:* seasonal scale-to-zero + read-dominated shareable load. *Alternatives:* ECS Fargate (pays while idle), Aurora-primary (idle cost + conn mgmt). *Status:* proposed — awaiting approval.

---

## Changelog

- **2026-07-14** — Exported HLD + LLD as an editable Excalidraw board: <https://excalidraw.com/#json=qxTGcHGRxwob_1rYeg1G5,ItJzbPT2eFo8gyY2I5psXg> (HLD layered architecture, caching ladder, Predictor cache-path, Booking/Payment saga).
- **2026-07-14** — Drafted `architecture.md` (HLD, per-service LLD, data model, caching, scaling, security, cost, tech stack, phase plan, API surface) and this `progress.md`. Status: awaiting approval.

---

## Notes / parking lot
- Confirm real peak numbers with owner (registered/concurrent) to size provisioned concurrency + DynamoDB floors.
- Get JoSAA round-result publish timestamps each season → drives pre-warm schedule.
- Decide recording retention window (safety vs privacy/DPDP).
- WhatsApp BSP choice (e.g., Gupshup/Interakt) for notifications.
