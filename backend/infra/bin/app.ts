// CDK app entry. Usage: `cdk deploy --all --context stage=dev`
import { App } from 'aws-cdk-lib';
import { getConfig } from '../lib/config';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { FoundationStack } from '../lib/foundation-stack';
import { AuthServiceStack } from '../lib/auth-service-stack';

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
});

app.synth();
