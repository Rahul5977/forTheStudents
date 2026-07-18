'use client';
// Typed-ish client for the auth-identity backend. Attaches the bearer token and
// surfaces backend errors ({ error: { code, message } }) as thrown Errors.
import { API_URL } from './liveConfig';
import { getToken } from './liveAuth';

// In-process memo of predictor responses keyed by the exact query string (rank +
// category + gender + home + filters). Lives for the page session; predictions are a
// pure function of the query, so caching them is safe and makes repeat predicts free.
const _predictCache = new Map();

async function call(path, { method = 'GET', body, headers } = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
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
  // Same as predict(), but memoized in-process by the exact query string. Predicting
  // again for the SAME rank/category/gender/filters returns the cached result with no
  // network round-trip — so repeated "Predict" clicks are stable and instant. A failed
  // request is evicted so a later retry can re-fetch.
  predictCached: (params) => {
    const key = new URLSearchParams(params).toString();
    const hit = _predictCache.get(key);
    if (hit) return hit;
    const req = call(`/predict?${key}`).catch((e) => { _predictCache.delete(key); throw e; });
    _predictCache.set(key, req);
    return req;
  },
  college: (id, params) => call(`/colleges/${id}?${new URLSearchParams(params).toString()}`),
  collegeProfile: (slug, params) => call(`/colleges/${encodeURIComponent(slug)}/profile?${new URLSearchParams(params).toString()}`),
  colleges: () => call('/colleges'), // canonical institute directory

  // Phase 3 — planner (per-user; needs a token). Optimistic concurrency via `version`.
  // NOTE: only send `version` when it's an actual number. A fresh/unhydrated list has
  // version === null, and the planner schema is `z.number().optional()` — which REJECTS
  // null ("Expected number, received null") → the whole save 400s and "Add to list" looks
  // broken. Omitting the key (optional) lets the first write through; the server returns
  // the real version, and subsequent writes carry it for optimistic concurrency.
  getShortlist: () => call('/shortlist'),
  putShortlist: (collegeIds, version) => call('/shortlist', { method: 'PUT', body: { collegeIds, ...(typeof version === 'number' ? { version } : {}) } }),
  getChoiceList: () => call('/choice-list'),
  putChoiceList: (items, version) => call('/choice-list', { method: 'PUT', body: { items, ...(typeof version === 'number' ? { version } : {}) } }),
  reorderChoice: (from, to, version) => call('/choice-list/reorder', { method: 'POST', body: { from, to, ...(typeof version === 'number' ? { version } : {}) } }),
  choiceDoctor: (params) => call(`/choice-list/doctor?${new URLSearchParams(params).toString()}`),
  exportChoiceList: () => call('/choice-list/export', { method: 'POST' }),

  // Phase 4 — marketplace & mentors.
  mentors: (params = {}) => call(`/mentors?${new URLSearchParams(params).toString()}`), // public
  mentorApply: (body) => call('/mentor/apply', { method: 'POST', body }),
  mentorVerifyEmail: (email, code) => call('/mentor/verify/email', { method: 'POST', body: code ? { email, code } : { email } }),
  mentorVerifyId: (docRef) => call('/mentor/verify/id', { method: 'POST', body: { docRef } }),
  mentorProfile: () => call('/mentor/profile'),
  mentorPending: () => call('/admin/mentors/pending'), // admin
  mentorReview: (id, decision, note) => call(`/admin/mentors/${id}/review`, { method: 'POST', body: { decision, note } }),

  // Phase 5 — booking, payments & sessions.
  createBooking: (mentorId, slotId, idempKey) => call('/bookings', { method: 'POST', body: { mentorId, slotId }, headers: idempKey ? { 'idempotency-key': idempKey } : undefined }),
  getBooking: (id) => call(`/bookings/${id}`),
  cancelBooking: (id) => call(`/bookings/${id}/cancel`, { method: 'POST' }),
  acceptBooking: (id) => call(`/bookings/${id}/accept`, { method: 'POST' }),   // mentor accepts a request
  declineBooking: (id) => call(`/bookings/${id}/decline`, { method: 'POST' }), // mentor declines a request
  mentorSlots: (mentorId) => call(`/mentors/${encodeURIComponent(mentorId)}/slots`), // public: a mentor's open slots
  sessions: () => call('/sessions'),
  joinSession: (id) => call(`/sessions/${id}/join`, { method: 'POST' }),
  endSession: (id) => call(`/sessions/${id}/end`, { method: 'POST' }),
  rateSession: (id, rating, comment) => call(`/sessions/${id}/rate`, { method: 'POST', body: { rating, comment } }),
  // Dev-only: stand in for the Razorpay webhook so the saga can be driven from the UI.
  simulatePayment: (bookingId) => call('/payments/webhook', { method: 'POST', body: { bookingId, providerPaymentId: `dev-${bookingId}`, event: 'payment.captured' } }),

  // Phase 6 — notifications (in-app feed).
  notifications: () => call('/notifications'),
  markNotifRead: (id) => call(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotifsRead: () => call('/notifications/read-all', { method: 'POST' }),

  // Mentor availability (per-mentor weekly slots). GET reads the mentor's own
  // schedule; PUT replaces it. Shape: { slots: [{ id, day, time, ... }] }.
  mentorAvailability: () => call('/mentor/availability'),
  putMentorAvailability: (slots) => call('/mentor/availability', { method: 'PUT', body: { slots } }),

  // Phase 7 — admin console. All require role==='admin'.
  adminStats: () => call('/admin/stats'),
  adminUsers: () => call('/admin/users'), // directory + live/active counts
  adminAudit: (params = {}) => call(`/admin/audit?${new URLSearchParams(params).toString()}`),
  // Moderation acts on a MENTOR id (drops/restores them from the public search).
  adminSuspendMentor: (id, reason) => call(`/admin/mentors/${id}/suspend`, { method: 'POST', body: { reason } }),
  adminReinstateMentor: (id) => call(`/admin/mentors/${id}/reinstate`, { method: 'POST' }),
  adminBroadcast: (body) => call('/admin/broadcast', { method: 'POST', body }),
};
