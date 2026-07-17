'use client';
// ══════════════════════════════════════════════════════════════════════════
// Real Cognito auth (email/password) via amazon-cognito-identity-js.
// The resulting ID token is stored under the SAME localStorage key liveAuth uses
// ('sc.live.token'), so liveApi keeps sending `authorization: Bearer <idToken>`.
//
// The dev pool AUTO-CONFIRMS sign-ups, so signUp() → login() works immediately;
// confirm() tolerates an already-confirmed user. The Cognito Hosted-UI flow from
// liveAuth (cognitoLoginUrl / captureCognitoRedirect) stays available as a fallback.
// ══════════════════════════════════════════════════════════════════════════
import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserAttribute,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import { COGNITO } from './liveConfig';
import { setToken, logout as clearToken, getToken } from './liveAuth';

// Lazily build the pool so nothing touches `window` at module-eval time (keeps the
// static export prerender happy). Reused across calls once created.
let _pool = null;
function pool() {
  if (_pool) return _pool;
  if (!COGNITO.userPoolId || !COGNITO.clientId) {
    throw new Error('Cognito is not configured (missing user pool id / client id).');
  }
  _pool = new CognitoUserPool({ UserPoolId: COGNITO.userPoolId, ClientId: COGNITO.clientId });
  return _pool;
}

function userOf(email) {
  return new CognitoUser({ Username: email, Pool: pool() });
}

/**
 * Register a new user. Resolves `{ user, userConfirmed }`:
 *   • userConfirmed === true  → the pool auto-confirmed (dev auto-confirm trigger) — the
 *     caller can log in immediately.
 *   • userConfirmed === false → Cognito emailed a verification code; the caller must send
 *     the user to the OTP screen to confirm before login.
 * This makes the signup flow adapt automatically to whether email verification is enforced
 * server-side (see backend cfg.autoConfirmSignups) — no frontend change needed to switch it on.
 */
export function signUp(email, password, name) {
  return new Promise((resolve, reject) => {
    const attrs = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      ...(name ? [new CognitoUserAttribute({ Name: 'name', Value: name })] : []),
    ];
    pool().signUp(email, password, attrs, null, (err, res) => {
      if (err) return reject(normalize(err));
      resolve({ user: res?.user || null, userConfirmed: !!res?.userConfirmed });
    });
  });
}

/** Re-send the sign-up verification code to the user's email. */
export function resendCode(email) {
  return new Promise((resolve, reject) => {
    userOf(email).resendConfirmationCode((err) => (err ? reject(normalize(err)) : resolve(true)));
  });
}

/** Start a password reset — Cognito emails a 6-digit verification code. */
export function forgotPassword(email) {
  return new Promise((resolve, reject) => {
    userOf(email).forgotPassword({
      onSuccess: () => resolve(true),
      onFailure: (err) => reject(normalize(err)),
    });
  });
}

/** Complete a password reset with the emailed code + the new password. */
export function confirmForgotPassword(email, code, newPassword) {
  return new Promise((resolve, reject) => {
    userOf(email).confirmPassword(code, newPassword, {
      onSuccess: () => resolve(true),
      onFailure: (err) => reject(normalize(err)),
    });
  });
}

/** Confirm a sign-up code. Tolerates an already-confirmed user (dev auto-confirm). */
export function confirm(email, code) {
  return new Promise((resolve, reject) => {
    userOf(email).confirmRegistration(code || '000000', true, (err) => {
      if (!err) return resolve(true);
      const msg = String(err.message || '');
      // Auto-confirmed pools: the account is already confirmed — treat as success.
      if (
        err.code === 'NotAuthorizedException' ||
        /already been confirmed|current status is confirmed|cannot be confirmed/i.test(msg)
      ) {
        return resolve(true);
      }
      reject(normalize(err));
    });
  });
}

/** Log in with email + password (SRP). Resolves with the raw ID-token JWT. */
export function login(email, password) {
  return new Promise((resolve, reject) => {
    const user = userOf(email);
    const details = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(details, {
      onSuccess: (session) => {
        const idToken = session.getIdToken().getJwtToken();
        setToken(idToken);
        resolve(idToken);
      },
      onFailure: (err) => reject(normalize(err)),
      // A brand-new pool user may be asked to set a permanent password; re-submit
      // the same one so first login just works.
      newPasswordRequired: () => {
        user.completeNewPasswordChallenge(password, {}, {
          onSuccess: (session) => {
            const idToken = session.getIdToken().getJwtToken();
            setToken(idToken);
            resolve(idToken);
          },
          onFailure: (err) => reject(normalize(err)),
        });
      },
    });
  });
}

/** Clear the local token and the Cognito session. */
export function logout() {
  try {
    const u = pool().getCurrentUser();
    if (u) u.signOut();
  } catch { /* pool not configured — token clear below is enough */ }
  clearToken();
}

/** The current bearer token (same key liveApi reads), or null. */
export function currentToken() {
  return getToken();
}

// Cognito errors come back as { code, name, message }; surface a clean Error.
function normalize(err) {
  const e = new Error(err?.message || 'Authentication failed');
  e.code = err?.code || err?.name;
  return e;
}
