# Operations Runbooks — Student-Counselor Backend

> **Phase 9 (Hardening & Scale).** Concrete, numbered response procedures for the
> alarms and failure modes that can actually page us. Every alarm below fires to the
> SNS topic **`sc-<stage>-alerts`** (email — the owner must have clicked *Confirm
> subscription*). The at-a-glance view is the CloudWatch dashboard **`sc-<stage>`**.
>
> Region **ap-south-1**, account **058264128057**. Substitute the real `<stage>`
> (`dev` today; `staging`/`prod` later). Names below are exactly what CDK deploys —
> alarms come from `infra/lib/observability-stack.ts`, queues/DLQ from
> `infra/lib/notifications-service-stack.ts`, tables from `infra/lib/data-stack.ts`.
>
> **Cost reminder:** the platform is scale-to-zero (Lambda + on-demand DynamoDB + SQS
> + EventBridge = ~$0 idle). The only knobs that cost real money are documented as
> OFF-by-default and season-gated: **WAF ~$6/mo per WebACL** (`cfg.enableWaf`) and
> **provisioned concurrency ~$15/mo per hot fn at PC=20** (`cfg.provisionedConcurrency`,
> ramped by `infra/lib/scaling-stack.ts`). Never leave either on off-season.

---

## 0. First response (any page)

1. Open the dashboard: CloudWatch → Dashboards → **`sc-<stage>`**. Row 0 is the
   at-a-glance error tiles (API 5xx/4xx, Lambda errors/throttles).
2. Identify which alarm fired (the SNS email subject is `sc-<stage>-<id>`, e.g.
   `sc-<stage>-api-5xx`). Jump to the matching section below.
3. Check **Health Dashboard** (AWS Personal Health Dashboard) for an ap-south-1
   service event before assuming it's us.
4. Note the start time — alarms use 5-minute periods; correlate with the last deploy
   (`git log` / CloudFormation stack *Events*).

---

## 1. API 5xx spike  — alarm `sc-<stage>-api-5xx`

Fires when API Gateway returns **≥5 server errors in 5 min**. Also watch
`sc-<stage>-api-latency` (p95 ≥3s for 10 min).

1. Dashboard row **API — requests & errors**: confirm 5xx is real and not a single blip.
2. Dashboard rows per Lambda (auth/catalog/planner/marketplace/booking): find WHICH
   function's `Errors` line moved at the same time — that's the culprit service.
3. Tail that function's logs:
   `aws logs tail /aws/lambda/sc-<stage>-<service> --since 15m --follow --region ap-south-1`
   (service ∈ auth-identity, catalog, planner, marketplace, booking, notifications).
4. Common causes & fixes:
   - **Bad deploy** → roll back: redeploy the previous good revision
     (`git checkout <prev> && pnpm --filter @sc/infra run deploy:<stage> -- --context stage=<stage>`)
     or in CloudFormation console *Stack actions → Roll back*.
   - **Downstream throttle** (DynamoDB) → see §4.
   - **Unhandled exception** → the Hono handlers map known errors to 4xx via AppError;
     a 5xx means an unexpected throw. Fix forward, add the missing zod guard / try-catch.
5. If it's an abuse/traffic flood (not a bug): consider turning on API throttling
   headroom (see §8) and, only if sustained, WAF (§8 — ~$6/mo, season-gated).
6. Verify recovery on the dashboard; the alarm auto-sends an OK to `sc-<stage>-alerts`.

---

## 2. Lambda throttling  — alarm `sc-<stage>-lambda-throttle`

Fires when a hot Lambda is **throttled ≥1 time in 5 min** (hit a concurrency ceiling).

1. Dashboard row **Lambda — invocations / errors / throttles**: confirm `Throttles > 0`.
2. Check the account concurrency headroom:
   `aws lambda get-account-settings --region ap-south-1`
   (look at `AccountLimit.ConcurrentExecutions` vs current usage).
3. If a single function is starving others, set a **reserved concurrency** floor on the
   hot ones (catalog, auth-identity) so a spike elsewhere can't crowd them out
   (`fn.reservedConcurrentExecutions` in the service stack).
4. If the whole account is near the 1,000 default ceiling during the season, request a
   **Service Quotas** increase for *Concurrent executions* (do this BEFORE the season,
   lead time can be days).
5. Sustained seasonal throttling on cold starts → this is exactly what
   `cfg.provisionedConcurrency` + `infra/lib/scaling-stack.ts` are for. Turn PC on for
   Jun–Jul only (see §8) and confirm the scaling stack is instantiated in `bin/app.ts`.

---

## 3. Notifications DLQ backlog  — alarm `sc-<stage>-notif-dlq`

Fires when **≥1 message lands in the DLQ** `sc-<stage>-notifications-dlq` (a domain
event failed its 3 receive attempts). Also watch `sc-<stage>-notif-consumer-errors`.
Dashboard: **Notifications DLQ depth (should be 0)**.

1. Inspect the poison messages (peek, don't delete):
   `aws sqs receive-message --queue-url <DLQ_URL> --max-number-of-messages 10 --visibility-timeout 0 --region ap-south-1`
   (get `<DLQ_URL>` via `aws sqs get-queue-url --queue-name sc-<stage>-notifications-dlq`).
2. Tail the consumer to find the failure:
   `aws logs tail /aws/lambda/sc-<stage>-notifications-consumer --since 30m --region ap-south-1`
   Typical cause: a new/malformed event shape the fanout mapper
   (`services/notifications/src/domain/notifications.ts`) doesn't handle.
3. **Fix the consumer** (add/adjust the mapping), deploy, and confirm the error stops.
4. **Redrive** the DLQ back onto the main queue `sc-<stage>-notifications` (SQS console
   → `sc-<stage>-notifications-dlq` → **Start DLQ redrive** → *Redrive to source queue*),
   or via CLI:
   `aws sqs start-message-move-task --source-arn <DLQ_ARN> --region ap-south-1`
   The consumer re-processes them; the feed is idempotent per `NOTIF#<ulid>` so a
   double-delivery is safe.
5. If the messages are genuinely un-processable (bad legacy event, already handled),
   purge them: SQS console → DLQ → **Purge** (irreversible — confirm they're junk first).
6. Confirm DLQ depth returns to 0 on the dashboard.

---

## 4. DynamoDB throttling  — (watch dashboard; add alarm if seasonal)

Tables are **on-demand** (`data-stack.ts`), so throttling is rare, but a sudden 10x
burst above the table's adapted peak can still throttle briefly.

1. Dashboard row **DynamoDB — consumed capacity**. In CloudWatch metrics, add/check
   `ReadThrottleEvents` / `WriteThrottleEvents` for the affected table (`sc-<stage>-users`,
   `-catalog`, `-planner`, `-mentors`, `-bookings`, `-notifications`).
2. On-demand auto-adapts but caps at ~2x the previous peak instantly. For a KNOWN spike
   (round-result day), pre-warm by temporarily setting **provisioned capacity with
   auto-scaling** OR issue a controlled ramp beforehand so on-demand raises the ceiling.
3. Hot-partition throttle (one PK hammered): confirm access is spread across partition
   keys. The predictor path does NOT read DynamoDB per request (in-memory snapshot,
   ADR-008), so `/predict` load should never throttle a table — if it does, the cache
   isn't warming; check the catalog Lambda cold-start logs.
4. Retries: the AWS SDK retries throttles with backoff automatically; brief throttling
   is usually invisible to users. Escalate only if `4xx`/`5xx` at the API rises with it.

---

## 5. Cost spike  — AWS Budget `sc-<stage>-monthly`

You get emailed at **50% / 80% actual** and **100% forecast** of the monthly budget
(`cfg.monthlyBudgetUsd`, default $10).

1. Open **Cost Explorer** → group by **Service**, last 7 days, daily granularity. Find
   the service that jumped.
2. Cross-check the usual suspects (the only non-zero-idle costs):
   - **WAF** (~$6/mo per WebACL) — should be OFF (`cfg.enableWaf=false`). If a WebACL
     exists and isn't needed, tear it down (see §8).
   - **Provisioned concurrency** (~$15/mo per hot fn at PC=20) — should be 0 off-season.
     Check `cfg.provisionedConcurrency` and that `scaling-stack.ts` ramped DOWN on Aug 1.
     `aws lambda get-provisioned-concurrency-config --function-name sc-<stage>-catalog:live`
   - **Data transfer / NAT** — there should be **no NAT gateway**; if one appears, a
     Lambda was put in a VPC by mistake. Remove the VPC config.
   - **DynamoDB** — a runaway scan or a hot write loop. Check consumed capacity on the
     dashboard and recent deploys.
3. Confirm the dashboard `sc-<stage>` and Cost Explorer agree on the timeline; correlate
   with the last deploy or a traffic event.
4. Kill the cost: turn the offending flag off (WAF/PC), redeploy, verify spend flattens.
5. If it's legitimate seasonal load, raise `cfg.monthlyBudgetUsd` for the season so the
   budget stays a useful signal rather than crying wolf.

---

## 6. Rotate a leaked AWS access key

Assume any key pasted in chat / committed / logged is compromised — rotate immediately.

1. **Disable** the key first (fast, reversible): IAM console → Users → *user* → *Security
   credentials* → set the key **Inactive**, or
   `aws iam update-access-key --access-key-id <AKIA...> --status Inactive --user-name <user>`.
2. **Create a replacement**: `aws iam create-access-key --user-name <user>` → update your
   local `~/.aws/credentials` / CI secrets / `.env` (never commit it).
3. Verify the new key works: `aws sts get-caller-identity`.
4. **Delete** the old key: `aws iam delete-access-key --access-key-id <AKIA...> --user-name <user>`.
5. **Assess blast radius**: CloudTrail → *Event history*, filter by the old access key id,
   review actions in the exposure window. Look for unexpected `RunInstances`,
   `CreateUser`, `PutBucketPolicy`, IAM changes.
6. Purge the secret from history if committed (git filter-repo / BFG) and force-push;
   rotate anything else that key could read (Secrets Manager entries it touched).
7. Prevent recurrence: prefer short-lived creds (SSO / `aws sso login`) and IAM roles
   over long-lived keys; enable an IAM key-age policy.

---

## 7. Restore a DynamoDB table from PITR

All tables have **Point-In-Time Recovery** on (`data-stack.ts`). PITR restores to a NEW
table (it never overwrites in place) — you then cut over.

1. Confirm the earliest restorable time:
   `aws dynamodb describe-continuous-backups --table-name sc-<stage>-<table> --region ap-south-1`
2. Restore to a new table at the chosen timestamp (just BEFORE the bad event):
   ```
   aws dynamodb restore-table-to-point-in-time \
     --source-table-name sc-<stage>-<table> \
     --target-table-name sc-<stage>-<table>-restore \
     --restore-date-time <ISO8601> \
     --region ap-south-1
   ```
   (Or DynamoDB console → table → *Backups* → *Restore to point in time*.)
3. Wait until the restored table is `ACTIVE`
   (`aws dynamodb describe-table --table-name sc-<stage>-<table>-restore`). Re-create any
   **GSIs** the app needs if they weren't carried over, and re-enable **PITR** on the
   restore.
4. **Validate** the restored data (spot-check known items) before cutting over.
5. Cut over. Prefer app-level: point the service's `TABLE_*` env var at the `-restore`
   table and redeploy, verify, then later rename/retire the old one. (You cannot rename a
   DynamoDB table in place; the env-var swap is the clean, reversible cut-over.)
6. Post-incident: keep the corrupt original around until the restore is confirmed good,
   then delete it. Record the RCA in `docs/progress.md`.

---

## 8. Turning the cost knobs on/off (season gates)

**API Gateway throttling** — FREE, always on. `$default` stage default throttle is set
from `cfg.apiRateLimit` / `cfg.apiBurstLimit` (`foundation-stack.ts`). Raise these for
the season, lower them off-season. This is the first, free line of defence against a
flood — reach for WAF only if throttling alone can't shed the abuse.

**WAF** — ~**$6/mo per WebACL** (fixed) + $1/rule + $0.60 per million requests. **OFF by
default** (`cfg.enableWaf=false`). To enable for the season: set `cfg.enableWaf=true`,
redeploy `sc-<stage>-foundation` (the WebACL is created AND associated with the API stage
there), and **turn it back off after the season** to stop the ~$6/mo. Note: WAFv2 direct
association is only supported on REST-API stages / CloudFront — see the caveat in
`foundation-stack.ts`; the long-term plan fronts the HTTP API with CloudFront and attaches
WAF there.

**Provisioned concurrency** — ~**$15/mo per hot fn at PC=20** (256 MB), billed 24/7 while
provisioned. **OFF by default** (`cfg.provisionedConcurrency=0`). To enable: set it >0 in
the prod config, publish a `live` alias on the hot functions, ensure `bin/app.ts`
instantiates `ScalingStack` (it only does when PC>0), and confirm the scheduled actions:
scale **UP ~Jun 1**, **DOWN to 0 ~Aug 1** (`scaling-stack.ts`). Verify the Aug 1 ramp-down
actually fired (§5 cost check) — a stuck-on fleet is the most expensive mistake here.
