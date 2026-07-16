// Runtime secrets from SSM Parameter Store (a single SecureString JSON blob).
// Fetched ONCE per Lambda cold start, cached in memory, decrypted via KMS. The
// param NAME comes from env (SECRETS_PARAM) — never the value. Falls back to
// process.env so a local `.env` works in dev/tests without any AWS call.
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { createLogger } from './logger';

const logger = createLogger('secrets');
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

/** Tolerant parser: a JSON object, OR dotenv-style KEY=VALUE lines (quotes/commas stripped). */
function parseBlob(raw: string): Record<string, string> {
  const s = raw.trim();
  if (s.startsWith('{')) {
    try { return JSON.parse(s) as Record<string, string>; }
    catch (e) { logger.warn('secrets param starts with { but is not valid JSON — parsing as KEY=VALUE', { err: String(e) }); }
  }
  const out: Record<string, string> = {};
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim().replace(/^["'{,]+|["',}]+$/g, '');
    const v = t.slice(eq + 1).trim().replace(/^["']+|["',]+$/g, '');
    if (k) out[k] = v;
  }
  return out;
}

async function load(): Promise<Record<string, string>> {
  const name = process.env.SECRETS_PARAM;
  if (!name) return {}; // no param configured → env-only
  try {
    const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });
    const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    const raw = res.Parameter?.Value;
    const parsed = raw ? parseBlob(raw) : {};
    logger.info('secrets loaded', { name, keys: Object.keys(parsed) }); // key NAMES only, never values
    return parsed;
  } catch (e) {
    logger.error('failed to load secrets param — falling back to env', { name, err: String(e) });
    return {};
  }
}

/**
 * Resolve one secret by key. Order: cached SSM blob → process.env → undefined.
 * Safe to call on every request — the network fetch happens at most once per cold start.
 */
export async function getSecret(key: string): Promise<string | undefined> {
  if (!cache) {
    inflight ??= load();
    cache = await inflight;
  }
  return cache[key] ?? process.env[key];
}

/** Test/reconfig hook — forces the next getSecret() to reload. */
export function clearSecretsCache(): void {
  cache = null;
  inflight = null;
}
