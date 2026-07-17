// Per-stage infrastructure config. Keep env-specific knobs here only.
import { RemovalPolicy } from 'aws-cdk-lib';

export type Stage = 'dev' | 'staging' | 'prod';

export interface StageConfig {
  stage: Stage;
  region: string;
  /** RETAIN in prod so we never lose data on stack delete. */
  removalPolicy: RemovalPolicy;
  /** Provisioned concurrency for hot Lambdas (0 = off). Scheduled for Jun–Jul in prod. */
  provisionedConcurrency: number;
  /**
   * Deploy the WAF WebACL. OFF by default — a WebACL costs ~$5–6/mo even idle, and
   * it isn't associated with the API until Phase 9 hardening. Turn on there.
   */
  enableWaf: boolean;
  /**
   * Deploy the OPTIONAL warmup stack (EventBridge rule pinging the hot Lambdas every 5
   * min to cut cold starts during the Jun–Jul peak). OFF by default — when false the
   * WarmupStack is never instantiated (bin/app.ts) AND self-guards to ZERO resources, so
   * it costs ₹0 idle. Turn ON only for the peak window (see docs/go-live.md ramp plan);
   * cost when ON is a few thousand tiny invocations/mo (cents / free-tier).
   */
  enableWarmers: boolean;
  /**
   * Deploy the CloudFront distribution that fronts the HTTP API (Track D — spike survival).
   * Unlike WAF / warmers / provisioned-concurrency (all gated OFF for their 24/7 idle COST),
   * CloudFront is pay-per-request with NO idle floor, so it is safe to leave ON year-round.
   * It is gated only because switching it on is a deliberate cutover: the distribution takes
   * ~15 min to deploy and the frontend must repoint NEXT_PUBLIC_API_URL at the edge domain
   * (see the TODO(owner) block in catalog-service-stack.ts). The direct HTTP API keeps serving
   * the whole time, so flipping this ON is additive and non-breaking. OFF by default; turn ON
   * (starting in prod, ahead of the Jun–Jul JoSAA spike) once the frontend is ready to cut over.
   */
  enableCdn: boolean;
  /**
   * API Gateway $default-stage default throttle — steady-state requests/sec. FREE and
   * always-on: the first line of defence against a flood before it reaches Lambda/DDB
   * (reach for WAF only if this can't shed it). Applied in foundation-stack.ts.
   */
  apiRateLimit: number;
  /** API Gateway $default-stage burst ceiling (max concurrent spike). FREE, always-on. */
  apiBurstLimit: number;
  /** Where AWS Budget cost alerts are emailed. */
  alertEmail: string;
  /** Monthly spend alert threshold (USD). */
  monthlyBudgetUsd: number;
  /** Allowed browser origin(s) for CORS. TODO(owner): set your real frontend URLs. */
  corsOrigins: string[];
  /**
   * ARN of the Secrets Manager secret holding Google OAuth client id/secret.
   * TODO(owner): create the secret and paste its ARN per stage.
   * Shape: { "clientId": "...", "clientSecret": "..." }
   */
  googleOAuthSecretArn?: string;
}

const BASE = {
  region: 'ap-south-1',
  // TODO(owner): change if you want alerts elsewhere.
  alertEmail: 'rahul.raj9237@gmail.com',
  monthlyBudgetUsd: 10,
  // FREE always-on API throttle. Conservative cost-safe defaults for all stages;
  // raise for the Jun–Jul season, lower off-season. (Phase 9.)
  apiRateLimit: 200,
  apiBurstLimit: 400,
  // Origins allowed for CORS + used to build Cognito callback/logout URLs.
  corsOrigins: [
    'http://localhost:3000', // local dev
    'https://main.dy6751tudpsop.amplifyapp.com', // Amplify-hosted frontend
    'https://counsellor.kodexa.in', // custom domain (once DNS is live)
  ],
};

export function getConfig(stage: string): StageConfig {
  switch (stage) {
    case 'prod':
      return {
        ...BASE,
        stage: 'prod',
        removalPolicy: RemovalPolicy.RETAIN,
        provisionedConcurrency: 20, // TODO(owner): size from real peak; schedule on/off (ADR: season flag)
        enableWaf: false, // TODO(owner): turn on in Phase 9 when it's associated + rate-limiting
        enableWarmers: false, // TODO(owner): flip ON for the Jun–Jul peak, then back OFF
        enableCdn: false, // TODO(owner): flip ON (safe year-round) once frontend repoints at the edge domain
        googleOAuthSecretArn: undefined, // TODO(owner)
      };
    case 'staging':
      return {
        ...BASE,
        stage: 'staging',
        removalPolicy: RemovalPolicy.DESTROY,
        provisionedConcurrency: 0,
        enableWaf: false,
        enableWarmers: false,
        enableCdn: false, // TODO(owner): optional in staging for a full edge-cache dress rehearsal
        googleOAuthSecretArn: undefined, // TODO(owner)
      };
    default:
      return {
        ...BASE,
        stage: 'dev',
        removalPolicy: RemovalPolicy.DESTROY,
        provisionedConcurrency: 0,
        enableWaf: false,
        enableWarmers: false,
        enableCdn: false, // dev usually hits the direct HTTP API; no need for an edge cache here
        googleOAuthSecretArn: undefined, // TODO(owner)
      };
  }
}
