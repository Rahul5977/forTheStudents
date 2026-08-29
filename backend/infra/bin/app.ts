// CDK app entry. Usage: `cdk deploy --all --context stage=dev`
import { App } from 'aws-cdk-lib';
import { getConfig } from '../lib/config';
import { loadGoogleCreds } from '../lib/google-creds';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { FoundationStack } from '../lib/foundation-stack';
import { AuthServiceStack } from '../lib/auth-service-stack';
import { CatalogServiceStack } from '../lib/catalog-service-stack';
import { PlannerServiceStack } from '../lib/planner-service-stack';
import { MarketplaceServiceStack } from '../lib/marketplace-service-stack';
import { BookingServiceStack } from '../lib/booking-service-stack';
import { NotificationsServiceStack } from '../lib/notifications-service-stack';
import { AdminServiceStack } from '../lib/admin-service-stack';
import { AnalyticsServiceStack } from '../lib/analytics-service-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { ScalingStack } from '../lib/scaling-stack';
import { WarmupStack } from '../lib/warmup-stack';

const app = new App();
const stage = (app.node.tryGetContext('stage') as string) ?? 'dev';
const cfg = getConfig(stage);

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: cfg.region };

// Google OAuth creds, read from SSM at synth when cfg.googleOAuthParam is set (undefined
// → Google sign-in stays OFF, and a read failure degrades gracefully — see google-creds.ts).
const google = cfg.googleOAuthParam ? loadGoogleCreds(cfg.googleOAuthParam, cfg.region) : undefined;

// Phase 0 foundations + Phase 1 identity.
const data = new DataStack(app, `sc-${stage}-data`, { env, cfg });
const auth = new AuthStack(app, `sc-${stage}-auth`, { env, cfg, google });
const foundation = new FoundationStack(app, `sc-${stage}-foundation`, {
  env,
  cfg,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
});
new AuthServiceStack(app, `sc-${stage}-svc-auth`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  authorizer: foundation.authorizer,
  usersTable: data.usersTable,
  auditTable: data.auditTable,
  userPool: auth.userPool,
});

// Phase 2 — catalog + predictor (public, reads the Catalog table).
new CatalogServiceStack(app, `sc-${stage}-svc-catalog`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  catalogTable: data.catalogTable,
});

// Phase 3 — planner (per-user, behind the authorizer; reads Catalog for List Doctor).
new PlannerServiceStack(app, `sc-${stage}-svc-planner`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  authorizer: foundation.authorizer,
  plannerTable: data.plannerTable,
  catalogTable: data.catalogTable,
});

// Phase 4 — marketplace & mentors (mentor/admin authed + public GET /mentors).
new MarketplaceServiceStack(app, `sc-${stage}-svc-marketplace`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  authorizer: foundation.authorizer,
  mentorsTable: data.mentorsTable,
  auditTable: data.auditTable,
  mentorDocsBucket: data.mentorDocsBucket,
});

// Phase 5 — booking, payments & sessions (saga; reads mentors, owns bookings).
new BookingServiceStack(app, `sc-${stage}-svc-booking`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  authorizer: foundation.authorizer,
  bookingsTable: data.bookingsTable,
  mentorsTable: data.mentorsTable,
  usersTable: data.usersTable,
});

// Phase 6 — notifications (feed API + EventBridge→SQS→consumer, event-driven).
new NotificationsServiceStack(app, `sc-${stage}-svc-notifications`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  authorizer: foundation.authorizer,
  notificationsTable: data.notificationsTable,
});

// Phase 7 — admin & ops (role=admin; cheap metrics off the mentors GSI, append-only
// audit trail, guarded moderation, and admin.broadcast events → notifications fanout).
new AdminServiceStack(app, `sc-${stage}-svc-admin`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  authorizer: foundation.authorizer,
  auditTable: data.auditTable,
  mentorsTable: data.mentorsTable,
});

// Phase 8 — analytics & reporting (Streams→S3→Athena + daily ledger reconciliation).
new AnalyticsServiceStack(app, `sc-${stage}-svc-analytics`, {
  env,
  cfg,
  bookingsTable: data.bookingsTable,
  mentorsTable: data.mentorsTable,
});

// Ops dashboard + spend guardrail.
new ObservabilityStack(app, `sc-${stage}-observability`, { env, cfg, httpApi: foundation.httpApi });

// Phase 9 — seasonal provisioned-concurrency scaling on the hot Lambdas. Only
// instantiated when cfg.provisionedConcurrency > 0 (default 0 in every stage → the
// stack is never created → ZERO idle cost). The stack body also self-guards.
if (cfg.provisionedConcurrency > 0) {
  new ScalingStack(app, `sc-${stage}-scaling`, { env, cfg });
}

// Phase 10 — OPTIONAL cold-start warmers for the hot Lambdas (season-gated, default OFF).
// OFF by default → the stack is not even created → ZERO cost. The stack also self-guards.
if (cfg.enableWarmers) {
  new WarmupStack(app, `sc-${stage}-warmup`, { env, cfg });
}

app.synth();
