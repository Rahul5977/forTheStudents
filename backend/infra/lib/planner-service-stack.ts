// Phase 3: the planner lambdalith (shortlist + ordered choice list + List Doctor).
// Per-user writes → all routes sit behind the Cognito JWT authorizer. Reads the
// Catalog table (read-only) so List Doctor can bucket choices via @sc/catalog-core.
import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import type * as ddb from 'aws-cdk-lib/aws-dynamodb';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { StageConfig } from './config';

const here = dirname(fileURLToPath(import.meta.url));

export interface PlannerServiceStackProps extends StackProps {
  cfg: StageConfig;
  httpApi: apigw.HttpApi;
  authorizer: HttpUserPoolAuthorizer;
  plannerTable: ddb.Table;
  catalogTable: ddb.Table;
}

export class PlannerServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: PlannerServiceStackProps) {
    super(scope, id, props);
    const { cfg, httpApi, authorizer, plannerTable, catalogTable } = props;

    const fn = new NodejsFunction(this, 'PlannerFn', {
      functionName: `sc-${cfg.stage}-planner`,
      entry: join(here, '../../services/planner/src/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: true, target: 'node20' },
      environment: {
        STAGE: cfg.stage,
        TABLE_PLANNER: plannerTable.tableName,
        TABLE_CATALOG: catalogTable.tableName,
        POWERTOOLS_SERVICE_NAME: 'planner',
        POWERTOOLS_METRICS_NAMESPACE: 'StudentCounselor',
      },
    });

    plannerTable.grantReadWriteData(fn); // owns the shortlist/choice-list rows
    catalogTable.grantReadData(fn); // read-only: List Doctor buckets choices

    const integration = new HttpLambdaIntegration('PlannerIntegration', fn);
    const routes: { path: string; method: apigw.HttpMethod }[] = [
      { path: '/shortlist', method: apigw.HttpMethod.GET },
      { path: '/shortlist', method: apigw.HttpMethod.PUT },
      { path: '/choice-list', method: apigw.HttpMethod.GET },
      { path: '/choice-list', method: apigw.HttpMethod.PUT },
      { path: '/choice-list/reorder', method: apigw.HttpMethod.POST },
      { path: '/choice-list/doctor', method: apigw.HttpMethod.GET },
      { path: '/choice-list/export', method: apigw.HttpMethod.POST },
    ];
    for (const r of routes) {
      httpApi.addRoutes({ path: r.path, methods: [r.method], integration, authorizer });
    }
  }
}
