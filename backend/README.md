# Student-Counselor — Backend

Serverless backend for the JEE/JoSAA counselling platform. **Seasonal, scale-to-lakhs.**
Design lives in [`docs/architecture.md`](docs/architecture.md); live status in
[`docs/progress.md`](docs/progress.md). Visual: [`docs/architecture-diagram.html`](docs/architecture-diagram.html).

> **Docs-driven:** read `docs/architecture.md` (target) + `docs/progress.md` (status)
> before building; update `progress.md` after every change.

## Stack (approved defaults)
TypeScript · Node 20 (ARM64) · **Hono** on **AWS Lambda** · **AWS CDK** (IaC) ·
**DynamoDB** (+ Athena) · **Cognito** (Google + phone OTP) · **Razorpay** · **100ms** ·
pnpm + Turborepo monorepo.

## Layout
```
backend/
├─ docs/                  architecture.md · progress.md · architecture-diagram.html
├─ infra/                 AWS CDK app (bin/app.ts, lib/*-stack.ts)
├─ packages/
│  ├─ shared/             logger · errors · http (Hono factory) · auth · ddb · ids · types
│  └─ config/             validated env (zod)
└─ services/
   └─ auth-identity/      Phase 1 lambdalith (handlers → domain → repo)
```
Each service: `src/handlers/` (HTTP) → `src/domain/` (**your `// TODO(owner)` logic**) → `src/repo/` (data).

## Getting started
```bash
cd backend
corepack enable && corepack prepare pnpm@9.7.0 --activate
pnpm install
pnpm typecheck && pnpm test          # build + unit tests
pnpm dev:db                          # DynamoDB Local on :8000 (needs Docker)
```

## Deploy (needs AWS creds + one-time `cdk bootstrap`)
```bash
pnpm --filter @sc/infra exec cdk bootstrap        # once per account/region
pnpm diff:dev                                      # review changes
pnpm deploy:dev                                    # deploy Phase 0 + Phase 1 to dev
```
After deploy, copy the CDK outputs (`UserPoolId`, `UserPoolClientId`, `Issuer`, `HttpApiUrl`)
into your frontend/env. Fill the `// TODO(owner)` blocks (Google OAuth secret, SMS/SNS for OTP,
CORS/callback URLs) before real sign-in works.

## What's built vs. pending
See the phase tracker in [`docs/progress.md`](docs/progress.md). Currently: **Phase 0 + Phase 1
scaffolded** (boilerplate + `// TODO(owner)` markers). Business logic and Phases 2–10 are next.
