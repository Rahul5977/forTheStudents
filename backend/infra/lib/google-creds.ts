// Read Google OAuth creds from an SSM SecureString at SYNTH time.
//
// Why synth-time (not a CloudFormation dynamic reference): the creds live in ONE param
// as GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, and a `{{resolve:ssm-secure:…}}` reference
// (a) isn't supported by the Cognito UserPoolIdentityProvider ClientSecret property and
// (b) can't pull a single field out of a multi-line value anyway. So we read + parse it
// here and hand the fields to the Google IdP construct.
//
// We shell out to the AWS CLI (already required to deploy) so `infra` needs no extra SDK
// dependency. The secret is captured by execFileSync — never printed — and only becomes a
// SecretValue in auth-stack.ts. Any failure (no creds / no CLI / missing fields, e.g. in a
// credential-less CI `cdk synth`) logs a warning and returns undefined → Google stays OFF
// and synth never hard-fails.
import { execFileSync } from 'node:child_process';

export interface GoogleCreds {
  clientId: string;
  clientSecret: string;
}

// Tolerant parser: a JSON object OR dotenv-style KEY=VALUE lines (stray braces/quotes/
// commas stripped) — mirrors packages/shared/src/secrets.ts#parseBlob so both layers agree.
function parseKv(raw: string): Record<string, string> {
  const s = raw.trim();
  if (s.startsWith('{')) {
    try {
      return JSON.parse(s) as Record<string, string>;
    } catch {
      /* not valid JSON — fall through to dotenv parsing */
    }
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

export function loadGoogleCreds(paramName: string, region: string): GoogleCreds | undefined {
  let raw: string;
  try {
    raw = execFileSync(
      'aws',
      ['ssm', 'get-parameter', '--name', paramName, '--with-decryption', '--region', region, '--query', 'Parameter.Value', '--output', 'text'],
      { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch (e) {
    console.warn(`[google-auth] could not read SSM param "${paramName}" — Google sign-in stays OFF (${(e as Error).message.split('\n')[0]})`);
    return undefined;
  }
  const kv = parseKv(raw);
  const clientId = kv.GOOGLE_CLIENT_ID ?? kv.clientId;
  const clientSecret = kv.GOOGLE_CLIENT_SECRET ?? kv.clientSecret;
  if (!clientId || !clientSecret) {
    console.warn(`[google-auth] "${paramName}" is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — Google sign-in stays OFF`);
    return undefined;
  }
  return { clientId, clientSecret };
}
