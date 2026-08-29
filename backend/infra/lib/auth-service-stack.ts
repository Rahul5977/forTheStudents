// Phase 1: deploy the auth-identity lambdalith and wire its routes to the shared
// HTTP API behind the Cognito authorizer.
import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import type * as ddb from 'aws-cdk-lib/aws-dynamodb';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { StageConfig } from './config';

const here = dirname(fileURLToPath(import.meta.url));

export interface AuthServiceStackProps extends StackProps {
  cfg: StageConfig;
  httpApi: apigw.HttpApi;
  authorizer: HttpUserPoolAuthorizer;
  usersTable: ddb.Table;
  /** Phase 11: superadmin bootstrap + admin promotions are written to the audit trail. */
  auditTable: ddb.Table;
  userPool: cognito.UserPool;
}

export class AuthServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthServiceStackProps) {
    super(scope, id, props);
    const { cfg, httpApi, authorizer, usersTable, auditTable, userPool } = props;

    const fn = new NodejsFunction(this, 'AuthIdentityFn', {
      functionName: `sc-${cfg.stage}-auth-identity`,
      entry: join(here, '../../services/auth-identity/src/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64, // Graviton — cheaper, faster cold start
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: true, target: 'node20' }, // default format = CJS
      environment: {
        STAGE: cfg.stage,
        TABLE_USERS: usersTable.tableName,
        TABLE_AUDIT: auditTable.tableName,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        // Phase 11: the ONE account auto-promoted to superadmin on a verified-email match.
        SUPERADMIN_EMAIL: cfg.superadminEmail,
        EVENT_BUS_NAME: 'default',
        POWERTOOLS_SERVICE_NAME: 'auth-identity',
        POWERTOOLS_METRICS_NAMESPACE: 'StudentCounselor',
      },
    });

    usersTable.grantReadWriteData(fn);
    auditTable.grantWriteData(fn); // append-only: superadmin.bootstrap / admin.promote / admin.demote

    // switchRole writes `custom:role` back onto the Cognito user.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminUpdateUserAttributes'],
        resources: [userPool.userPoolArn],
      }),
    );

    // Emit domain events (user.bootstrapped / user.role_changed) to the default bus.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/default`],
      }),
    );

    const integration = new HttpLambdaIntegration('AuthIntegration', fn);

    // All auth-identity routes require a valid Cognito JWT.
    const routes: { path: string; method: apigw.HttpMethod }[] = [
      { path: '/auth/bootstrap', method: apigw.HttpMethod.POST },
      { path: '/me', method: apigw.HttpMethod.GET },
      { path: '/me', method: apigw.HttpMethod.PATCH },
      { path: '/me/rank-prefs', method: apigw.HttpMethod.PATCH },
      { path: '/me/role', method: apigw.HttpMethod.POST },
      { path: '/admin/users', method: apigw.HttpMethod.GET }, // admin directory (role-gated in domain)
      { path: '/admin/admins', method: apigw.HttpMethod.GET }, // superadmin: admin team (role-gated in domain)
      { path: '/admin/admins', method: apigw.HttpMethod.POST },
      { path: '/admin/admins/{id}', method: apigw.HttpMethod.PATCH },
      { path: '/admin/admins/{id}/demote', method: apigw.HttpMethod.POST },
    ];
    for (const r of routes) {
      httpApi.addRoutes({ path: r.path, methods: [r.method], integration, authorizer });
    }

    // TODO(owner): provisioned concurrency for cold-start-sensitive prod season.
    //   if (cfg.provisionedConcurrency > 0) { const v = fn.currentVersion; new lambda.Alias(...); alias with provisionedConcurrentExecutions; Application Auto Scaling schedule for Jun–Jul. }
  }
}
