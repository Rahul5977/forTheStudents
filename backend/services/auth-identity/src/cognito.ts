// Cognito admin operations for auth-identity. Kept here (not in @sc/shared) because
// only this service touches the user pool's attributes.
//
// Local dev skips the call (no pool) so tests run offline.
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { createLogger, serializeScopes, type Role } from '@sc/shared';
import { getEnv, isLocal } from '@sc/config';

const logger = createLogger('auth-identity.cognito');
let client: CognitoIdentityProviderClient | null = null;
const getClient = () => (client ??= new CognitoIdentityProviderClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }));

/**
 * Write the app role (and, Phase 11, the admin permission scopes) onto the Cognito user as
 * `custom:role` / `custom:scopes` so they appear in the NEXT id/access token the user gets.
 * (The current token keeps the old claims until it refreshes — the frontend refreshes the
 * session after a role switch, or asks the user to sign in again when it cannot.)
 *
 * @param username  the Cognito username (== the JWT `sub` for our pool)
 * @param role      'student' | 'mentor' | 'admin' | 'superadmin'
 * @param scopes    admin permission scopes; omitted = leave `custom:scopes` untouched,
 *                  `[]` = clear it (demotion).
 */
export async function setUserRoleAttribute(username: string, role: Role, scopes?: readonly string[]): Promise<void> {
  const poolId = getEnv().COGNITO_USER_POOL_ID;
  if (isLocal() || !poolId) {
    logger.debug('skip cognito role sync (local or no pool)', { role, scopes });
    return;
  }
  const attrs: { Name: string; Value: string }[] = [{ Name: 'custom:role', Value: role }];
  if (scopes !== undefined) attrs.push({ Name: 'custom:scopes', Value: serializeScopes(scopes) });
  await getClient().send(
    new AdminUpdateUserAttributesCommand({ UserPoolId: poolId, Username: username, UserAttributes: attrs }),
  );
}
