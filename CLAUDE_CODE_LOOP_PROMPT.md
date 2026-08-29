# Claude Code — Standard Loop Prompt

**Feature:** Phase 11 — Mentor Onboarding, Mentor Dashboard & Admin Console
**Repo:** `backend/` (serverless monorepo) + `student-counselor/` (Next.js 14, static export)
**Usage:** Paste the whole "LOOP PROMPT" block into Claude Code. Re-paste it verbatim every session — it is idempotent and picks up the next unfinished packet on its own.

> This spec was fact-checked against the codebase. The GROUND TRUTH section is the result — it corrects several things the repo's own docs get wrong. Trust it over `progress.md` where they disagree.

---

## LOOP PROMPT — paste everything below this line

You are working in a **docs-driven monorepo**. The workflow contract in `backend/docs/architecture.md` §0 is binding. Follow this loop exactly.

### THE LOOP

1. **Read** `backend/docs/architecture.md` (target design) and `backend/docs/progress.md` (current state). Do not skip this even if you think you remember the repo. Note: both files have stale headers — see GROUND TRUTH §0.
2. **Locate** the Phase 11 section in `progress.md`. If it does not exist, create it from the SPEC below with every packet unchecked, then stop and show me the plan for approval.
3. **Pick the next unchecked task** in the lowest-numbered incomplete packet. One packet per session. Do not jump ahead.
4. **Restate before coding**: the packet, the files you will touch, any contract change, and how you will test it. Under 15 lines.
5. **Implement**, following CONVENTIONS.
6. **Verify**: `pnpm typecheck && pnpm test` at `backend/`, plus the packet's acceptance check. Never claim done on a failing suite.
7. **Update `progress.md`**: tick tasks, add a Changelog entry, add an ADR entry for any design decision. If the implementation deviates from `architecture.md`, update that too — never let docs drift from code.
8. **Report**: what shipped, what's deferred and why, what's next. Then stop for review.

**Stop and ask instead of guessing when:** a packet needs a credential or third-party account I haven't provided; a change would break a deployed contract; or the spec is ambiguous about a business rule. Never invent business logic to fill a gap.

---

### GROUND TRUTH — read before planning

The repo's own docs are stale in specific ways. These were verified directly against the code.

**§0 — Stale docs.** `architecture.md`'s header says "DRAFT — awaiting owner approval before any code is written" and `progress.md` line 7 says "Phase 0 + Phase 1 scaffolded", but the phase tracker shows ✅ through Phase 10 and the code is deployed. Fix both headers as part of packet 1 so future sessions aren't misled.

**§1 — The frontend consoles already exist. Do not rebuild them.**
- `student-counselor/src/screens/mentor.js` — ~652 lines, 10 mentor screens, live-wired.
- `student-counselor/src/screens/admin.js` — ~736 lines, ~15 admin screens, live-wired to `liveApi.adminStats / adminAudit / mentorPending / mentorReview / adminSuspendMentor / adminBroadcast / adminAdmins / promoteAdmin / demoteAdmin`.
- Admin sidebar shell exists in `src/components/Chrome.js`; per-scope nav gating via `ADMIN_LINKS` in `src/lib/data.js`.

Packets 5 and 6 are **extend and complete**, not greenfield. Read both screen files in full before touching either.

**§2 — Routing: there is no `/mentor/*` or `/admin/*` namespace.** The app uses a single optional catch-all (`src/app/[[...slug]]/page.js`) with flat kebab slugs from `idToSlug()`. Real routes are `/m-dashboard/`, `/m-verification/`, `/a-dashboard/`, `/a-verify-queue/`, `/a-admins/`. **Add new screens to the existing scheme.** Creating a nested route tree would be the parallel implementation this prompt forbids.

**§3 — Static export ⇒ no server-side gating.** `next.config.mjs` sets `output: 'export'` + `trailingSlash: true`. There is no middleware and no server render. Route gating in the shell is a **UX affordance only** — every authorization decision must be enforced by the API. Never rely on a hidden nav link as a security control.

**§4 — Secrets live in SSM Parameter Store, not Secrets Manager.** `packages/shared/src/secrets.ts` reads an SSM SecureString via `SECRETS_PARAM`; `infra/lib/config.ts` documents this as a deliberate cost decision ("SSM Standard tier + default aws/ssm KMS key, no Secrets Manager"). Follow it for the Google credential too.

**§5 — `rahul.raj9237@gmail.com` already appears in `infra/lib/config.ts` as `alertEmail`** (AWS Budget alerts). That is unrelated to the superadmin work — don't mistake it for existing wiring. `SUPERADMIN_EMAIL` exists nowhere.

**§6 — `SUSPENDED` is a real status that isn't in the type.** `services/admin/src/repo/mentors.repo.ts` writes `status: 'SUSPENDED'` against a loosely-typed `status: string`, so the compiler never catches it. Any state machine that ignores it will orphan suspended mentors.

**§7 — Backend scope enforcement does not exist.** `ADMIN_SCOPES` is defined, persisted, and consumed by the *frontend* (`store.js#can()`), but there is no `requireScope` helper and every admin route uses `requireRole(p,'admin')` alone. **Today an admin with zero scopes passes every backend check.** Scope gating is net-new backend work.

**§8 — `POST /admin/mentors/:id/interview` already exists** (`app.ts` → `scheduleInterview`), and its `InterviewInput` requires `interviewLink` as a non-optional URL, with no `durationMin`. `liveApi.mentorScheduleInterview(id, interviewAt, interviewLink, note)` calls that shape. Packet 4 changes this contract — migrate both sides together (see the packet).

**§9 — `mentor.interview.scheduled` is already mapped** in `services/notifications/src/domain/notifications.ts`, and `scheduleInterview` already publishes it. Unmapped: `mentor.applied`, `mentor.verification.submitted`.

**§10 — The `gsi1-status` GSI cannot do oldest-first.** `gsi1sk` is `userId` (a UUID) for pending rows and `${college}#${userId}` for approved ones — not time-ordered. `mentorsRepo.listByGsi()` also takes no cursor and loops `LastEvaluatedKey` internally until the whole queue is in memory. Packet 3 must add a time-ordered sort key and a real cursor, not reuse this helper.

**§11 — `publish()` is a no-op under `isLocal()`** (`packages/shared/src/events.ts`). Tests asserting "this transition emits an event" need a spy, not a local DynamoDB round-trip.

**§12 — Local test counts:** marketplace 12, booking 11, admin 8 (`it()` blocks). The "12/12, 7/7" figures in `progress.md` are *deployed* e2e runs, not `pnpm test`. Use the local numbers as your regression baseline.

---

### CONVENTIONS (non-negotiable)

- **Follow existing patterns, don't invent new ones.** Every service is `src/app.ts` (Hono route table) → `src/handlers/*` (HTTP glue, zod parse) → `src/domain/*` (business logic, guards, events) → `src/repo/*` (DynamoDB). Mirror it. Code that doesn't look like `services/marketplace` is wrong.
- **Validation at the edge, authorization in the domain.** Zod schemas in `src/types.ts`; `requireRole` / `requireSuperadmin` / scope checks inside the domain function, never only on the route.
- **Single-table DynamoDB discipline.** Extend `sc-<stage>-mentors` and its indexes. Add access patterns, not tables, unless a packet says otherwise. Document new key shapes in `architecture.md`.
- **Optimistic concurrency** on every multi-writer mutation, as `availability` and the planner do it (atomic `ADD #version :one` + `ConditionExpression`) → stale write returns **409**.
- **Never leak internals to the browser.** The `publicView` projection (`domain/mentors.ts`) is mandatory: documents, essays, reviewer notes, interview notes, OTPs and emails must never reach a public or student-facing response.
- **Events, not coupling.** Transitions emit domain events via `publish()`. Notifications react to events — never call the notifications service directly.
- **Secrets** go in SSM Parameter Store per GROUND TRUTH §4. Never hardcode, commit, or log.
- **Tests are part of done.** Integration tests against isolated `sc-test-*` tables, following `services/marketplace/test/marketplace.e2e.test.ts`. Pure logic (state machine, scope checks, projections) gets unit tests.
- **Files stay small.** Past ~300 lines, split by concern. Many small pure functions over one big handler.
- **Frontend** API calls go through `src/lib/liveApi.js` — no scattered `fetch`. New screens follow the existing slug/registry pattern (§2).
- **Minors are users.** 17–18 year olds. Uploaded ID documents are sensitive personal data: private bucket, no public URLs ever, presigned short-TTL only, every access written to the audit trail.

---

### SPEC — Phase 11

#### Packet 1 — Superadmin bootstrap + doc correction

Make **rahul.raj9237@gmail.com** the superadmin, deterministically and idempotently.

- Add `SUPERADMIN_EMAIL` to `packages/config` (zod-validated), `.env.example`, and wire it through `infra/lib/config.ts` to the auth service.
- On `POST /auth/bootstrap`, if the signed-in user's **Cognito-verified** email matches `SUPERADMIN_EMAIL` case-insensitively, set `role=superadmin` (Cognito `custom:role` + users-table row) with all scopes. Idempotent.
- Match on the verified email claim only — never a client-supplied body.
- **Close the self-demotion hole:** `POST /me/role` (`domain/profile.ts#switchRole`) accepts `student|mentor` with no superadmin check, so a superadmin can currently lock themselves out. Reject the switch when `p.role === 'superadmin'`.
- Audit-log every promotion.
- Fix the stale headers in `architecture.md` and `progress.md` (GROUND TRUTH §0).
- **Tests:** correct email promoted; different casing promoted; unverified email **not** promoted; lookalike address not promoted; second run is a no-op; superadmin `POST /me/role` returns 403.

**Done when:** signing in as that Google account yields `role=superadmin`, `/admin/admins` returns 200 for it and 403 for everyone else, and the superadmin cannot demote themselves.

---

#### Packet 2 — Backend scope enforcement

Net-new, and a prerequisite for packet 3 (GROUND TRUTH §7).

- Add `requireScope(p, scope)` / `hasScope(p, scope)` to `packages/shared/src/auth.ts`. Superadmin satisfies every scope, mirroring how `requireRole` already treats hierarchy.
- Scopes must reach the domain. Decide and document (ADR) whether they ride in the JWT or are loaded from the users row per request — if the token route, note that scope changes only apply on the user's next token, and make the admin UI say so.
- Apply `requireScope` to existing admin routes: `mentors.manage` on review/suspend/reinstate, `mentors.interview` on scheduling, `broadcast.send` on broadcast, `users.view` on user listing.
- Frontend `store.js#can()` already gates nav by scope — align the names exactly so UI and API agree.
- **Tests:** admin with the scope passes; admin without it gets 403; superadmin passes without explicit scopes; scope changes take effect per the ADR'd model.

---

#### Packet 3 — Rich mentor application + real ID upload

Replace the thin `ApplyInput` and the `docRef` stub.

**Application fields** (extend `ApplyInput`, keep existing):

| Group | Fields |
|---|---|
| Identity | full name, college, branch, year, graduation year, roll number |
| Contact | official college email (`.ac.in`), phone |
| Documents | college ID card (required), one optional supporting doc (admit card / fee receipt / degree certificate) |
| Profile | bio, topics, price, languages, own JEE rank + year |
| Essays | "Why do you want to become a mentor?" (100–800 chars, required); "How will you help a student during JoSAA counselling?" (100–800 chars, required); "Anything else we should know?" (optional) |
| Consent | code-of-conduct acceptance, stored with timestamp + version |

**Uploads:**
- `POST /mentor/documents/presign` → short-TTL presigned **PUT**, server-generated key `mentors/<userId>/<docType>/<ulid>.<ext>`, content-type and size enforced (images + PDF, ≤ 5 MB). The client never chooses the key.
- Private bucket: SSE, versioning, block-all-public-access, lifecycle rule for rejected applications.
- Admin reads via a short-TTL presigned **GET** minted per request and written to the audit log — never a stored URL.
- `POST /mentor/documents/confirm` records the object on the application after verifying it exists.

**Email verification:** keep the `.ac.in` OTP flow but require the user to be signed in and bind the OTP to their `userId`. Deliver via SES in prod; keep the `devOtp` shortcut behind the stage check. Rate-limit per user and per email.

**Submission:** `POST /mentor/submit` moves `DRAFT → PENDING_REVIEW` only when every required field, both required essays, the ID card, the verified email and the consent are present. The error names **every** missing item, not just the first.

**Tests:** each missing requirement blocks submission with a precise message; presign rejects bad content-type and oversized files; a mentor cannot presign or read another mentor's document; `publicView` leaks no essay, document, phone or email field.

---

#### Packet 4 — Verification state machine

```
DRAFT
  → PENDING_REVIEW       (submitted; admin-visible; documents UNVERIFIED)
  → DOCS_VERIFIED        (admin manually checked every document + detail)
  → INTERVIEW_SCHEDULED  (Meet link + Calendar invite issued — packet 5)
  → APPROVED | REJECTED  (admin decision after the interview)
```

- Add `DOCS_VERIFIED` and `INTERVIEW_SCHEDULED` to `MentorStatus`. Keep `INTERVIEW` as a deprecated alias mapped forward — do not orphan stored rows.
- **Model `SUSPENDED` properly** (GROUND TRUTH §6): add it to the union, type `services/admin/src/repo/mentors.repo.ts` strictly so the compiler catches it, and define its legal transitions (suspend from `APPROVED`, reinstate back to `APPROVED`).
- **Per-field verification.** Every submitted detail and document carries `{ status: 'UNVERIFIED' | 'VERIFIED' | 'FLAGGED', by, at, note }`. `DOCS_VERIFIED` is reachable only when all required items are `VERIFIED`. This is the "admin verifies manually" requirement — granular, not one big button.
- **Legal transitions only**, in one pure exhaustively-tested function (`domain/state.ts`). Illegal → 409. Every transition writes an audit entry and emits an event (spy-assert per GROUND TRUTH §11).
- **Rejection** requires a reason. Support soft reject (back to `DRAFT`, reviewer notes visible to the mentor, re-apply allowed) vs hard reject — mentor-facing copy differs.
- **Admin queue:** `GET /admin/mentors?status=&q=&cursor=`. Per GROUND TRUTH §10 this needs a **time-ordered sort key** (e.g. `gsi1sk = submittedAt#userId`) and a real cursor — `listByGsi()` must be rewritten, not reused. Never load the whole table into memory. Returns the full application: all fields, essays, per-field state, document references.
- Scope-gated via packet 2: `mentors.manage` for verification/decisions, `mentors.interview` for scheduling.

---

#### Packet 5 — Interview scheduling (real Google Calendar + Meet)

Implement the `TODO(owner)` in `services/booking/src/domain/meeting.ts` for real, and reuse it for interviews.

- **Google Calendar API** `events.insert` with `conferenceData.createRequest` (`hangoutsMeet`), `conferenceDataVersion=1`; read back `hangoutLink` and `event.id`. Auth via a Google Workspace **service account with domain-wide delegation**; credential in **SSM Parameter Store** (GROUND TRUTH §4).
- Put it behind a `CalendarProvider` interface with `GoogleCalendarProvider` and the existing stub, selected by config. Tests run against the stub; the real provider gets a contract test that skips without credentials.
- **Contract migration (GROUND TRUTH §8).** The endpoint already exists and requires `interviewLink`. Move to `{ interviewAt, durationMin, note? }` with the link now server-generated:
  1. accept both shapes for one release — if `interviewLink` is supplied, honour it and skip Calendar creation;
  2. update `liveApi.mentorScheduleInterview` and the admin screen to the new shape;
  3. only then drop `interviewLink` from `InterviewInput`.
  Do not break the deployed caller in a single step.
- The handler: validates the transition (`DOCS_VERIFIED` only) → creates the Calendar event with the mentor and interviewing admin as attendees → stores `{ eventId, meetUrl, interviewAt, scheduledBy }` → moves to `INTERVIEW_SCHEDULED` → emits `mentor.interview.scheduled` (already mapped in notifications, GROUND TRUTH §9).
- The **email invite** is the Calendar attendee invitation itself, plus the existing in-app notification.
- **Reschedule** (`PATCH`) updates the same event; **cancel** deletes it and returns to `DOCS_VERIFIED`. Never orphan a Calendar event.
- **Idempotency:** a retried schedule must not create a second event — key on `(mentorId, interviewAt)`.
- If Calendar fails, the transition must not half-commit: surface a clear admin error, leave the application where it was.
- Post-interview `POST /admin/mentors/:id/review { decision, note }` → `APPROVED` or `REJECTED`; note required on reject.

**Ask me for the service-account credential before starting this packet if it isn't already in SSM.** Build against the stub and stop — do not fabricate one.

---

#### Packet 6 — Mentor dashboard (extend `src/screens/mentor.js`)

Read the existing ~652-line file and its registered slugs first; extend, don't replace. New screens use the existing slug scheme (`m-*`). Gating in the shell is UX only — the API enforces (GROUND TRUTH §3).

1. **Application status** — the pipeline as a visible timeline (Submitted → Docs verified → Interview scheduled → Decision): current stage, what's blocking, what happens next, interview date + Meet link when scheduled. A rejected mentor sees the reason and whether re-applying is allowed. **This screen matters from `DRAFT` onward — it is the entire pre-approval experience.**
2. **Profile** — edit bio, topics, price, languages. Identity fields (college, branch, year, roll number) locked after approval: show read-only with a "request a change" path rather than hiding them.
3. **Availability** — slot manager on the existing optimistic concurrency. A 409 renders as "your availability changed elsewhere, reload" — never a raw error.
4. **Sessions** — upcoming and past, each with the student's first name, the Meet link, and join/end/rate wired to the existing booking endpoints.
5. **Students & prep** — for each upcoming session: the student's rank, category, home state, target branches, and any note they left. Read-only, and only for a booked session — never a browsable student directory.
6. **Earnings & payouts** — per-session gross, platform commission, net; pending vs released; payout history. Read from the existing booking ledger — do not create a second source of truth. Payout batching isn't built: show released/pending honestly and mark the rest "coming soon" rather than faking numbers.
7. **Ratings & feedback** — average, distribution, per-session written feedback, trend over time, sourced from `session.rated`.

**Gating:** unapproved mentors see 1–2 only; 3–7 unlock on `APPROVED`; a suspended mentor gets a clear banner and read-only screens, not a broken app.

---

#### Packet 7 — Admin console (extend `src/screens/admin.js`)

Read the existing ~736-line file and `ADMIN_LINKS` first. Extend the existing screens and slugs (`a-*`).

1. **Verification queue** *(the core screen)* — filterable by status, oldest-first, wait time per application. Opening one shows every field and essay side-by-side with the documents (inline preview via presigned GET), per-field Verify / Flag controls, a running "N of M verified" counter, and only the actions legal from the current state — `DOCS_VERIFIED` and `Schedule interview` stay disabled until everything is verified.
2. **Mentor directory** — all mentors regardless of status; suspend / reinstate (existing endpoints); full status history.
3. **Interview calendar** — scheduled interviews, upcoming first, with reschedule and cancel.
4. **Admin team** *(superadmin only)* — list, promote with scopes, edit scopes, demote, on the existing `listAdmins` / `setAdmin` / `demoteAdmin`. If packet 2 ADR'd token-carried scopes, say plainly that changes apply on the admin's next sign-in.
5. **Audit log** — the existing append-only trail, filterable by actor, action, date. Read-only and visibly so.
6. **Overview** — existing `/admin/stats` counters plus queue health: applications waiting, average time per stage, interviews this week.

Every state-changing action needs a confirm step stating exactly what will happen and who gets notified. Every new admin action writes to the audit trail.

---

#### Packet 8 — Hardening

- Deployed-stage e2e: sign in as superadmin → mentor applies with real uploads → admin verifies each field → schedules interview (stub provider) → approves → mentor dashboard renders → booking flow still green.
- No regressions against the **local** baseline (GROUND TRUTH §12): marketplace 12, booking 11, admin 8.
- CloudWatch alarms for new Lambdas, matching existing observability rows.
- Audit trail captures every new admin action; document access logs the accessing admin's id.
- Update `architecture.md` — §5.5 `marketplace-mentors` exists; the mentor-lifecycle, S3 document store and Calendar integration sections are **new sections to write**, not edits.
- Update `progress.md`: Phase 11 complete, ADRs, changelog.
- Security pass: no document URL public or long-lived; no essay/email/phone/document field in any public response; every new route role- **and** scope-gated; rate limits on OTP and presign; static-export gating never used as a security control.

---

### FIRST RUN

Do not write code yet. Read `architecture.md`, `progress.md`, `src/screens/mentor.js` and `src/screens/admin.js`, verify the GROUND TRUTH claims for yourself, then propose the Phase 11 section for `progress.md` with the eight packets and their tasks. Flag anything in this spec that conflicts with what you find. Wait for my approval before packet 1.

## END OF LOOP PROMPT

---

## Between-session shorthand

- `Continue the Phase 11 loop.` — next packet, same rules
- `Continue the Phase 11 loop. Redo packet N — <what was wrong>.` — rework
- `Pause the loop. Explain how <X> works and what would break if we changed it.` — inspect without changing anything
