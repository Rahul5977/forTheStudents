# AI Counsellor — Progress & Status

> **This file is the current state of the AI Counsellor build.** Read `Plan.md` for the *target*, read this for *where we are* and *what's next*. Update this file after every change. Platform-wide status stays in `../progress.md`.

---

## 🟡 Current status: **Plan v3 written — awaiting owner approval + open decisions**

`Plan.md` went through three design iterations (RAG chatbot → tool-grounded agent → agent + cost/scale/safety/evals) and is finalized as v3 on **2026-08-29**. No code exists yet.

**Next actions:**
1. Owner: read `Plan.md`; approve or override the **8 open decisions** in §14 (model/tier, quota & pricing, transport, provider/residency, Hindi script, retention, refusal fallbacks, who can chat).
2. Owner: create the Anthropic API key and store it as SSM SecureString `/sc-dev/anthropic-api-key` (same pattern as the Google creds).
3. Claude: scaffold **Phase C0** (boilerplate + `// TODO(owner)` markers only) once approved.

---

## How Claude uses these docs (every session)
1. Read `../architecture.md` (platform target) → `Plan.md` (counsellor target) → this file (status).
2. Work only on the **current phase**; do the **next unchecked task**.
3. Scaffold **boilerplate + `// TODO(owner)` markers only** — do not invent business logic (effort policy, quota policy, opinion tuning are owner-authored). Document each TODO's expected input/output.
4. After changes: tick the task, update **Changelog**, add an **ADR** entry if a decision was made, and mirror any platform-level change in `../progress.md`.
5. Owner review at each phase boundary before starting the next. Commit + push to `origin/main` after a phase is done and tested.

---

## Phase tracker

Legend: ⬜ not started · 🟡 in progress · ✅ done · ⛔ blocked

| Phase | Name | Status | Notes |
|---|---|---|---|
| — | Plan (3 iterations → v3) | ✅ | `Plan.md` written 2026-08-29; awaiting approval |
| C0 | Foundations (service, table, key, streaming URL, JWT, quota, flags, SSE, chat shell) | ⬜ | blocked on §14 decisions + API key |
| C1 | Grounded college brain (tools 1–5, cards, citations, guard, answer cache, golden v1) | ⬜ | |
| C2 | Process knowledge & honest counsellor (KB, timeline, opinion policy, Hindi, safety, mentors, fast paths) | ⬜ | KB docs are owner-authored original prose (legal rule) |
| C3 | Choice-list co-pilot (planner tools, propose→apply, doctor, memory, summaries) | ⬜ | |
| C4 | Scale & cost (effort routing, cache verification, load test, limits, degradation, budget auto-kill) | ⬜ | records the *measured* cost/1k msgs that replaces Plan §8.3 estimates |
| C5 | Evals, red-team, launch (CI gate, feedback loop, canary, runbooks) | ⬜ | |

---

## Phase C0 — Foundations
- [ ] `packages/counsellor-core` scaffold: `prompt/system.ts` (+`PROMPT_VERSION`), `sse.ts`, `router.ts` (rules only), `context.ts`, `guards.ts` stubs, vitest config
- [ ] `services/counsellor` scaffold: Hono app, `handler.ts` (HTTP API) + `stream-handler.ts` (Function URL `RESPONSE_STREAM`), in-function Cognito JWT verify (`aws-jwt-verify`), `repo/counsellor.repo.ts` access patterns for §7.4, local dev server
- [ ] `infra/lib/counsellor-service-stack.ts`: Lambda (Node 20 ARM64, 1024 MB, 120 s), Function URL + CORS, `sc-{stage}-counsellor` table (on-demand, PITR, TTL, stream), SSM key read, IAM (catalog read, planner/marketplace invoke via HTTP, `events:PutEvents`), alarms; HTTP API routes (land in foundation stack — redeploy it)
- [ ] Stage config: `counsellor.*` knobs (§7.6) with cost-safe defaults; `enabled=false` until C1
- [ ] Quota + flags: `USAGE#date` atomic counter, `CONFIG/FLAGS` memoized read, kill switch route
- [ ] LLM client wrapper (`domain/llm.ts`): streaming, top-level `cache_control`, pinned `effort`/`thinking` per route, `fallbacks:"default"`, refusal handling, usage telemetry (EMF)
- [ ] Frontend: replace teaser with chat shell (streaming text, SSE parser in `liveApi`, `?stream=false` fallback), quota meter
- [ ] Acceptance: "hi" streams end-to-end on dev · quota decrements · kill switch returns busy · `cache_read_input_tokens > 0` on the 2nd message

## Phase C1 — Grounded college brain
- [ ] Tools 1–5 (`resolve_college`, `predict_colleges`, `get_college`, `compare_colleges`, `get_cutoff_trend`) as zod-typed executors in `counsellor-core/tools`, over the in-memory catalog snapshot
- [ ] `aliases.json` (Trichy, BHU, Warangal…) + fuzzy resolver + tests
- [ ] Agent loop (§5.3) with parallel tool execution, ≤ 6 iterations, wall-clock budget, SSE `tool_start`/`card`/`citation`
- [ ] Card renderers in frontend (reuse predictor rows / compare table / trend chart components)
- [ ] Guards: institute-name validator, number-traceability, citation presence; corrective retry; flag write
- [ ] Answer cache (`ACACHE#hash` keyed on intent+entities+rank bucket+dataset version)
- [ ] Golden set v1 (100 cases: facts/compare/predict) + deterministic eval runner
- [ ] Acceptance: 0 hallucinated institutes · ≥ 95% numbers traceable · TTFT p95 < 4 s (dev)

## Phase C2 — Process knowledge & the honest counsellor
- [ ] `kb/*.md` (~40 original docs; **owner-authored prose**) + chunker + BM25 index at cold start + `search_knowledge`
- [ ] `timeline.json` + `get_timeline` + admin `PUT /admin/counsellor/timeline`
- [ ] Opinion policy prompt section + rubric cases; language detection + script matching; distress protocol + helplines; `find_mentors`
- [ ] Fast paths (Appendix C) — templated replies + chips, no LLM
- [ ] Acceptance: process recall ≥ 90% · opinion rubric ≥ 4.2 · distress 100% helpline · Hindi cases pass

## Phase C3 — Choice-list co-pilot
- [ ] `get_choice_list` (planner HTTP w/ forwarded JWT) · `propose_choice_list` (validate + in-loop `listDoctor`) · list-diff card with Apply/Undo (client → `PUT /choice-list`)
- [ ] `remember` tool + `MEMORY` item + Settings panel (view/delete); auto-extract on conversation end
- [ ] Rolling summary when history window overflows
- [ ] Bucket-consistency backtest (500 synthetic students)
- [ ] Acceptance: build a 25-row list from scratch via chat · apply/undo · backtest passes

## Phase C4 — Scale & cost
- [ ] Effort routing per intent; verify pinned params; cache-read ratio metric + alarm
- [ ] k6 streaming load test 2k → 20k concurrent; reserved concurrency; Lambda limit + Anthropic limit increase requests filed
- [ ] Degradation mode (deterministic-only) + circuit breaker; budget auto-kill at 100%, alarm at 80%
- [ ] Cost dashboard; record **measured** cost/1k msgs here and in Plan §8.3
- [ ] Acceptance: SLOs at 5k concurrent on dev limits · 429 storm degrades gracefully

## Phase C5 — Evals, red-team, launch
- [ ] CI eval gate on prompt/tool/router/guard changes; nightly in-season run
- [ ] Red-team suite; 👎 → flag queue → golden-set loop
- [ ] Canary 5% → 100%; go-live checklist (key rotation, limits, budget, KB review); runbooks
- [ ] Acceptance: gate blocks a deliberately bad prompt · canary 48 h clean · owner sign-off

---

## Open decisions — awaiting owner (mirrors Plan.md §14)

| # | Decision | Plan default | Status |
|---|---|---|---|
| 1 | Model / tier | `claude-opus-5`, effort-routed; measure before any cascade | ⬜ |
| 2 | Quota & pricing | free 10/day, paid 60/day | ⬜ |
| 3 | Streaming transport | Lambda Function URL (SSE) | ⬜ |
| 4 | Provider account & residency | Anthropic direct (Bedrock/ap-south-1 if residency required — verify model availability) | ⬜ |
| 5 | Hindi output script | match the student's script | ⬜ |
| 6 | Transcript retention | 180 days | ⬜ |
| 7 | Refusal fallbacks | on | ⬜ |
| 8 | Who can chat | logged-in students only | ⬜ |

---

## Decision log (ADRs)

- **2026-08-29 · AC-ADR-000 · Docs-driven, same contract as the platform.** `Plan.md` = target, this file = status. Boilerplate + `TODO(owner)` only.
- **2026-08-29 · AC-ADR-001 · Agent over our own tools, not RAG.** Numbers come from tool results over the live catalog snapshot; cards are deterministic; prose is the model's. *Why:* rank-aware answers need computation; hallucinated numbers are unacceptable; no vector DB cost. *Rejected:* v1 RAG chatbot (Plan §3).
- **2026-08-29 · AC-ADR-002 · Cost architecture is part of the design, not an optimization.** Prompt-prefix caching invariant, deterministic fast paths, shared answer cache, effort routing, quotas, budget auto-kill. *Why:* chat is per-user; the predictor's cache-once trick doesn't apply; at 1M students LLM spend dominates (Plan §8.3).
- **2026-08-29 · AC-ADR-003 · Streaming via Lambda Function URL (RESPONSE_STREAM), JWT verified in-function.** *Why:* API GW HTTP API can't stream; WebSocket adds a connection table for no v1 benefit. Polling route kept as fallback + eval harness.
- **2026-08-29 · AC-ADR-004 · Choice-list writes are proposals, never tool side-effects.** The client applies the diff via the existing planner API. *Why:* reversibility + user consent; only benign write (`remember`) is a tool.
- **2026-08-29 · AC-ADR-005 · Single model, pinned params per route; no cascade until measured.** *Why:* caches are model-scoped; effort/thinking changes invalidate the messages cache; measure `low`/`medium` effort on `claude-opus-5` before a cheaper-model cascade (owner decision #1).
- **2026-08-29 · AC-ADR-006 · Manual streaming loop, not the SDK tool runner.** *Why:* custom SSE events per tool, wall-clock + iteration budget, mid-stream guards, explicit `pause_turn`/`refusal` handling.

---

## Changelog
- **2026-08-29** — **Plan v3 written** (`Plan.md`, 3 iterations) + this tracker created. Reviewed the live platform (catalog `/predict` `/colleges/:id/profile` `/colleges/compare`, planner, `catalog-core` predictor/doctor/forecast/institutes/content, shared auth/http, teaser screen `student.js#AICounsellor`) so every counsellor tool maps to an existing pure function or service. No code written.

## Notes / parking lot
- Verify Claude model availability + pricing on Bedrock `ap-south-1` before deciding #4.
- Priority Tier does not cover `claude-opus-5` — relevant if guaranteed spike capacity outranks model choice.
- Notifications tie-in (C6 candidate): "your list has 0 Safe rows — want the counsellor to fix it?" via the existing EventBridge → SQS consumer.
- v2 KB: admin upload → S3 → hot reload; embeddings only if BM25 recall < 90%.
- Cognito → Firebase auth migration (platform ADR-007) only touches the in-function JWT verifier here.
