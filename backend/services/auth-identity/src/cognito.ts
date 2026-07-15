// Cognito admin operations for auth-identity. Kept here (not in @sc/shared) because
// only this service touches the user pool's attributes.
//
// Local dev skips the call (no pool) so tests run offline.
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { createLogger, type Role } from '@sc/shared';
import { getEnv, isLocal } from '@sc/config';

const logger = createLogger('auth-identity.cognito');
let client: CognitoIdentityProviderClient | null = null;
const getClient = () => (client ??= new CognitoIdentityProviderClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }));

/**
 * Write the app role onto the Cognito user as `custom:role` so it appears in the
 * NEXT id/access token the user gets. (The current token keeps the old role until
 * it refreshes — the frontend should refresh the session after a role switch.)
 *
 * @param username  the Cognito username (== the JWT `sub` for our pool)
 * @param role      'student' | 'mentor' | 'admin'
 */
export async function setUserRoleAttribute(username: string, role: Role): Promise<void> {
  const poolId = getEnv().COGNITO_USER_POOL_ID;
  if (isLocal() || !poolId) {
    logger.debug('skip cognito role sync (local or no pool)', { role });
    return;
  }
  await getClient().send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: poolId,
      Username: username,
      UserAttributes: [{ Name: 'custom:role', Value: role }],
    }),
  );
}
