// Read the authenticated caller from the API Gateway JWT authorizer claims.
// API GW (HTTP API) + Cognito authorizer puts verified claims on
// event.requestContext.authorizer.jwt.claims — we NEVER re-verify here; the
// gateway already did. Services trust these claims.
import type { Context as HonoContext } from 'hono';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from 'aws-lambda';
import { UnauthorizedError, ForbiddenError } from './errors';
import { ADMIN_SCOPES, type AdminScope, type Role } from './types';

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
  /**
   * Whether Cognito has VERIFIED the email (the `email_verified` claim). Federated Google
   * sign-ins are verified; an unverified email/password sign-up is not. Phase 11 keys the
   * superadmin promotion on this — never on the bare `email` string.
   */
  emailVerified: boolean;
  /** App role. Sourced from a custom claim (see auth-stack) or defaults to student. */
  role: Role;
  /**
   * Admin permission scopes (Phase 11, ADR-011). Ride in the JWT as `custom:scopes`
   * (comma-separated), written by auth-identity alongside `custom:role`. Empty for
   * non-admins. A superadmin needs none — `hasScope()` short-circuits on the role.
   */
  scopes: AdminScope[];
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
    emailVerified: isTrue(claims.email_verified),
    phone: claims.phone_number as string | undefined,
    name: claims.name as string | undefined, // standard OIDC claim; only set for Google sign-in
    role,
    scopes: parseScopes(claims['custom:scopes']),
    claims,
  };
}

/** Cognito serialises booleans as `true`/"true" depending on the token — accept both. */
function isTrue(v: unknown): boolean {
  return v === true || v === 'true';
}

/** `custom:scopes` is a comma-separated list; keep only scopes the platform knows. */
export function parseScopes(raw: unknown): AdminScope[] {
  if (typeof raw !== 'string' || !raw) return [];
  const known = new Set<string>(ADMIN_SCOPES as readonly string[]);
  return [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => known.has(s)))] as AdminScope[];
}

/** Serialise scopes for the `custom:scopes` Cognito attribute (stable order, de-duped). */
export function serializeScopes(scopes: readonly string[]): string {
  const known = new Set<string>(ADMIN_SCOPES as readonly string[]);
  return [...new Set(scopes.filter((s) => known.has(s)))].sort().join(',');
}

/**
 * Does the caller hold `scope`? A superadmin holds every scope implicitly; anyone else
 * (admin or not) must carry it explicitly. Pure — safe for UI parity tests.
 */
export function hasScope(p: Pick<Principal, 'role' | 'scopes'>, scope: AdminScope): boolean {
  if (p.role === 'superadmin') return true;
  return p.scopes.includes(scope);
}

/**
 * Guard: the caller must be (at least) an admin AND hold `scope`, else 403. Use this — not
 * `requireRole(p,'admin')` alone — on every admin route that maps to a permission scope
 * (Phase 11 packet 2). An admin with zero scopes therefore passes nothing scoped.
 */
export function requireScope(p: Principal, scope: AdminScope): void {
  requireRole(p, 'admin');
  if (!hasScope(p, scope)) throw ForbiddenError(`Requires permission: ${scope}`);
}

/**
 * Guard: require one of the given roles, else 403.
 * Hierarchy-aware: a `superadmin` satisfies ANY role requirement (superadmin ⊇ admin ⊇ …),
 * so existing `requireRole(p, 'admin')` checks accept a superadmin without change.
 */
export function requireRole(p: Principal, ...roles: Role[]): void {
  if (p.role === 'superadmin') return;
  if (!roles.includes(p.role)) {
    throw ForbiddenError(`Requires role: ${roles.join('/')}`);
  }
}

/** Guard: only the superadmin (never a regular admin) — for admin management. */
export function requireSuperadmin(p: Principal): void {
  if (p.role !== 'superadmin') throw ForbiddenError('Requires the superadmin.');
}
