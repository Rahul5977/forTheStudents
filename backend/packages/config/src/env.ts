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
  TABLE_MENTORS: z.string().default('sc-dev-mentors'),
  TABLE_BOOKINGS: z.string().default('sc-dev-bookings'),
  TABLE_NOTIFICATIONS: z.string().default('sc-dev-notifications'),
  // Admin audit trail (Phase 7): append-only PK=ADMIN#<id> SK=ACT#<ts>.
  TABLE_AUDIT: z.string().default('sc-dev-audit'),

  // S3 (Phase 8 analytics lake)
  BUCKET_ANALYTICS: z.string().default('sc-dev-analytics'),

  // Cognito (populated from CDK outputs / SSM in real deploys)
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_ISSUER: z.string().optional(),

  // Eventing — default bus unless a dedicated bus is provisioned later.
  EVENT_BUS_NAME: z.string().default('default'),

  // SSM Parameter Store name holding the app-secrets JSON blob (Razorpay, etc.).
  // Only the NAME lives here; values are fetched + decrypted at runtime.
  SECRETS_PARAM: z.string().optional(),

  // Phase 11: the ONE account that is promoted to superadmin on bootstrap when its
  // Cognito-VERIFIED email matches (case-insensitive). Undefined = nobody is auto-promoted.
  SUPERADMIN_EMAIL: z.string().email().optional(),

  // Phase 11: how interview / session meeting links are minted. 'stub' needs no creds.
  CALENDAR_PROVIDER: z.enum(['stub', 'google']).default('stub'),

  // Phase 11: private bucket for mentor ID documents (presigned PUT/GET only).
  BUCKET_MENTOR_DOCS: z.string().optional(),
  // Phase 11: verified SES sender for the .ac.in OTP email. Unset → no email is sent
  // (non-prod returns a devOtp; prod refuses with 503 rather than silently dropping it).
  OTP_EMAIL_FROM: z.string().email().optional(),

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
