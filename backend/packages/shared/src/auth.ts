// Read the authenticated caller from the API Gateway JWT authorizer claims.
// API GW (HTTP API) + Cognito authorizer puts verified claims on
// event.requestContext.authorizer.jwt.claims — we NEVER re-verify here; the
// gateway already did. Services trust these claims.
import type { Context as HonoContext } from 'hono';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from 'aws-lambda';
import { UnauthorizedError, ForbiddenError } from './errors';
import type { Role } from './types';

/** Hono bindings when running via `hono/aws-lambda` handle(). */
export type LambdaBindings = {
  event: APIGatewayProxyEventV2WithJWTAuthorizer;
  lambdaContext: LambdaContext;
};

export interface Principal {
  /** Cognito subject — the stable user id. */
  userId: string;
  email?: string;
  phone?: string;
  /**
   * Display name from the OIDC `name` claim. Present for Google sign-in
   * (Cognito maps the Google profile name); ABSENT for phone-OTP / email
   * sign-up, where the user supplies it later during onboarding (PATCH /me).
   */
  name?: string;
  /** App role. Sourced from a custom claim (see auth-stack) or defaults to student. */
  role: Role;
  /** Raw verified claims, if a handler needs more. */
  claims: Record<string, unknown>;
}

/**
 * Extract the caller principal from the JWT claims.
 * @throws UnauthorizedError if no subject is present.
 */
export function getPrincipal<E extends { Bindings: LambdaBindings }>(c: HonoContext<E>): Principal {
  const claims = c.env.event.requestContext.authorizer?.jwt?.claims ?? {};
  const userId = (claims.sub as string | undefined) ?? undefined;
  if (!userId) throw UnauthorizedError();

  // DECIDED (ADR-005): the app role travels as the Cognito custom attribute
  // `custom:role` (written by auth-identity's switchRole -> setUserRoleAttribute).
  // New users have no attribute yet -> default 'student'.
  const role = ((claims['custom:role'] as Role | undefined) ?? 'student') as Role;

  return {
    userId,
    email: claims.email as string | undefined,
    phone: claims.phone_number as string | undefined,
    name: claims.name as string | undefined, // standard OIDC claim; only set for Google sign-in
    role,
    claims,
  };
}

/** Guard: require one of the given roles, else 403. */
export function requireRole(p: Principal, ...roles: Role[]): void {
  if (!roles.includes(p.role)) {
    throw ForbiddenError(`Requires role: ${roles.join('/')}`);
  }
}
