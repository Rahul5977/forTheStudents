// CDK app entry. Usage: `cdk deploy --all --context stage=dev`
import { App } from 'aws-cdk-lib';
import { getConfig } from '../lib/config';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { FoundationStack } from '../lib/foundation-stack';
import { AuthServiceStack } from '../lib/auth-service-stack';
import { CatalogServiceStack } from '../lib/catalog-service-stack';
import { PlannerServiceStack } from '../lib/planner-service-stack';
import { MarketplaceServiceStack } from '../lib/marketplace-service-stack';
import { BookingServiceStack } from '../lib/booking-service-stack';
import { NotificationsServiceStack } from '../lib/notifications-service-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new App();
const stage = (app.node.tryGetContext('stage') as string) ?? 'dev';
const cfg = getConfig(stage);

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: cfg.region };

// Phase 0 foundations + Phase 1 identity.
const data = new DataStack(app, `sc-${stage}-data`, { env, cfg });
const auth = new AuthStack(app, `sc-${stage}-auth`, { env, cfg });
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
});

// Phase 5 — booking, payments & sessions (saga; reads mentors, owns bookings).
new BookingServiceStack(app, `sc-${stage}-svc-booking`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  authorizer: foundation.authorizer,
  bookingsTable: data.bookingsTable,
  mentorsTable: data.mentorsTable,
});

// Phase 6 — notifications (feed API + EventBridge→SQS→consumer, event-driven).
new NotificationsServiceStack(app, `sc-${stage}-svc-notifications`, {
  env,
  cfg,
  httpApi: foundation.httpApi,
  authorizer: foundation.authorizer,
  notificationsTable: data.notificationsTable,
});

// Ops dashboard + spend guardrail.
new ObservabilityStack(app, `sc-${stage}-observability`, { env, cfg, httpApi: foundation.httpApi });

app.synth();
