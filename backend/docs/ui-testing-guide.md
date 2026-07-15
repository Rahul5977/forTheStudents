# Test Everything From Your Browser — a friendly, step-by-step guide (Phases 0–10)

Hey! 👋 This guide walks you through testing the **entire** Student-Counselor backend by
clicking around a real browser — no code needed for most of it. Everything you touch here is
the **real deployed backend** (Cognito + API Gateway + Lambda + DynamoDB in `ap-south-1`), not a
mock. Where a button doesn't exist yet, I've given you a copy-paste `curl`/`aws` command so you
can still exercise the feature.

Take it one phase at a time. Each section says **what to click** and **what you should see**. If
something doesn't match, that's a finding worth noting. Let's go. 🚀

---

## The two URLs you'll live in

| What | URL |
|---|---|
| **Frontend (Amplify)** | **https://main.dy6751tudpsop.amplifyapp.com** |
| **The test page** (everything below happens here) | **https://main.dy6751tudpsop.amplifyapp.com/live** |
| Custom domain (once DNS is live) | `https://counsellor.kodexa.in` → same app |
| API base (for curl) | `https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com` |
| Cognito Hosted UI | `https://sc-dev-058264128057.auth.ap-south-1.amazoncognito.com` |

**Reference values** (dev stack, account `058264128057`, `ap-south-1`):
- User Pool: `ap-south-1_OQv6ssgbO` · App client: `5f22b9n70k3bolqppvvrast0en`
- Tables: `sc-dev-users`, `sc-dev-catalog`, `sc-dev-planner`, `sc-dev-mentors`, `sc-dev-bookings`, `sc-dev-notifications`

> **Tip:** open the browser DevTools **Network** tab while you test. You'll see each click fire a
> real request to the API base above and get JSON back. That's the proof it's end-to-end.

---

## Phase 0 — Foundations (you're testing this just by loading the page)

There's no button for Phase 0 — it's the plumbing (monorepo, CDK stacks, shared libs, the HTTP
API + JWT authorizer, observability). **You test it implicitly:** the moment the `/live` page
loads and any later call succeeds, the API Gateway + Lambda + DynamoDB foundation is working.

**Do:** open **https://main.dy6751tudpsop.amplifyapp.com/live**.
**Expect:** the page renders with a "Live backend" header and a **Step 1 — Log in** card. At the
top it shows `Mode <cognito>` and the `API` base URL. If you see that, Phase 0 is up. ✅

---

## Phase 1 — Auth & Identity (log in, get a real JWT, see your DB row)

This is the login loop: Cognito Hosted UI → a real JWT → the backend creates/reads your profile
row in `sc-dev-users`.

**Do:**
1. On `/live`, click **“Sign in with Cognito →”**. You're taken to the **Cognito Hosted UI**.
2. First time? Click **Sign up**, use any email + a password, submit. (Dev auto-confirms — ADR-006 —
   so you won't need an email code in dev.) Then sign in.
3. You're redirected back to `/live` with a real token.

**Expect:**
- A **“Your profile (from the database)”** card appears showing **User ID, Email, Role (`student`),
  Name, Created, Rank set? = not yet**. That data was just written to and read back from `sc-dev-users`.
- Scroll to the bottom, click **“▸ Raw token claims & /me response”** → you'll see your decoded JWT
  claims and the `GET /me` JSON straight from DynamoDB.

**Also try:**
- **Edit name (PATCH /me):** type a name, **Save** → “Name saved to DB”. Refresh the page; it persists.
- **Rank & preferences (PATCH /me/rank-prefs):** set JEE Adv rank `850`, Main rank `4200`, Category
  `Open`, Home state `Maharashtra`, branches `CSE, ECE` → **Save rank & prefs** → “Rank & prefs saved
  to DB”. The profile card's **Rank set?** now shows `Adv 850 · Open`.
- **Switch role (POST /me/role):** **Become mentor** / **Become student** flips your `custom:role`.
  Note: in Cognito mode the new role lands in your token attribute — **re-login** to see it in the
  raw claims. (You'll use this for the admin step in Phase 7.)

---

## Phase 2 — Catalog + Predictor (rank → Safe / Target / Reach)

The core hook. Your rank goes to the **public predictor** (`GET /predict`), computed by the catalog
Lambda from the real **11,261-row JoSAA 2024** dataset in DynamoDB.

**Do:** in the **“Live predictor — Phase 2”** card, click **“Predict my colleges”** (it uses the rank
inputs you set above).

**Expect:**
- A row of tags: **Safe N · Target N · Reach N** plus **`… matches · dataset vX`**.
- A list of colleges, each with a **type tag** (IIT/NIT/…), **college · branch**, a **🏠 badge** if
  it's a home-state-quota row, and a colored **bucket tag** (Safe/Target/Reach) with a **%**.
- With Adv `850` / Open you should see a healthy mix (roughly a dozen Safe, a few Target/Reach). The
  exact numbers depend on the rank — lower rank = more Reach.
- Each result has a **“＋ List”** button — that's the bridge into Phase 3.

**Curl it directly (no login needed — it's public + cacheable):**
```bash
API=https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com
curl -s "$API/predict?advRank=850&mainRank=4200&category=Open&home=Maharashtra" | head
curl -s "$API/colleges" | head            # browse the catalog
curl -s "$API/colleges/<id>"              # one college + analysis chart
```
Every prediction is an **estimate** — the UI says so, and the honest line is "verify on josaa.nic.in".

---

## Phase 3 — Planner (build a choice list, reorder, List Doctor warnings)

Your JoSAA choice list, saved per-user to the **planner** Lambda + DynamoDB with optimistic
concurrency. The **List Doctor** runs server-side.

**Do:**
1. From the **predictor results**, click **“＋ List”** on a few colleges (mix Safe + Reach on purpose).
2. Scroll to **“My choice list — Phase 3”**. Your picks appear, numbered = your **JoSAA priority order**.
3. **Reorder:** use **↑ / ↓** on a row. **Remove:** the **✕**. Each action saves to the API.
4. **Refresh** re-reads from the planner API; the order persists.

**Expect:**
- A **Safe / Target / Reach summary** for the list + total count.
- **List Doctor warnings** below the list (colored by severity). Try to trigger them:
  - Add **only Reach** colleges → a **“no safe options”** high-severity warning.
  - Add **very few** → a **“too few choices”** warning.
  - Add the **same** college twice → it won't duplicate (dedup), and reorder/remove stay consistent.
- **Export:** click **Export** → for now it flashes “PDF export is coming soon…” (the endpoint returns
  a friendly **501** — PDF render is a documented `// TODO(owner)`).

**Two-tab test (optimistic concurrency):** open `/live` in two tabs, add a college in each quickly —
one save wins, the other gets a **409** and re-syncs on refresh. No lost writes. 👍

---

## Phase 4 — Marketplace & Mentors (apply → verify → get approved → browse)

Become a mentor through the verification state machine, then (after an admin approves you) show up in
the public browse list.

**Do — become a mentor:**
1. In **“Mentors — Phase 4”**, under **Become a mentor**, fill College / Branch / Year / Price / Topics
   → **Apply as mentor**. Status shows **DRAFT**, email ✗ / ID ✗.
2. **Verify email:** enter a **`.ac.in`** address (e.g. `you@iitb.ac.in`) → **Send OTP**. In **dev the
   OTP is returned on screen** (the label shows `OTP (123456)` — real SES/SNS delivery is a
   `// TODO(owner)`). Type it → **Verify** → email ✓.
3. **Verify ID:** click **“Verify student ID (stub)”** (real S3 upload is `// TODO(owner)`) → ID ✓.
4. Status auto-advances to **PENDING_REVIEW**. You'll see “⏳ Submitted — an admin will review…”.

At this point you're waiting on an admin. That's the next section.

**Browse (public):** the **Browse mentors** list calls the public `GET /mentors`. It shows only
**APPROVED** mentors and never leaks email/OTP/verification internals.

---

## Becoming an ADMIN + approving the mentor (Phase 7 actions, done via CLI)

There's no admin UI in `/live` yet (the admin console is Phase 7). So you'll wear the admin hat from
the terminal. Two ways to approve — pick one.

**Step A — make yourself an admin** (do this on the account you want to be admin):
```bash
aws cognito-idp admin-update-user-attributes \
  --user-pool-id ap-south-1_OQv6ssgbO \
  --username <your-cognito-username-or-email> \
  --user-attributes Name=custom:role,Value=admin \
  --region ap-south-1
```
Then **log out and log back in** on `/live` so your new token carries `custom:role=admin`. (Confirm in
the raw-claims panel at the bottom.)

**Step B — approve the pending mentor** (needs an admin ID token; grab it from DevTools → Application →
Local Storage on `/live`, or from the network requests' `Authorization` header):
```bash
API=https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com
TOKEN=<your-admin-id-token>

# See the queue:
curl -s "$API/admin/mentors/pending" -H "Authorization: Bearer $TOKEN"

# Approve one (grab the mentor's userId from the queue above):
curl -s -X POST "$API/admin/mentors/<mentorUserId>/review" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"action":"approve"}'
```
(Use `{"action":"reject","reason":"..."}` to reject.)

**Back in the mentor's browser:** on their `/live`, the mentor card flips to **APPROVED** (“🎉 You're a
verified mentor”) and they now appear in **Browse mentors**. If you approve while the mentor is logged
in, **watch their 🔔 bell** (Phase 6) — a notification arrives within a few seconds. ✨

> Easiest full loop: use **two browsers/profiles** — one is the mentor, one is you-the-admin. Approve
> from the admin side, watch the mentor side light up.

---

## Phase 5 — Booking, Payments & Sessions (book → Pay → shared Meet link → Join → End → Rate)

The booking↔payment **saga** on the real backend. In dev, **“Pay (dev)”** stands in for the Razorpay
webhook (real Razorpay + real video are `// TODO(owner)`).

**Do (as a student, booking an APPROVED mentor):**
1. In **Browse mentors**, click **“Book s1”** on an approved mentor (books their slot `s1`). A session
   appears in **“My sessions — Phase 5”** with status **PENDING_PAYMENT**.
2. Click **“Pay (dev)”** → the saga completes: status → **CONFIRMED**. **The same Google Meet link**
   is minted and stored on the booking — it shows as **“🎥 Meet (placeholder)”** on **both** the student
   and the mentor side (open the mentor's `/live` → their **My sessions** shows the identical link).
3. Click **“Join”** → status **LIVE** (mints a stub video token). Click **“End”** → **ENDED**.
4. Click **“Rate ⭐5”** → **RATED**. The mentor's ⭐ rating updates.
5. Optional: on a fresh booking, click **“Cancel”** — pre-pay releases the slot; post-pay → **REFUNDED**
   (ledger records `refund.issued`).

**What you're proving:** atomic slot-hold (two students can't grab one slot → the 2nd gets a 409),
idempotency (double-tap Book with the same key = one booking), exactly-once payment capture (a replayed
webhook is a no-op — the ledger isn't doubled). The `/live` buttons drive all of it.

**Both-sides Meet check:** the point of the “placeholder” link is that student + mentor see the **same**
URL. Real Google Meet via the Calendar API is a documented `// TODO(owner)`; until then the placeholder
is a safe `/lookup/` link (a click never drops you into a random room).

---

## Phase 6 — Notifications (the 🔔 bell)

Event-driven: domain events (booking confirmed, mentor approved, session rated…) flow
**EventBridge → SQS → consumer → your in-app feed**.

**Do:** the **“🔔 Notifications — Phase 6”** card sits near the top once you're logged in. The best way
to see one **arrive**:
1. Log in as a mentor in one browser (with a pending application from Phase 4).
2. **Approve them** from the admin CLI (above).
3. Watch the mentor's bell — within ~3s an unread **“You're a verified mentor ✅”** appears (unread
   badge count goes up). Confirm a booking (Phase 5 “Pay (dev)”) to get a **booking.confirmed** notif
   with the 🎥 Meet deep-link.

**Expect:** unread items highlighted with a dot + an unread count tag; **“Mark all read”** clears them;
**Refresh** re-reads the feed. Notifications with a link show a **🎥** you can click.

**Prefs:** in-app is on by default; SES/FCM/WhatsApp channel delivery is `// TODO(owner)` behind prefs
(`GET/PUT /notifications/prefs`).

---

## Phase 7 — Admin & Ops (LIVE via CLI — the admin API is deployed & e2e-green)

The full admin API is deployed and role-gated (`custom:role=admin`). There's no `/admin` **console UI**
yet (that's frontend work), so drive it with your admin token from the step above. Every mutating action
is written to an **append-only audit trail**.

```bash
API=https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com
AH="authorization: Bearer <ADMIN_ID_TOKEN>"

# Platform stats — cheap counters (mentor status counts off the sparse GSI; no table scans):
curl -s "$API/admin/stats" -H "$AH" | jq
#   → { "mentors": { "pendingReview": N, "approved": M }, "audit": {...}, "rollups": {...} }

# Moderation — suspend an approved mentor (drops them from the public /mentors search):
curl -s -X POST "$API/admin/mentors/<MENTOR_ID>/suspend" -H "$AH" -d '{"reason":"policy"}'
#   then GET /mentors → they're gone.  Reinstate to bring them back:
curl -s -X POST "$API/admin/mentors/<MENTOR_ID>/reinstate" -H "$AH"

# Broadcast — fan a message to the notifications feed of the listed users:
curl -s -X POST "$API/admin/broadcast" -H "$AH" -d '{"title":"Round 2 open","body":"Fill choices now","userIds":["<USER_ID>"]}'
#   → { ok:true, recipients:1 }.  Log in as that user → the 🔔 bell shows it within a few seconds.

# Audit trail — everything you just did, newest first:
curl -s "$API/admin/audit" -H "$AH" | jq '.entries'
```

**Verify RBAC:** run any `/admin/*` route with a **non-admin** token → **403**. (Verified in the deployed
e2e: stats/suspend/reinstate/broadcast→notification/audit all pass, non-admin gets 403.)

---

## Phase 8 — Analytics & Reporting (LIVE — data is flowing to S3)

**Path A, cost-safe:** DynamoDB **Streams → a Lambda → S3 (NDJSON, partitioned by table/date) → Athena**
(pay-per-scan). No Firehose, no idle Glue crawler.

**See it working:** any write to the bookings or mentors table (e.g. approve a mentor, or Pay a booking)
streams to S3 within seconds:

```bash
# List what's landed (bucket is account-scoped for global-uniqueness):
aws s3 ls s3://sc-dev-analytics-058264128057/ --recursive | tail
#   → mentors/dt=YYYY-MM-DD/*.jsonl , bookings/dt=YYYY-MM-DD/*.jsonl
```

Then in the **Athena console**, paste the `CREATE EXTERNAL TABLE` DDL from **`backend/docs/analytics-athena.md`**
(it uses **partition projection** so there's no crawler cost) and run ad-hoc SQL — funnel, revenue,
reconciliation. The daily **reconciliation** Lambda folds the bookings ledger (gross / 20% fee / net) and
diffs vs. the Razorpay settlement report — that comparison is a `// TODO(owner)` until you wire the real
report, so it currently flags everything as "unreconciled" (expected).

---

## Phase 9 — Hardening & Scale (mostly invisible knobs)

Nothing to click. Phase 9 adds **API Gateway throttling / usage plans**, **WAF** (season-gated,
`cfg.enableWaf`), a stronger prod Cognito password policy, **scheduled provisioned concurrency** for
Jun–Jul, and load-test runbooks. You verify these by config + a load test, not by browser clicks. See
`docs/go-live.md` for how they get switched on for the season.

---

## Phase 10 — Go-live & Seasonal Ops (dashboards, alarms, budget, warmers)

This phase is the ops layer. Here's what to look at in the **AWS Console**:

**CloudWatch dashboard `sc-dev`:** Console → CloudWatch → Dashboards → **`sc-dev`**. You'll see:
- **Row 0** — at-a-glance tiles: API 5xx, API 4xx, Lambda errors, Lambda throttles (should be ~0).
- **API** requests & errors + latency (avg/p95).
- Per-Lambda rows: **auth, catalog (predictor), planner, marketplace, booking**, and the
  **notifications consumer** + a **DLQ-depth** widget (should stay at **0**).
- **DynamoDB** consumed capacity + request latency.
👉 While you click through the phases above, refresh the dashboard — you'll watch your own requests
show up as spikes. Fun sanity check that it's all wired.

**Alarms:** Console → CloudWatch → Alarms. You'll see `sc-dev-api-5xx`, `sc-dev-<svc>-errors` (auth,
catalog, planner, marketplace, booking), `sc-dev-notif-consumer-errors`, `sc-dev-notif-dlq`,
`sc-dev-lambda-throttle`, `sc-dev-api-latency`. They page **SNS `sc-dev-alerts` → your email**.
**⚠ One-time:** click **“Confirm subscription”** in the SNS email or alarms stay silent. Missing data =
*not breaching*, so a quiet, scaled-to-zero backend never false-alarms.

**Budget:** Console → Billing → Budgets → **`sc-dev-monthly`** ($10). Emails you at 50%/80% actual +
100% forecast. Off-season it should read ≈**$0**. How to read it: §7 of `docs/go-live.md`.

**Warmers (optional, OFF by default):** `infra/lib/warmup-stack.ts` only exists when
`cfg.enableWarmers=true` (a `sc-dev-warmup` EventBridge rule pinging hot lambdas every 5 min for the
peak weeks). It's off unless you turn it on for the season — so it costs ₹0 the rest of the year.

---

## Quick reference — one-line health checks

```bash
API=https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com

# Phase 2 — predictor is live (public):
curl -s "$API/predict/summary?advRank=850&mainRank=4200&category=Open&home=Maharashtra"

# Phase 4 — public mentor browse:
curl -s "$API/mentors"

# Phase 7 — admin gate (expect 403 without an admin token):
curl -s -o /dev/null -w "%{http_code}\n" "$API/admin/mentors/pending"
```

---

## If something doesn't match

- **Login bounces / NXDOMAIN on Cognito:** confirm the Hosted UI domain in the URL bar is
  `…auth.ap-south-1.amazoncognito.com` (not `amazonaws.com`).
- **CORS error in console:** your origin must be one of `cfg.corsOrigins` (localhost, the Amplify URL,
  the custom domain). The deployed API allows those three.
- **A 403 on an admin route:** you're not admin yet — do the `admin-update-user-attributes` step and
  **re-login**.
- **A 401 everywhere:** your token expired — log out and back in.
- **Empty mentor browse:** no one's been approved yet — run the apply → verify → approve loop first.

You just tested a full serverless product end-to-end. Nice work. 🎉 For the ops/go-live side of things,
head over to **`docs/go-live.md`**.
