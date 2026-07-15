// Runtime environment, validated once at cold start. Import `env` anywhere.
// Fails fast with a clear message if a required var is missing in AWS.
import { z } from 'zod';

const Schema = z.object({
  STAGE: z.enum(['dev', 'staging', 'prod']).default('dev'),
  AWS_REGION: z.string().default('ap-south-1'),

  // DynamoDB
  DDB_ENDPOINT: z.string().optional(), // local dev only
  TABLE_USERS: z.string().default('sc-dev-users'),
  TABLE_CATALOG: z.string().default('sc-dev-catalog'),
  TABLE_PLANNER: z.string().default('sc-dev-planner'),

  // Cognito (populated from CDK outputs / SSM in real deploys)
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_ISSUER: z.string().optional(),

  // Eventing — default bus unless a dedicated bus is provisioned later.
  EVENT_BUS_NAME: z.string().default('default'),

  // Feature flags
  SEASON: z.enum(['on', 'off']).default('on'),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    // A bad env is a deploy/config error — fail closed and make it loud.
    // Structured line so CloudWatch Logs Insights / a metric filter can page on it
    // (metric filter pattern: { $.event = "config.invalid" }). See Phase 9 alarms.
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: 'ERROR', event: 'config.invalid', issues }));
    throw new Error(`Invalid environment:\n- ${issues.join('\n- ')}`);
  }
  cached = parsed.data;
  return cached;
}

/** True when running against DynamoDB Local (dev laptop) rather than AWS. */
export const isLocal = (): boolean => Boolean(process.env.DDB_ENDPOINT);

/** Convenience singleton (lazy). */
export const env: Env = new Proxy({} as Env, {
  get: (_t, prop: string) => getEnv()[prop as keyof Env],
});
