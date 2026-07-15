'use client';
// Typed-ish client for the auth-identity backend. Attaches the bearer token and
// surfaces backend errors ({ error: { code, message } }) as thrown Errors.
import { API_URL } from './liveConfig';
import { getToken } from './liveAuth';

async function call(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export const liveApi = {
  bootstrap: () => call('/auth/bootstrap', { method: 'POST' }),
  getMe: () => call('/me'),
  patchName: (name) => call('/me', { method: 'PATCH', body: { name } }),
  patchRankPrefs: (rankPrefs) => call('/me/rank-prefs', { method: 'PATCH', body: rankPrefs }),
  switchRole: (role) => call('/me/role', { method: 'POST', body: { role } }),

  // Phase 2 — public predictor/catalog (no auth needed; shared + cacheable).
  predict: (params) => call(`/predict?${new URLSearchParams(params).toString()}`),
  college: (id, params) => call(`/colleges/${id}?${new URLSearchParams(params).toString()}`),
};
