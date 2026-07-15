# Go-Live & Seasonal Ops — Runbook (Phase 10)

> **Purpose.** This is the operator's playbook for taking the Student-Counselor backend
> from "green in dev" to "serving lakhs during the JoSAA window" and back to "≈₹0 idle"
> afterwards. It covers the go/no-go checklist, staged rollout, seasonal ramp, on-call,
> DR/restore drill, and cost review. Read it top-to-bottom once; use it as a checklist each
> season.
>
> **Design north-star (unchanged):** cost-safe above all. Everything scales to zero. The
> only knobs that cost money — WAF, provisioned concurrency, warmers, synthetics — are
> **flag-gated OFF by default** and turned on only for the peak weeks.

---

## 0. TL;DR season switch

| When | Action | Flags |
|---|---|---|
| ~1 week before Round 1 result | Ramp UP: enable warmers + provisioned concurrency + (optional) WAF; confirm alarms; on-call rota live | `enableWarmers=true`, `provisionedConcurrency>0`, `enableWaf=true` |
| During Jun–Jul window | Watch the `sc-<stage>` dashboard around each round-result publish; canary any hot-fix | — |
| ~1 week after the last round | Ramp DOWN to idle: all season flags back to `false`/`0`; redeploy | `enableWarmers=false`, `provisionedConcurrency=0`, `enableWaf=false` |

All flags live in `infra/lib/config.ts`. Flip, then `scripts/deploy.sh <stage>` (see §2).

---

## 1. Go / No-Go checklist (run before every prod deploy)

Tick every box. If any is ❌, it's a **No-Go**.

**Correctness & tests**
- [ ] `pnpm typecheck` green across all packages.
- [ ] `pnpm test` green (all service integration suites on isolated `sc-test-*` tables).
- [ ] `pnpm --filter @sc/infra synth --context stage=prod` succeeds (all stacks synth).
- [ ] Deployed dev e2e re-run green (predictor, planner, marketplace, booking saga, notifications).

**Security & config**
- [ ] No secrets in code; every external integration is still a `// TODO(owner)` stub
      (Razorpay, Google Calendar, SES/FCM/WhatsApp, ID upload, settlement report).
- [ ] `cfg.corsOrigins` for prod lists ONLY the real prod origin(s).
- [ ] Cognito prod password policy + verification reviewed (dev conveniences are non-prod only — ADR-006).
- [ ] `enableWaf` decision made for the window (recommend ON for prod peak).

**Observability & cost**
- [ ] SNS `sc-<stage>-alerts` subscription **confirmed** (click the email link — alarms are silent until you do).
- [ ] Budget `sc-<stage>-monthly` threshold sane for the season ($10 dev; raise for prod peak — see §7).
- [ ] Dashboard `sc-<stage>` loads and shows live metrics.
- [ ] DynamoDB **PITR** confirmed ON for every table (it is, via the table construct) and a restore drill done this season (§6).

**Rollout readiness**
- [ ] Rollback path known (canary alias auto-rollback on alarm — §3).
- [ ] On-call rota + escalation filled in (§5).
- [ ] Seasonal ramp date pinned to the published JoSAA round calendar (§4).

**Go decision:** owner signs off in the changelog with date + who approved.

---

## 2. Deploying — `scripts/deploy.sh`

Use the guarded helper, never a raw `cdk deploy` for prod:

```bash
scripts/deploy.sh dev              # deploys all dev stacks, --require-approval never
scripts/deploy.sh staging          # staging
scripts/deploy.sh dev --list-only  # synth + print the stack list, no deploy
scripts/deploy.sh prod --confirm   # PROD — refuses without --confirm (a deliberate speed bump)
```

`scripts/deploy.sh prod` **without** `--confirm` exits non-zero on purpose. The script prints
the stack list first so you always see what's about to change.

---

## 3. Canary / staged rollout

**Recommendation: CodeDeploy `CodeDeployLambdaAlias` (canary) over hand-rolled weighted
aliases.** Rationale: CodeDeploy gives you *automatic rollback on a CloudWatch alarm* for
free, which is exactly the safety net we want during a spiky season — a hand-rolled weighted
alias means you're the one watching graphs and shifting weights by hand at 2am.

**Target shape (per hot service Lambda — catalog, auth, planner, booking):**
1. Publish a new **version** of the Lambda on deploy; keep a `live` **alias** in front of it.
   API Gateway integrations point at the **alias**, not `$LATEST`.
2. A CodeDeploy `LambdaDeploymentGroup` with a **Canary10Percent5Minutes** config shifts 10%
   of traffic to the new version for 5 min, then 100% if healthy.
3. **Rollback alarms** = the existing `sc-<stage>-*-errors` + `sc-<stage>-api-5xx` alarms.
   If any breaches during the canary window, CodeDeploy auto-rolls-back to the previous version.

**Full CodeDeploy wiring is `// TODO(owner)`** — it's a per-Lambda change to each service stack
(add a `lambda.Alias`, a `codedeploy.LambdaDeploymentGroup`, and repoint the HTTP integration
at the alias). Sketch to hand off:

```ts
// TODO(owner): in each hot service stack, after creating `fn`:
//   const alias = new lambda.Alias(this, 'Live', { aliasName: 'live', version: fn.currentVersion });
//   new codedeploy.LambdaDeploymentGroup(this, 'Canary', {
//     alias,
//     deploymentConfig: codedeploy.LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES,
//     alarms: [errorsAlarm, api5xxAlarm],   // auto-rollback triggers
//   });
//   // then: HttpLambdaIntegration(..., alias)  instead of (..., fn)
// Input:  a new bundle on deploy.  Output: gradual 10%→100% shift with alarm-gated rollback.
```

Until that's wired, deploys are all-at-once (`--require-approval never`) — fine for dev/staging
and acceptable for a low-blast-radius prod hot-fix, but wire the canary before the first big
season.

**Staging first.** Always deploy to `staging` and smoke-test before `prod` during the window.

---

## 4. Seasonal ramp plan (keyed to JoSAA round dates)

Real load is a series of **spikes**, each right after a round result publishes. JoSAA publishes
its schedule; we scale **ahead** of each known timestamp, not reactively.

**Inputs to pin each season (parking-lot item in progress.md):**
- The JoSAA counselling calendar → **round result publish datetimes** (usually 5–6 rounds, Jun–Jul).
- Registration/choice-filling open + close datetimes (planner + predictor load).

**Ramp timeline (per season):**

| T (relative) | Action |
|---|---|
| **Window − 7 days** | Set `enableWarmers=true`, `provisionedConcurrency=<sized>`, optionally `enableWaf=true` in `config.ts` (prod). Deploy. Confirm alarms + dashboard. On-call rota starts. |
| **Round result − 2 hours** | Sanity-check dashboard is quiet; warmers keeping hot lambdas warm; provisioned concurrency floor active. |
| **Round result publish** | Watch `sc-<stage>` live: API requests, p95 latency, Lambda throttles, DynamoDB throttles. Expect a spike; on-demand + provisioned floor should absorb it. |
| **+ few hours** | Spike decays. No action unless an alarm fired. |
| **Between rounds** | Steady low load; leave flags on for the window. |
| **Window + 7 days (after last round)** | Ramp DOWN: `enableWarmers=false`, `provisionedConcurrency=0`, `enableWaf=false`. Deploy. Back to ≈₹0 idle. |

**Automation (future, `// TODO(owner)`):** an EventBridge Scheduler pair (`ramp-up` / `ramp-down`)
off the round calendar could flip a `SEASON` parameter and trigger the redeploy — architecture §8.4.
For now the ramp is a **manual flag flip + `scripts/deploy.sh`**, which is safest while the
calendar is entered by hand.

---

## 5. On-call & escalation

**Who gets paged:** the CloudWatch alarms publish to SNS topic **`sc-<stage>-alerts`**, email-
subscribed to `cfg.alertEmail`. Confirm the subscription or nothing arrives.

**Escalation ladder:**
1. **L1 — owner (email/phone).** Ack within 15 min during the window.
2. **L2 — (fill in a second responder).** `// TODO(owner): add a second on-call contact + phone.`
3. **AWS Support** for platform-level incidents (raise to Business support for the window if budget allows; drop back after).

**Alarm → first action map:**

| Alarm | Likely cause | First move |
|---|---|---|
| `api-5xx` | a service Lambda throwing | check the per-service `*-errors` alarm + CloudWatch Logs for that fn |
| `<svc>-errors` | bug / bad input / dependency | tail `sc-<stage>-<svc>` logs; if a recent deploy, roll back (canary or redeploy previous) |
| `lambda-throttle` | concurrency ceiling hit | raise reserved/provisioned concurrency for the hot fn; check account concurrency quota |
| `api-latency` (p95 ≥ 3s) | cold starts / DDB hot partition | confirm warmers + provisioned concurrency ON; check DDB throttling |
| `notif-dlq` | an event failed 3× → DLQ | inspect the DLQ message; fix consumer; redrive |
| Budget email | spend crossed threshold | see §7 — find the line item, likely a season flag left on |

**Runbook pointers:** load-test/runbook drills are Phase 9; DLQ redrive + restore drills below.

---

## 6. DR / restore drill (PITR)

Every table is **on-demand + PITR** (point-in-time recovery, 35-day window). Do a restore drill
**once per season** so the muscle memory exists before you need it.

**Drill (do this in dev/staging, never overwrite a live table in place):**

```bash
# 1. Pick a table and a recovery point (any second within the last 35 days).
TABLE=sc-dev-bookings
RESTORED=sc-dev-bookings-restore-$(date +%Y%m%d%H%M)

# 2. Restore to a NEW table name (never restore over the live table).
aws dynamodb restore-table-to-point-in-time \
  --source-table-name "$TABLE" \
  --target-table-name "$RESTORED" \
  --use-latest-restorable-time \
  --region ap-south-1

# 3. Wait until ACTIVE, then verify item counts / spot-check a known key.
aws dynamodb describe-table --table-name "$RESTORED" --region ap-south-1 \
  --query 'Table.TableStatus'

# 4. Validate, then CLEAN UP the restore table so it doesn't cost anything.
aws dynamodb delete-table --table-name "$RESTORED" --region ap-south-1
```

**Real incident (data loss / bad write):** restore to a new table (step 2), validate, then
either repoint the service `TABLE_*` env var at the restored table and redeploy, or migrate the
good items back — decide per incident. **Never** delete the original before the restore is validated.

**Also verify:** PITR is ON (`aws dynamodb describe-continuous-backups --table-name <t>`), and that
the ledger rows in `sc-<stage>-bookings` reconcile (Phase 8 job) after any restore.

---

## 7. Cost review cadence + reading the $10 budget alarm

**The budget:** `ObservabilityStack` creates an AWS Budget **`sc-<stage>-monthly`** at
`cfg.monthlyBudgetUsd` (**$10** in dev). It emails `cfg.alertEmail` at:
- **50% ACTUAL** — early heads-up ("something is running").
- **80% ACTUAL** — investigate now.
- **100% FORECASTED** — projected to blow the cap this month.

**How to read a budget email:** it names the budget, the threshold crossed, and actual-vs-forecast.
When one arrives, open **AWS Cost Explorer → group by Service** for the month. In this stack the
usual suspects, in order:
1. **WAF WebACL** (~$5–6/mo even idle) — should be OFF (`enableWaf=false`) outside the prod window.
2. **Provisioned concurrency** left ON off-season (`provisionedConcurrency>0`) — the biggest lever.
3. **NAT/idle infra** — there should be **none** (no NAT, no Aurora, no ElastiCache). If any shows
   up, something regressed against the cost rules.
4. Everything else (Lambda, HTTP API, DynamoDB on-demand, SQS, EventBridge, Cognito Lite,
   CloudFront) is free-tier at our volume.

**Cadence:**
- **Off-season:** glance at the budget monthly; it should read ≈$0. If not, a season flag was left on.
- **During the window:** check Cost Explorer **weekly**; raise the prod budget deliberately for the
  peak (e.g. $50–100) so the alarm still means something, then drop it back after ramp-down.
- **After the season:** confirm all season flags are `false`/`0`, redeploy, verify budget returns to ≈$0.

---

## 8. Post-go-live smoke (2-minute manual check)

After any prod deploy, quickly confirm the surface is live (full user-facing walkthrough is in
`docs/ui-testing-guide.md`):

```bash
API=https://<prod-api-id>.execute-api.ap-south-1.amazonaws.com
curl -s "$API/predict/summary?advRank=850&mainRank=4200&category=Open&home=Maharashtra" | head
curl -s "$API/mentors" | head        # public browse
```

Then open the frontend, log in via Cognito Hosted UI, and run the predictor once. If the
predictor returns Safe/Target/Reach and login round-trips, the core path is up.
