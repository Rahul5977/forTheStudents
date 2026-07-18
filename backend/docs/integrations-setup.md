# Owner setup — Razorpay, SMTP / email verification, and Google sign-in

Everything below is **already wired in code**. Each integration is *off* only because it
needs a secret or a one-time console step that must be done by you (secrets never live in
the repo). Do these in the AWS account `058264128057`, region **ap-south-1**.

Reference values (the live `dev` stack = production):

| Thing | Value |
|---|---|
| API base URL | `https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com` |
| Cognito User Pool | `ap-south-1_OQv6ssgbO` |
| User Pool Client | `5f22b9n70k3bolqppvvrast0en` |
| Hosted-UI domain | `https://sc-dev-058264128057.auth.ap-south-1.amazoncognito.com` |
| Secrets SSM param | `/sc-dev/secrets` (one SecureString JSON blob) |
| Frontend build env | `student-counselor/.env.local` |
| Infra dir | `backend/infra` (`pnpm install` first) |

---

## 1. Razorpay (LIVE payments)

The booking service already implements orders, the HMAC-verified webhook, and refunds
(`services/booking/src/repo/razorpay.ts`). The booking Lambda already has `SECRETS_PARAM`
set to `/sc-dev/secrets` and IAM to read it + KMS-decrypt. The browser opens Razorpay
Checkout automatically once the keys exist — until then payments fall back to the dev path.
**You only do two things: put the keys in SSM, and point the Razorpay webhook at us.**

### 1a. Put your keys into SSM (never in git/chat)

The keys go into **one** SecureString parameter as a JSON blob. Grab your **Key ID**,
**Key Secret** (Razorpay Dashboard → Settings → API Keys), and a **Webhook Secret** (any
strong string you choose in step 1b).

```bash
aws ssm put-parameter \
  --region ap-south-1 \
  --name "/sc-dev/secrets" \
  --type SecureString \
  --value '{"RAZORPAY_KEY_ID":"rzp_live_XXXXXXXX","RAZORPAY_KEY_SECRET":"YOUR_KEY_SECRET","RAZORPAY_WEBHOOK_SECRET":"YOUR_WEBHOOK_SECRET"}' \
  --overwrite
```

> If `/sc-dev/secrets` already holds other keys, **merge** — fetch the current JSON first
> (`aws ssm get-parameter --name /sc-dev/secrets --with-decryption --region ap-south-1
> --query Parameter.Value --output text`), add the three RAZORPAY_* keys, and put the merged
> blob back. Don't blow away existing keys.

The Lambda caches secrets per **cold start**, so force a fresh one after the put:

```bash
# bump an env var to roll the function (or just wait for the next cold start)
cd backend/infra && pnpm exec cdk deploy sc-dev-svc-booking --context stage=dev --require-approval never
```

### 1b. Configure the Razorpay webhook

Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**:

- **Webhook URL:** `https://7zumjbvms0.execute-api.ap-south-1.amazonaws.com/payments/webhook`
- **Secret:** the same `RAZORPAY_WEBHOOK_SECRET` you put in SSM
- **Active events:** `payment.captured` and `payment.failed`

The webhook is what confirms a booking (`PENDING_PAYMENT → CONFIRMED`) — the browser success
callback only triggers a poll; the server-to-server webhook is authoritative and idempotent.

### 1c. Test safely first (recommended)

Use **Test-mode** keys (`rzp_test_...`) + a test webhook secret in SSM first. Book a session,
pay with a Razorpay test card, confirm the session flips to CONFIRMED and the Meet link
appears. Then swap in the **live** keys (repeat 1a with `rzp_live_...`) and redeploy the
booking Lambda. Nothing else changes.

---

## 2. SMTP / real email verification

Today (dev) a pre-sign-up Lambda **auto-confirms** every account (`cfg.autoConfirmSignups=true`)
so testers skip the emailed code. To make new users **verify their email** for real, Cognito
needs a real email sender (its default sender is rate-limited and not for production) and the
auto-confirm must be turned off. The frontend already adapts: when a sign-up comes back
`userConfirmed:false` it routes to the OTP screen.

### 2a. Verify a sender with Amazon SES (the "SMTP" service)

1. **SES → Verified identities → Create identity.** Verify either a domain
   (`kodexa.in`, recommended — add the DKIM CNAMEs at Hostinger) or a single from-address
   (e.g. `no-reply@kodexa.in`). Domain verification enables DKIM and better deliverability.
2. **Move out of the SES sandbox:** SES → *Account dashboard* → **Request production access**
   (sandbox only emails verified addresses). Do this a day ahead — approval isn't instant.
3. Keep it in **ap-south-1** so Cognito can use it in-region.

### 2b. Point Cognito at SES + enforce verification

In `backend/infra/lib/config.ts`, for the `dev` stage:

- set `autoConfirmSignups: false` (turns off the auto-confirm Lambda → real verification), and
- add the SES from-address (wire it into the pool's `email` config in `auth-stack.ts` via
  `cognito.UserPoolEmail.withSES({ fromEmail, sesRegion: 'ap-south-1' })`). There's a
  `// TODO(owner)` marker at the auto-confirm block noting exactly this.

Then redeploy the auth stack:

```bash
cd backend/infra && pnpm exec cdk deploy sc-dev-auth --context stage=dev --require-approval never
```

New sign-ups now receive a 6-digit code by email and must enter it (existing accounts are
unaffected). Password-reset emails flow through the same SES sender.

> Ping me ("wire SES into auth-stack") and I'll make the `config.ts` + `auth-stack.ts` edits
> for you — it's a ~10-line change; I left it to you only because it needs your verified
> sender address.

---

## 3. Google sign-in

The "Continue with Google" buttons and the `/auth/callback` handler are already built; the
button stays a graceful "coming soon" until the pool has a Google IdP and the frontend flag
is on.

### 3a. Create a Google OAuth client

Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID → Web app**:

- **Authorised JavaScript origins:** `https://counsellor.kodexa.in`,
  `https://main.dy6751tudpsop.amplifyapp.com`
- **Authorised redirect URI:**
  `https://sc-dev-058264128057.auth.ap-south-1.amazoncognito.com/oauth2/idpresponse`
  *(this is the Cognito Hosted-UI callback, not your site)*

Copy the **Client ID** and **Client Secret**.

### 3b. Store the creds in Secrets Manager + point the stack at them

```bash
aws secretsmanager create-secret \
  --region ap-south-1 \
  --name "sc-dev/google-oauth" \
  --secret-string '{"clientId":"XXXX.apps.googleusercontent.com","clientSecret":"YYYY"}'
```

Set `googleOAuthSecretArn` (dev stage, `config.ts`) to the ARN that command prints, then:

```bash
cd backend/infra && pnpm exec cdk deploy sc-dev-auth --context stage=dev --require-approval never
```

This adds the Google IdP to the pool and to the app client's supported providers.

### 3c. Turn the button on in the frontend

Add to `student-counselor/.env.local`:

```
NEXT_PUBLIC_GOOGLE_AUTH=on
```

Rebuild + redeploy the frontend (see `deployment` notes / `runbooks.md`). "Continue with
Google" now runs the real Hosted-UI federated flow and lands back on `/auth/callback`.

---

## Quick checklist

- [ ] Razorpay: `RAZORPAY_*` in `/sc-dev/secrets` → redeploy booking Lambda → dashboard webhook → test-mode dry run → go live
- [ ] Email verification: SES sender verified + production access → `autoConfirmSignups:false` + `UserPoolEmail.withSES` → redeploy `sc-dev-auth`
- [ ] Google: OAuth client → `sc-dev/google-oauth` secret → `googleOAuthSecretArn` → redeploy `sc-dev-auth` → `NEXT_PUBLIC_GOOGLE_AUTH=on` + rebuild frontend
