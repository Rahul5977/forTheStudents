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
        googleOAuthSecretArn: undefined, // TODO(owner)
      };
    case 'staging':
      return {
        ...BASE,
        stage: 'staging',
        removalPolicy: RemovalPolicy.DESTROY,
        provisionedConcurrency: 0,
        enableWaf: false,
        googleOAuthSecretArn: undefined, // TODO(owner)
      };
    default:
      return {
        ...BASE,
        stage: 'dev',
        removalPolicy: RemovalPolicy.DESTROY,
        provisionedConcurrency: 0,
        enableWaf: false,
        googleOAuthSecretArn: undefined, // TODO(owner)
      };
  }
}
