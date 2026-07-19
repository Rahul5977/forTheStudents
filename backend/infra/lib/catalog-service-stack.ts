// Phase 2: the catalog lambdalith (college data + predictor). Public routes —
// no authorizer — because predictions/analysis are shared and CDN-cacheable.
import { Stack, type StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Architecture, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
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
      // The whole cutoff snapshot (11k+ rows, each with a 2026 forecast band + history) is
      // loaded into memory once per cold start. More memory = proportionally more CPU/network,
      // which keeps that one-time load well under the timeout. Warm requests are ~30ms, so the
      // memory bump costs a negligible amount of billed-ms at steady state.
      // 1 GB (was 512) → ~2× CPU so the one-time cold-start snapshot load (~9.6k cutoffs) is
      // ~1 s instead of ~2–3 s, making the FIRST predict noticeably snappier. Warm calls (in-
      // memory snapshot + CloudFront + client-side memo) stay ~30 ms.
      memorySize: 1024,
      timeout: Duration.seconds(20),
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
      { path: '/colleges/{id}/profile', method: apigw.HttpMethod.GET }, // deep college page
    ];
    for (const r of routes) {
      // No `authorizer` → public routes.
      httpApi.addRoutes({ path: r.path, methods: [r.method], integration });
    }

    // ------------------------------------------------------------------------
    // Track D — CloudFront edge cache in front of the predictor/catalog API.
    //
    // WHY: when a JoSAA round result drops, lakhs of students hit /predict within
    // minutes with a SMALL set of identical query permutations (rank × category ×
    // home-state × ...). The handlers already emit
    //   cache-control: public, s-maxage=300, stale-while-revalidate=600
    // but nothing honors it — every request lands on Lambda. A shared edge cache is
    // THE spike lever: near-identical requests collapse onto one cached object served
    // from a CloudFront POP, not a cold Lambda + DynamoDB read.
    //
    // COST: CloudFront is pay-per-request with NO idle floor (unlike WAF / warmers /
    // provisioned-concurrency, which bill 24/7 and are therefore season-gated). It is
    // safe to leave ON year-round. We still gate it behind `cfg.enableCdn` because
    // turning it on is a deliberate cutover (see the TODO(owner) below) and to keep the
    // dev/staging synth free of a ~15-min distribution deploy. OFF → nothing is created.
    if (cfg.enableCdn) {
      // The $default stage of an HTTP API is reachable at
      //   https://<apiId>.execute-api.<region>.amazonaws.com/
      // (no stage path). CloudFront needs the bare origin host, so rebuild it from the
      // apiId token rather than parsing `apiEndpoint` — no CFN string surgery needed.
      const originDomain = `${httpApi.apiId}.execute-api.${cfg.region}.amazonaws.com`;

      // Cache policy: honor the origin's cache-control and key ONLY on the params the
      // predictor/catalog actually vary on.
      const cachePolicy = new cloudfront.CachePolicy(this, 'CatalogCachePolicy', {
        cachePolicyName: `sc-${cfg.stage}-catalog-cdn`,
        comment: 'Honor origin s-maxage=300 / SWR=600; key on predictor query params, no cookies',
        // Origin sends `s-maxage=300, stale-while-revalidate=600`. minTtl=0 lets the origin
        // fully dictate freshness (incl. short/no-store responses); defaultTtl=300 mirrors
        // s-maxage for any response that arrives without cache headers; maxTtl caps runaway.
        // CloudFront honors the `stale-while-revalidate` directive natively — during the
        // 600s SWR window it serves the stale object instantly and revalidates in the
        // background, which is exactly what smooths the post-result thundering herd.
        minTtl: Duration.seconds(0),
        defaultTtl: Duration.seconds(300),
        maxTtl: Duration.days(1),
        // Cache-key members are ALSO the only query strings forwarded to the origin, so
        // identical permutations collapse onto one object and junk params can't fragment
        // the cache. Keep this list in sync with the params the handlers read.
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(
          'advRank', 'mainRank', 'category', 'home', 'gender', 'types', 'q', 'sort', 'limit', 'ids',
        ),
        // No cookies / no headers in the key. With no origin-request-policy attached (below),
        // "none" here also means cookies are STRIPPED at the edge and never reach Lambda —
        // these are public, anonymous reads, so a stray session cookie must not shard the cache.
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        // Normalize Accept-Encoding so one cached object serves gzip and brotli clients.
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      });

      const distribution = new cloudfront.Distribution(this, 'CatalogCdn', {
        comment: `sc-${cfg.stage} predictor/catalog edge cache`,
        // India + SE-Asia edges (Mumbai/Chennai/etc.) without paying for the priciest
        // regions we have no audience in. PRICE_CLASS_100 would exclude India — don't use it.
        priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        defaultBehavior: {
          origin: new HttpOrigin(originDomain, {
            // execute-api is TLS-only; talk to it over HTTPS end to end.
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          // Read-only API — GET/HEAD only. No mutating methods to forward.
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy,
          compress: true,
          // Intentionally NO originRequestPolicy: only the cache-key params are forwarded,
          // so cookies/extra headers are dropped at the edge — satisfies "forward the
          // predictor query keys and NOT cookies" with zero extra config.
        },
      });

      // TODO(owner): CUT OVER THE FRONTEND. After `cdk deploy` with cfg.enableCdn=true,
      // point the web app's NEXT_PUBLIC_API_URL at `https://<CatalogCdnDomain>` (the output
      // below) so traffic flows viewer → CloudFront → HTTP API. The direct HTTP API URL keeps
      // working the whole time, so this is additive and non-breaking — flip the env var when
      // ready, no code change here. OPTIONAL hardening: attach a custom domain
      // (e.g. api.counsellor.kodexa.in) via `domainNames` + an ACM cert in us-east-1, and
      // once the front door is live repoint the WAF WebACLAssociation (foundation-stack.ts)
      // at this distribution's ARN — WAFv2 attaches to CloudFront but not to HTTP APIs.
      new CfnOutput(this, 'CatalogCdnDomain', {
        value: distribution.distributionDomainName,
        description: 'CloudFront domain fronting the predictor/catalog API — set as NEXT_PUBLIC_API_URL',
      });
    }
  }
}
