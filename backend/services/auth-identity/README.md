# auth-identity

Phase 1 service. Federated sign-in (Cognito: Google + phone OTP) issues the JWT;
this lambdalith manages the **user profile** and the **rank/preferences** that power
the predictor. One Lambda, Hono router, `handlers → domain → repo`.

## Endpoints (all require a valid Cognito JWT)

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/auth/bootstrap` | — | `UserProfile` | Idempotent; creates the row on first login |
| GET | `/me` | — | `UserProfile` | Caller's own profile |
| PATCH | `/me` | `{ name? }` | `UserProfile` | Self-editable fields |
| PATCH | `/me/rank-prefs` | `RankPrefs` | `UserProfile` | The predictor inputs |
| POST | `/me/role` | `{ role: 'student' \| 'mentor' }` | `UserProfile` | Admin is never self-assigned |

`UserProfile` / `RankPrefs` shapes: `packages/shared/src/types.ts`.

## Data access (DynamoDB `Users` table)

| Operation | Key | Command |
|---|---|---|
| get profile | `PK=USER#<id>`, `SK=PROFILE` | GetItem |
| create-if-absent | same | PutItem + `attribute_not_exists(PK)` |
| update profile / rankPrefs / role | same | UpdateItem + `attribute_exists(PK)` |
| lookup by email / phone | GSI `gsi1-email` / `gsi2-phone` | Query (added when needed) |

## Env
`STAGE`, `AWS_REGION`, `TABLE_USERS`, `DDB_ENDPOINT` (local only). See `.env.example`.

## What YOU (owner) still write — search `// TODO(owner)`
- `domain/profile.ts` — display-name sourcing, field-edit rules, cross-field validation,
  making a role change effective in Cognito (`custom:role`), gating mentor role on verification,
  and emitting `user.bootstrapped`.
- `repo/users.repo.ts` — generic UpdateExpression builder if you want more editable fields.
- `shared/src/auth.ts` — confirm the role claim (`custom:role` vs `cognito:groups`).

## Local
```bash
pnpm dev:db                 # DynamoDB Local on :8000
# create the table locally (TODO(owner): add a scripts/create-local-tables.ts)
pnpm --filter @sc/auth-identity test
```
