// Runtime environment, validated once at cold start. Import `env` anywhere.
// Fails fast with a clear message if a required var is missing in AWS.
import { z } from 'zod';

const Schema = z.object({
  STAGE: z.enum(['dev', 'staging', 'prod']).default('dev'),
  AWS_REGION: z.string().default('ap-south-1'),

  // DynamoDB
  DDB_ENDPOINT: z.string().optional(), // local dev only
  TABLE_USERS: z.string().default('sc-dev-users'),

  // Cognito (populated from CDK outputs / SSM in real deploys)
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_ISSUER: z.string().optional(),

  // Feature flags
  SEASON: z.enum(['on', 'off']).default('on'),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    // TODO(owner): route this to your alerting; a bad env should page in-season.
    throw new Error(`Invalid environment:\n${parsed.error.toString()}`);
  }
  cached = parsed.data;
  return cached;
}

/** Convenience singleton (lazy). */
export const env: Env = new Proxy({} as Env, {
  get: (_t, prop: string) => getEnv()[prop as keyof Env],
});
