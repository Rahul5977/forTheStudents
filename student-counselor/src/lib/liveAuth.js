'use client';
// Auth for the /live page. Two modes:
//  - dev:     POST /dev/login (email -> a fake token the dev server trusts)
//  - cognito: redirect to the Cognito Hosted UI; it returns a REAL id_token JWT.
// In BOTH cases the result is a bearer token we send to the backend.
import { API_URL, COGNITO, isCognito } from './liveConfig';

const TOKEN_KEY = 'sc.live.token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  window.localStorage.setItem(TOKEN_KEY, t);
}
export function logout() {
  window.localStorage.removeItem(TOKEN_KEY);
}

/** Decode a JWT (or our dev token) payload — for display only, NOT verification. */
export function decodeToken(token) {
  try {
    if (token.startsWith('dev.')) {
      return JSON.parse(atob(token.slice(4).replace(/-/g, '+').replace(/_/g, '/')));
    }
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

// ── dev mode ────────────────────────────────────────────────────────────────
export async function devLogin(email, name) {
  const res = await fetch(`${API_URL}/dev/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: name || undefined }),
  });
  if (!res.ok) throw new Error(`dev login failed (${res.status})`);
  const { token } = await res.json();
  setToken(token);
  return token;
}

// ── cognito mode (Hosted UI, implicit token flow) ────────────────────────────
export function cognitoLoginUrl() {
  const redirect = COGNITO.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/live` : '');
  const params = new URLSearchParams({
    client_id: COGNITO.clientId,
    response_type: 'token', // implicit — returns id_token in the URL fragment
    scope: 'openid email profile',
    redirect_uri: redirect,
  });
  return `${COGNITO.domain}/login?${params.toString()}`;
}

/**
 * Federated sign-in via the Cognito Hosted UI (e.g. Google). Redirects straight to the
 * IdP (identity_provider=<idp>) and returns to /auth/callback with the id_token in the URL
 * fragment (implicit flow, matching cognitoLoginUrl). Requires the pool to have that IdP
 * configured server-side (see backend cfg.googleOAuthSecretArn); until then Cognito rejects it.
 * NOTE: for prod, switch to authorization-code + PKCE (implicit is disabled in the prod client).
 */
export function federatedLoginUrl(idp) {
  const redirect =
    COGNITO.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '');
  const params = new URLSearchParams({
    identity_provider: idp, // 'Google'
    client_id: COGNITO.clientId,
    response_type: 'token',
    scope: 'openid email profile',
    redirect_uri: redirect,
  });
  return `${COGNITO.domain}/oauth2/authorize?${params.toString()}`;
}

/** Kick off Google sign-in (redirects the whole page to the Hosted UI). */
export function loginWithGoogle() {
  if (typeof window !== 'undefined') window.location.href = federatedLoginUrl('Google');
}

/**
 * Cognito Hosted-UI sign-out URL, or null when not in cognito mode / not configured.
 * CRUCIAL for federated (Google) login: clearing only our local token leaves the Hosted-UI
 * session cookie alive, so the next "Continue with Google" silently re-logs-in the SAME user
 * (e.g. an admin) with no Google prompt — the admin UI then leaks to whoever uses that browser.
 * Redirecting here clears the Cognito session; `logout_uri` MUST exactly match a registered
 * sign-out URL (the bare origin — see cfg.corsOrigins → Cognito LogoutURLs).
 */
export function hostedLogoutUrl() {
  if (!isCognito() || !COGNITO.domain || typeof window === 'undefined') return null;
  const params = new URLSearchParams({
    client_id: COGNITO.clientId,
    logout_uri: window.location.origin,
  });
  return `${COGNITO.domain}/logout?${params.toString()}`;
}

/** After the Hosted UI redirects back, pull id_token out of the URL fragment. */
export function captureCognitoRedirect() {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const idToken = hash.get('id_token');
  if (idToken) {
    setToken(idToken);
    // Clean the token out of the address bar.
    window.history.replaceState({}, '', window.location.pathname);
    return idToken;
  }
  return null;
}
