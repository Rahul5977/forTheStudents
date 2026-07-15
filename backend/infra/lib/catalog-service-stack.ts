// Phase 2: the catalog lambdalith (college data + predictor). Public routes —
// no authorizer — because predictions/analysis are shared and CDN-cacheable.
import { Stack, type StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as ddb from 'aws-cdk-lib/aws-dynamodb';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { StageConfig } from './config';

const here = dirname(fileURLToPath(import.meta.url));

export interface CatalogServiceStackProps extends StackProps {
  cfg: StageConfig;
  httpApi: apigw.HttpApi;
  catalogTable: ddb.Table;
}

export class CatalogServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: CatalogServiceStackProps) {
    super(scope, id, props);
    const { cfg, httpApi, catalogTable } = props;

    const fn = new NodejsFunction(this, 'CatalogFn', {
      functionName: `sc-${cfg.stage}-catalog`,
      entry: join(here, '../../services/catalog/src/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      bundling: { minify: true, sourceMap: true, target: 'node20' },
      environment: {
        STAGE: cfg.stage,
        TABLE_CATALOG: catalogTable.tableName,
        POWERTOOLS_SERVICE_NAME: 'catalog',
        POWERTOOLS_METRICS_NAMESPACE: 'StudentCounselor',
      },
    });

    catalogTable.grantReadData(fn); // read-only; seeding is a separate admin script

    const integration = new HttpLambdaIntegration('CatalogIntegration', fn);
    const routes: { path: string; method: apigw.HttpMethod }[] = [
      { path: '/predict', method: apigw.HttpMethod.GET },
      { path: '/predict/summary', method: apigw.HttpMethod.GET },
      { path: '/colleges', method: apigw.HttpMethod.GET },
      { path: '/colleges/{id}', method: apigw.HttpMethod.GET },
    ];
    for (const r of routes) {
      // No `authorizer` → public routes.
      httpApi.addRoutes({ path: r.path, methods: [r.method], integration });
    }
  }
}
