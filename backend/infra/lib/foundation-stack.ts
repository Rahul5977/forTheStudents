// Phase 0: the shared HTTP entrypoint every service attaches routes to.
// - HTTP API (API Gateway v2) with CORS
// - Cognito JWT authorizer (default for authenticated routes)
// - a regional WAF WebACL with a rate-based rule (attach in Phase 9 hardening)
import { Stack, type StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type { StageConfig } from './config';

export interface FoundationStackProps extends StackProps {
  cfg: StageConfig;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
}

export class FoundationStack extends Stack {
  readonly httpApi: apigw.HttpApi;
  readonly authorizer: HttpUserPoolAuthorizer;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);
    const { cfg, userPool, userPoolClient } = props;

    this.httpApi = new apigw.HttpApi(this, 'HttpApi', {
      apiName: `sc-${cfg.stage}-api`,
      corsPreflight: {
        allowOrigins: cfg.corsOrigins,
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.PATCH, apigw.CorsHttpMethod.DELETE, apigw.CorsHttpMethod.OPTIONS],
        allowHeaders: ['authorization', 'content-type', 'x-request-id', 'idempotency-key'],
        allowCredentials: false,
      },
    });

    // Default authorizer for authenticated routes. Services opt public routes out.
    this.authorizer = new HttpUserPoolAuthorizer('CognitoAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
      identitySource: ['$request.header.Authorization'],
    });

    // WAF: rate-limit abusive IPs. OFF by default (cfg.enableWaf) — a WebACL costs
    // ~$5–6/mo even idle. Turned on + associated with the API stage in Phase 9.
    if (cfg.enableWaf) {
      new wafv2.CfnWebACL(this, 'WebAcl', {
        name: `sc-${cfg.stage}-web-acl`,
        scope: 'REGIONAL',
        defaultAction: { allow: {} },
        visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: `sc-${cfg.stage}-waf`, sampledRequestsEnabled: true },
        rules: [
          {
            name: 'rate-limit',
            priority: 1,
            action: { block: {} },
            statement: { rateBasedStatement: { limit: 2000, aggregateKeyType: 'IP' } },
            visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'rate-limit', sampledRequestsEnabled: true },
          },
        ],
      });
    }

    new CfnOutput(this, 'HttpApiUrl', { value: this.httpApi.apiEndpoint });
  }
}
