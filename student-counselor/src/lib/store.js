'use client';
// ══════════════════════════════════════════════════════════════════════════
// App state — a single React context that is now BACKED BY THE LIVE BACKEND.
// It preserves EVERY field name/shape the ~70 screens already read (so they keep
// compiling) and layers real auth + data on top:
//   • Auth: token / loggedIn / role / authReady, profile hydrated from
//     bootstrap() + getMe() (rankPrefs flattened onto `profile` so screens that
//     read profile.advRank / profile.category / profile.branches keep working).
//   • Planner: shortlist / choiceList stay ARRAYS OF college ids; the decorated
//     server rows + version + doctor land in new fields (choiceItems, choiceVersion…).
//   • New data: sessions, notifications + unreadCount, collegesById / mentorsById caches.
//   • runAct stays the SAME { act, id, i, ... } dispatcher; data actions are now
//     optimistic-then-refetch against liveApi. New actions are also exposed as
//     named functions on the context.
//
// STATIC EXPORT SAFE: all fetching happens in useEffect / handlers at runtime.
// ══════════════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { idToPath, slugToId, ctxOf } from './routes';
import { liveApi } from './liveApi';
import { getToken, captureCognitoRedirect, loginWithGoogle as googleRedirect } from './liveAuth';
import { GOOGLE_AUTH } from './liveConfig';
import {
  login as cognitoLogin, signUp as cognitoSignUp, confirm as cognitoConfirm, logout as cognitoLogout,
  resendCode as cognitoResend, forgotPassword as cognitoForgot, confirmForgotPassword as cognitoConfirmForgot,
  refreshSession,
} from './auth';

const AppCtx = createContext(null);

// Lazy-load the Razorpay Checkout script once, on first payment. (This is a real
// deployed site, not a sandboxed artifact, so loading the gateway script is fine.)
function loadRazorpayCheckout() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// Default profile shape kept so public screens (and pre-hydration renders) never
// crash reading profile.advRank etc. Overwritten by the DB profile after login.
// Ranks start at 0 ("not given") — a signed-in user must enter them in onboarding, and the
// predictor treats 0 as unranked. (Previously hardcoded 850/4200, which made a fresh user
// look already-ranked and skipped the requirement to enter real ranks.)
const DEFAULT_PROFILE = { advRank: 0, mainRank: 0, category: 'Open', home: 'Maharashtra', gender: 'Male', pwd: false, branches: [], priority: 'branch' };

const INITIAL = {
  // ── auth ──────────────────────────────────────────────────────────────
  token: null,
  loggedIn: false,
  role: 'student',
  authReady: false,
  // Mentor application status, INDEPENDENT of `role` (a mentor is an additive area on top
  // of the student experience). null = not yet loaded; 'none' = no application; else the
  // marketplace status (DRAFT | PENDING_REVIEW | INTERVIEW | APPROVED | REJECTED).
  mentorStatus: null,
  // ── profile / predictor inputs (flattened rankPrefs live here) ─────────
  profile: DEFAULT_PROFILE,
  filters: { types: ['IIT', 'NIT', 'IIIT', 'GFTI'], branch: 'all', state: 'all', q: '', sort: 'best', grouped: true, gender: 'Gender-Neutral', bucket: 'all', quota: 'all', nirfMax: 0, maxFees: 0, homeOnly: false },
  // ── planner: ids the screens read + the decorated/versioned server data ─
  // Empty by default — real ids arrive from loadShortlist()/loadChoice() after login.
  // (Previously seeded with dummy ids [3,7] / [1,6,9,12,15], which could get PUT to the
  // planner before hydration and pollute a fresh user's saved list.)
  shortlist: [],
  shortlistVersion: null,
  choiceList: [],
  choiceItems: [],       // decorated rows from the planner (id, college, branch, bucket, pct…)
  choiceVersion: null,   // optimistic-concurrency version for the choice list
  choiceSummary: null,   // { safe, target, reach, total }
  choiceWarnings: [],    // List Doctor warnings (server-computed)
  // ── booking / sessions ─────────────────────────────────────────────────
  sessions: [],
  // ── notifications feed ─────────────────────────────────────────────────
  notifications: [],
  unreadCount: 0,
  // ── on-demand caches ───────────────────────────────────────────────────
  collegesById: {},
  profilesById: {}, // canonical-slug → deep college profile
  mentorsById: {},
  // ── local UI state (unchanged from the prototype) ──────────────────────
  scenario: 'balanced',
  selected: 1,
  selectedCollege: null, // canonical institute slug for the College Explorer
  compareIds: [1, 6],
  mentorSel: 1,
  onbStep: 1,
  dragIndex: null,
  sessTime: 0,
  camOn: true,
  micOn: true,
  sessState: 'in',
  chat: [{ who: 'm', t: 'Hi! I saw your question about CSE vs ECE — happy to help.' }],
  chatDraft: '',
  toast: null,
  dialog: null,
  bookingSlot: null,
  sessionsTab: 'upcoming',
};

// Which contexts require a signed-in user (and which additionally require admin).
const GATED = new Set(['student', 'mentor', 'admin']);

// Flatten the backend /me row onto the flat `profile` shape screens read.
function profileFromMe(me) {
  const rp = me?.rankPrefs || {};
  return {
    ...DEFAULT_PROFILE,
    ...rp,
    branches: Array.isArray(rp.branches) && rp.branches.length ? rp.branches : DEFAULT_PROFILE.branches,
    userId: me?.userId,
    email: me?.email,
    name: me?.name,
    role: me?.role,
    permissions: Array.isArray(me?.permissions) ? me.permissions : [],
    onboardedAt: me?.onboardedAt,
    createdAt: me?.createdAt,
  };
}

export function AppProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState(INITIAL);
  const toastTimer = useRef(null);

  // A live mirror of state so async handlers read fresh ids/versions without
  // stale closures. Updated every render.
  const sRef = useRef(state);
  sRef.current = state;
  const inflightCollege = useRef({}); // memoize concurrent /colleges/:id fetches
  const inflightProfile = useRef({}); // memoize concurrent /colleges/:slug/profile fetches

  // Strip leading + trailing slashes (trailingSlash export → e.g. "/predictor/").
  const screen = slugToId(pathname.replace(/^\/+|\/+$/g, ''));
  const ctx = ctxOf(screen);

  const update = useCallback((patch) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  const navigate = useCallback((id, opts = {}) => {
    setState((s) => {
      const next = { ...s, toast: null, dialog: null };
      if (id === 'collegeDetail' && opts.id != null) next.selected = +opts.id;
      if (id === 'collegeExplorer' && opts.slug != null) next.selectedCollege = String(opts.slug);
      return next;
    });
    router.push(idToPath(id));
  }, [router]);

  const toast = useCallback((msg) => {
    setState((s) => ({ ...s, toast: msg }));
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setState((s) => ({ ...s, toast: null })), 2200);
  }, []);

  // ─── data loaders ─────────────────────────────────────────────────────────
  const loadShortlist = useCallback(async () => {
    try {
      const r = await liveApi.getShortlist();
      setState((s) => ({ ...s, shortlist: r?.collegeIds ?? [], shortlistVersion: r?.version ?? null }));
    } catch { /* leave existing */ }
  }, []);

  const predictParamsOf = (p) => ({
    // Send empty (unranked) for a 0/absent rank — the API rejects "0" and an unranked
    // Advanced rank correctly excludes IITs (predicted from the Main rank).
    advRank: p.advRank > 0 ? p.advRank : '', mainRank: p.mainRank > 0 ? p.mainRank : '',
    category: p.category, home: p.home, gender: p.gender || 'Male',
  });

  const loadChoice = useCallback(async () => {
    const p = sRef.current.profile;
    try {
      const r = await liveApi.choiceDoctor(predictParamsOf(p));
      setState((s) => ({
        ...s,
        choiceItems: r?.items ?? [],
        choiceList: (r?.items ?? []).map((it) => it.id),
        choiceVersion: r?.choiceVersion ?? null,
        choiceSummary: r?.summary ?? null,
        choiceWarnings: r?.warnings ?? [],
      }));
    } catch { /* leave existing */ }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const r = await liveApi.sessions();
      setState((s) => ({ ...s, sessions: r?.sessions ?? [] }));
    } catch { /* leave existing */ }
  }, []);

  const loadNotifs = useCallback(async () => {
    try {
      const r = await liveApi.notifications();
      setState((s) => ({ ...s, notifications: r?.notifications ?? [], unreadCount: r?.unread ?? 0 }));
    } catch { /* leave existing */ }
  }, []);

  // Load the caller's mentor application status (independent of `role`). 404 → 'none'.
  const loadMentorStatus = useCallback(async () => {
    try {
      const m = await liveApi.mentorProfile();
      setState((s) => ({ ...s, mentorStatus: m?.status || 'none' }));
    } catch {
      setState((s) => ({ ...s, mentorStatus: 'none' }));
    }
  }, []);

  // Hydrate everything a signed-in user needs.
  const hydrateData = useCallback(() => {
    loadShortlist(); loadChoice(); loadSessions(); loadNotifs(); loadMentorStatus();
  }, [loadShortlist, loadChoice, loadSessions, loadNotifs, loadMentorStatus]);

  // Bootstrap the account row + read the profile back.
  const hydrateAuth = useCallback(async (tok) => {
    try {
      await liveApi.bootstrap();
      const me = await liveApi.getMe();
      const prof = profileFromMe(me);
      setState((s) => ({
        ...s, token: tok, loggedIn: true, role: me?.role || 'student', profile: prof, authReady: true,
        // Default the predictor's seat pool to the student's gender so a female sees her
        // Female-only (supernumerary) advantage without having to toggle it on.
        filters: { ...s.filters, gender: /female/i.test(prof.gender || '') ? 'Female-only (including Supernumerary)' : 'Gender-Neutral' },
      }));
      return me;
    } catch {
      // Token present but invalid/expired — treat as logged out.
      setState((s) => ({ ...s, token: null, loggedIn: false, authReady: true }));
      return null;
    }
  }, []);

  // ── On mount: capture a Hosted-UI redirect, then hydrate if a token exists. ──
  // Prefer a freshly-refreshed token: the SDK uses the stored refresh token to renew an
  // expired id token, so a returning user stays signed in instead of hitting the login
  // screen. Falls back to whatever token is stored (e.g. a Hosted-UI/Google implicit token
  // the SDK doesn't manage) so those paths keep working until they expire.
  useEffect(() => {
    captureCognitoRedirect();
    refreshSession()
      .then((fresh) => fresh || getToken())
      .then((t) => {
        if (t) hydrateAuth(t);
        else setState((s) => ({ ...s, authReady: true }));
      })
      .catch(() => setState((s) => ({ ...s, authReady: true })));
  }, [hydrateAuth]);

  // Keep the session alive: silently refresh the id token every 30 min (well inside its
  // 1h expiry) while signed in, so a user is never logged out mid-session — up to the
  // refresh-token lifetime. No-op for unmanaged tokens (resolves null) and when signed out.
  useEffect(() => {
    if (!state.loggedIn) return undefined;
    const id = setInterval(() => { refreshSession(); }, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [state.loggedIn]);

  // ── Load per-user data once authenticated. ──
  useEffect(() => {
    if (state.loggedIn && state.token) hydrateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loggedIn, state.token]);

  // ── AUTH GATE: redirect unauthenticated users away from gated screens, and route
  // signed-in-but-not-onboarded users to pick a role + enter their details first. ──
  useEffect(() => {
    if (!state.authReady) return;
    const isAdminish = state.role === 'admin' || state.role === 'superadmin';
    const hasRanks = state.profile.advRank > 0 || state.profile.mainRank > 0;
    const isMentorApplicant = !!state.mentorStatus && state.mentorStatus !== 'none';
    // Onboarded = has real ranks (student) OR has applied as a mentor OR is an admin.
    const onboarded = hasRanks || isMentorApplicant || isAdminish;
    // Only act on the onboarding redirect once we actually KNOW the status (avoids bouncing
    // a mentor-without-ranks to role-select before their mentor status has loaded).
    const onboardKnown = hasRanks || state.mentorStatus !== null || isAdminish;

    // A signed-in user hitting the marketing root goes to onboarding (if needed) or their app.
    if (state.token && screen === 'landing') {
      if (onboardKnown && !onboarded) { navigate('roleSelect'); return; }
      navigate(isAdminish ? 'aDashboard' : 'dashboard');
      return;
    }
    if (!GATED.has(ctx)) return;
    if (!state.token) { navigate('login'); return; }
    if (onboardKnown && !onboarded) { navigate('roleSelect'); return; }
    if (ctx === 'admin' && !isAdminish) { navigate('dashboard'); return; }
    // The mentor area is additive on top of the student app — only APPROVED mentors get in.
    // (null = status not loaded yet → don't bounce prematurely.)
    if (ctx === 'mentor' && state.mentorStatus !== null && state.mentorStatus !== 'APPROVED') { navigate('dashboard'); }
  }, [ctx, screen, state.authReady, state.token, state.role, state.profile, state.mentorStatus, navigate]);

  // Session timer: tick while on a live call screen.
  useEffect(() => {
    const t = setInterval(() => {
      if ((screen === 'sessionRoom' || screen === 'mSession') && sRef.current.sessState === 'in') {
        setState((s) => ({ ...s, sessTime: s.sessTime + 1 }));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [screen]);

  useEffect(() => () => { clearTimeout(toastTimer.current); }, []);

  // ─── planner mutations (optimistic → persist → refetch) ────────────────────
  const putChoice = useCallback(async (ids, okMsg) => {
    const prev = sRef.current;
    setState((s) => ({ ...s, choiceList: ids })); // optimistic
    try {
      await liveApi.putChoiceList(ids, sRef.current.choiceVersion);
      await loadChoice();
      if (okMsg) toast(okMsg);
    } catch (e) {
      setState((s) => ({ ...s, choiceList: prev.choiceList })); // revert
      toast(e.message || 'Could not save your list');
    }
  }, [loadChoice, toast]);

  const putShort = useCallback(async (ids, okMsg) => {
    const prev = sRef.current;
    setState((s) => ({ ...s, shortlist: ids })); // optimistic
    try {
      const r = await liveApi.putShortlist(ids, sRef.current.shortlistVersion);
      setState((s) => ({ ...s, shortlist: r?.collegeIds ?? ids, shortlistVersion: r?.version ?? s.shortlistVersion }));
      if (okMsg) toast(okMsg);
    } catch (e) {
      setState((s) => ({ ...s, shortlist: prev.shortlist })); // revert
      toast(e.message || 'Could not update shortlist');
    }
  }, [toast]);

  const reorderChoice = useCallback(async (from, to) => {
    if (from == null || to == null || from === to) return;
    const ids = sRef.current.choiceList;
    if (to < 0 || to >= ids.length) return;
    const a = [...ids];
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    setState((s) => ({ ...s, choiceList: a })); // optimistic
    try {
      await liveApi.reorderChoice(from, to, sRef.current.choiceVersion);
      await loadChoice();
    } catch {
      await putChoice(a); // fall back to a full PUT of the new order
    }
  }, [loadChoice, putChoice]);

  // ─── booking / session actions ─────────────────────────────────────────────
  const withSessionRefresh = useCallback(async (fn, okMsg, failMsg) => {
    try { await fn(); await loadSessions(); if (okMsg) toast(okMsg); }
    catch (e) { toast(e.message || failMsg || 'Something went wrong'); }
  }, [loadSessions, toast]);

  // Student REQUESTS a specific (real) slot — the mentor then accepts/declines.
  const book = useCallback((mentorId, slotId) =>
    withSessionRefresh(() => liveApi.createBooking(mentorId, slotId, `ui-${mentorId}-${slotId}-${Date.now()}`), 'Request sent — the mentor will accept or decline'), [withSessionRefresh]);

  // After Razorpay reports success, the confirmation is authoritative from the SERVER
  // webhook (payment.captured → CONFIRMED). Poll the booking until it flips.
  const pollBookingConfirmed = useCallback(async (bookingId, tries = 8) => {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, 1800));
      try {
        const r = await liveApi.getBooking(bookingId);
        if (r?.booking?.status === 'CONFIRMED') { await loadSessions(); toast('Payment successful — session confirmed 🎉'); return true; }
        if (r?.booking?.status === 'EXPIRED') { await loadSessions(); toast('Payment failed — please try again.'); return false; }
      } catch { /* keep polling */ }
    }
    await loadSessions();
    toast('Payment received — confirming your session…');
    return false;
  }, [loadSessions, toast]);

  // Pay for a booking. When Razorpay LIVE keys are configured (in SSM) the booking carries
  // an orderId + public keyId, so we open Razorpay Checkout in the browser and let the
  // server-side webhook confirm it. When it isn't configured (test env), fall back to the
  // dev-pay webhook simulator so the flow stays demoable.
  const pay = useCallback(async (bookingId) => {
    try {
      const res = await liveApi.getBooking(bookingId);
      const pmt = res?.payment;
      if (pmt?.keyId && pmt?.orderId) {
        const ok = await loadRazorpayCheckout();
        if (!ok) { toast('Could not load the payment gateway — check your connection.'); return; }
        const prof = sRef.current.profile;
        const rzp = new window.Razorpay({
          key: pmt.keyId,
          order_id: pmt.orderId,
          amount: (pmt.amountINR || res?.booking?.priceINR || 0) * 100, // paise
          currency: 'INR',
          name: 'Student-Counselor',
          description: `Session with ${res?.booking?.mentorName || 'your mentor'}`,
          prefill: { name: prof.name || '', email: prof.email || '' },
          theme: { color: '#c67139' },
          handler: () => { toast('Payment received — confirming…'); pollBookingConfirmed(bookingId); },
          modal: { ondismiss: () => toast('Payment cancelled') },
        });
        rzp.on('payment.failed', () => toast('Payment failed — please try again.'));
        rzp.open();
      } else {
        await liveApi.simulatePayment(bookingId); // Razorpay not configured → dev-pay
        await loadSessions();
        toast('Payment confirmed');
      }
    } catch (e) { toast(e.message || 'Could not start payment'); }
  }, [toast, loadSessions, pollBookingConfirmed]);
  const join = useCallback((id) => withSessionRefresh(() => liveApi.joinSession(id)), [withSessionRefresh]);
  const end = useCallback((id) => withSessionRefresh(() => liveApi.endSession(id), 'Session ended'), [withSessionRefresh]);
  const rate = useCallback((id, n, comment) => withSessionRefresh(() => liveApi.rateSession(id, n, comment), 'Thanks for the rating'), [withSessionRefresh]);
  const cancel = useCallback((id) => withSessionRefresh(() => liveApi.cancelBooking(id), 'Booking cancelled'), [withSessionRefresh]);
  const acceptBooking = useCallback((id) => withSessionRefresh(() => liveApi.acceptBooking(id), 'Request accepted — the student can pay now'), [withSessionRefresh]);
  const declineBooking = useCallback((id) => withSessionRefresh(() => liveApi.declineBooking(id), 'Request declined'), [withSessionRefresh]);

  // ─── notifications ─────────────────────────────────────────────────────────
  const markNotifRead = useCallback(async (id) => {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
    try { await liveApi.markNotifRead(id); await loadNotifs(); } catch { /* keep optimistic */ }
  }, [loadNotifs]);
  const markAllRead = useCallback(async () => {
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })), unreadCount: 0 }));
    try { await liveApi.markAllNotifsRead(); await loadNotifs(); } catch { /* keep optimistic */ }
  }, [loadNotifs]);

  // ─── profile / role ────────────────────────────────────────────────────────
  const saveProfile = useCallback(async (name) => {
    try { const me = await liveApi.patchName(name); setState((s) => ({ ...s, profile: profileFromMe(me) })); toast('Profile saved'); }
    catch (e) { toast(e.message || 'Could not save profile'); }
  }, [toast]);

  const saveRankPrefs = useCallback(async (prefs) => {
    const payload = {
      advRank: Number(prefs.advRank), mainRank: Number(prefs.mainRank), category: prefs.category,
      home: prefs.home, gender: prefs.gender, pwd: !!prefs.pwd,
      branches: Array.isArray(prefs.branches) ? prefs.branches : String(prefs.branches || '').split(',').map((x) => x.trim()).filter(Boolean),
      priority: prefs.priority,
    };
    try { const me = await liveApi.patchRankPrefs(payload); setState((s) => ({ ...s, profile: profileFromMe(me) })); toast('Rank & preferences saved'); }
    catch (e) { toast(e.message || 'Could not save preferences'); }
  }, [toast]);

  const switchRole = useCallback(async (r) => {
    try { const me = await liveApi.switchRole(r); setState((s) => ({ ...s, role: me?.role || r, profile: profileFromMe(me) })); toast(`Switched to ${r}`); }
    catch (e) { toast(e.message || 'Could not switch role'); }
  }, [toast]);

  // ─── auth actions ──────────────────────────────────────────────────────────
  const doLogin = useCallback(async (email, password) => {
    const tok = await cognitoLogin(email, password); // throws on failure — callers show the error
    await hydrateAuth(tok);
    navigate('dashboard');
    return tok;
  }, [hydrateAuth, navigate]);

  // Returns { confirmed }. When the pool auto-confirms (cfg.autoConfirmSignups) we log the
  // user straight in; otherwise Cognito emailed a code and the caller must route to the OTP
  // screen. This adapts automatically when email verification is switched on server-side.
  const doSignup = useCallback(async (email, password, name) => {
    const { userConfirmed } = await cognitoSignUp(email, password, name);
    if (userConfirmed) { await doLogin(email, password); return { confirmed: true }; }
    return { confirmed: false };
  }, [doLogin]);

  const doConfirm = useCallback(async (email, code) => {
    await cognitoConfirm(email, code); // verifies the emailed code (tolerant of already-confirmed)
    return true;
  }, []);

  // Resend the sign-up verification code; start / complete a password reset.
  const doResend = useCallback((email) => cognitoResend(email), []);
  const doForgot = useCallback((email) => cognitoForgot(email), []);
  const doResetPassword = useCallback((email, code, password) => cognitoConfirmForgot(email, code, password), []);

  // Google sign-in: redirect to the Hosted UI only when it's enabled (the pool has the
  // Google IdP) — otherwise stay a graceful "coming soon" instead of a broken redirect.
  const loginWithGoogle = useCallback(() => {
    if (!GOOGLE_AUTH) { toast('Google sign-in is coming soon — use email for now.'); return; }
    googleRedirect();
  }, [toast]);

  const logout = useCallback(() => {
    cognitoLogout();
    setState((s) => ({
      ...INITIAL,
      authReady: true,
      // keep filters/local UI defaults; reset auth + data
    }));
    navigate('login');
    toast('Logged out');
  }, [navigate, toast]);

  // ─── college cache resolver (fetch + memoize) ──────────────────────────────
  const resolveCollege = useCallback(async (id) => {
    const key = String(id);
    const cached = sRef.current.collegesById[key];
    if (cached) return cached;
    if (inflightCollege.current[key]) return inflightCollege.current[key];
    const p = sRef.current.profile;
    const req = liveApi.college(id, predictParamsOf(p))
      .then((c) => { setState((s) => ({ ...s, collegesById: { ...s.collegesById, [key]: c } })); return c; })
      .catch(() => null)
      .finally(() => { delete inflightCollege.current[key]; });
    inflightCollege.current[key] = req;
    return req;
  }, []);

  // ─── deep college profile resolver (by canonical slug; fetch + memoize) ─────
  // Re-keyed by rank/category/home so the per-branch chance reflects the student.
  const resolveProfile = useCallback(async (slug) => {
    const p = sRef.current.profile;
    const key = `${slug}|${p.advRank}|${p.mainRank}|${p.category}|${p.home}|${p.gender || 'Male'}`;
    const cached = sRef.current.profilesById[key];
    if (cached) return cached;
    if (inflightProfile.current[key]) return inflightProfile.current[key];
    const req = liveApi.collegeProfile(slug, predictParamsOf(p))
      .then((c) => { setState((s) => ({ ...s, profilesById: { ...s.profilesById, [key]: c } })); return c; })
      .catch(() => null)
      .finally(() => { delete inflightProfile.current[key]; });
    inflightProfile.current[key] = req;
    return req;
  }, []);

  // ─── universal dispatcher — SAME { act, id, i, ... } shape screens use ──────
  const runAct = useCallback((d = {}) => {
    if (d.go) { navigate(d.go, { id: d.id }); return; }
    if (!d.act) return;
    const id = d.id != null ? +d.id : null;
    const i = d.i != null ? +d.i : null;
    switch (d.act) {
      // ── planner (now real) ──
      case 'addList': {
        const cur = sRef.current.choiceList;
        if (cur.includes(id)) { toast('Already in your list'); break; }
        putChoice([...cur, id], 'Added to choice list');
        break;
      }
      case 'shortlist': {
        const cur = sRef.current.shortlist;
        if (cur.includes(id)) { toast('Already shortlisted'); break; }
        putShort([...cur, id], 'Saved to shortlist');
        break;
      }
      case 'removeShort': putShort(sRef.current.shortlist.filter((x) => x !== id)); break;
      case 'removeChoice': putChoice(sRef.current.choiceList.filter((_, ix) => ix !== i), 'Removed'); break;
      case 'moveUp': reorderChoice(i, i - 1); break;
      case 'moveDown': reorderChoice(i, i + 1); break;
      // ── booking / sessions (new) ──
      case 'book': book(d.mentorId ?? id, d.slot ?? d.slotId); break;
      case 'pay': pay(d.bookingId ?? id); break;
      case 'join': join(d.bookingId ?? id); break;
      case 'end': end(d.bookingId ?? id); break;
      case 'rate': rate(d.bookingId ?? id, d.rating ?? 5, d.comment); break;
      case 'cancel': cancel(d.bookingId ?? id); break;
      case 'acceptBooking': acceptBooking(d.bookingId ?? id); break;
      case 'declineBooking': declineBooking(d.bookingId ?? id); break;
      // ── notifications (new) ──
      case 'markNotifRead': markNotifRead(d.id ?? id); break;
      case 'markAllRead': markAllRead(); break;
      // ── role / auth (new) ──
      case 'switchRole': switchRole(d.role); break;
      case 'logout': logout(); break;
      // ── navigation / local UI (unchanged) ──
      case 'viewDetail': setState((s) => ({ ...s, selected: id })); navigate('collegeDetail', { id }); break;
      case 'viewCollege': setState((s) => ({ ...s, selectedCollege: String(d.slug) })); navigate('collegeExplorer', { slug: d.slug }); break;
      case 'viewMentor': setState((s) => ({ ...s, mentorSel: id })); router.push(idToPath('mentorProfile')); break;
      case 'talkHere': navigate('marketplace'); toast('Showing seniors from this college'); break;
      case 'toCompare': update((s) => ({ compareIds: s.compareIds.includes(id) ? s.compareIds : [...s.compareIds.slice(-1), id] })); navigate('compare'); break;
      case 'toast': toast(d.msg || 'Done'); break;
      case 'confirm': update({ dialog: d.dialog || 'confirm' }); break;
      case 'closeDialog': update({ dialog: null }); break;
      case 'bookSlot': update({ bookingSlot: d.slot }); toast('Slot selected'); break;
      case 'onbNext': update((s) => ({ onbStep: Math.min(6, s.onbStep + 1) })); break;
      case 'onbBack': update((s) => ({ onbStep: Math.max(1, s.onbStep - 1) })); break;
      case 'sessTab': update({ sessionsTab: d.tab }); break;
      case 'toggleCam': update((s) => ({ camOn: !s.camOn })); break;
      case 'toggleMic': update((s) => ({ micOn: !s.micOn })); break;
      default: break;
    }
  }, [navigate, toast, update, router, putChoice, putShort, reorderChoice, book, pay, join, end, rate, cancel, acceptBooking, declineBooking, markNotifRead, markAllRead, switchRole, logout]);

  // ─── field handlers (unchanged) ────────────────────────────────────────────
  const setProfile = (patch) => update((s) => ({ profile: { ...s.profile, ...patch } }));
  const setFilters = (patch) => update((s) => ({ filters: { ...s.filters, ...patch } }));
  const toggleType = (t) => update((s) => {
    const has = s.filters.types.includes(t);
    return { filters: { ...s.filters, types: has ? s.filters.types.filter((x) => x !== t) : [...s.filters.types, t] } };
  });
  const sendChat = () => update((s) => {
    const t = s.chatDraft.trim();
    if (!t) return {};
    return { chat: [...s.chat, { who: 'me', t }], chatDraft: '' };
  });

  // Drag & drop for the choice list — reorder locally, persist on drop.
  const onDragStart = (i) => update({ dragIndex: i });
  const onDragOver = (to) => update((s) => {
    const from = s.dragIndex;
    if (from == null || from === to) return {};
    const a = [...s.choiceList];
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    return { choiceList: a, dragIndex: to };
  });
  const onDragEnd = () => {
    const s = sRef.current;
    if (s.dragIndex != null) putChoice(s.choiceList); // persist the reordered list
    update({ dragIndex: null });
  };

  const value = {
    ...state,
    screen,
    ctx,
    predictParams: predictParamsOf(state.profile),
    // Derived auth/onboarding flags read by the auth screens + Chrome nav.
    isMentor: state.mentorStatus === 'APPROVED',
    isSuperadmin: state.role === 'superadmin',
    // Admin permission check: superadmin can do anything; an admin needs the specific scope.
    can: (scope) => state.role === 'superadmin' || (state.profile.permissions || []).includes(scope),
    onboarded:
      state.profile.advRank > 0 || state.profile.mainRank > 0 ||
      (!!state.mentorStatus && state.mentorStatus !== 'none') ||
      state.role === 'admin' || state.role === 'superadmin',
    loadMentorStatus,
    // navigation + dispatch
    navigate,
    runAct,
    showToast: toast, // state.toast (the message string) stays as `toast`; expose the setter separately
    update,
    // field handlers
    setProfile,
    setFilters,
    toggleType,
    sendChat,
    onDragStart,
    onDragOver,
    onDragEnd,
    // data loaders (for screens that want to refresh)
    loadShortlist,
    loadChoice,
    loadSessions,
    loadNotifs,
    resolveCollege,
    resolveProfile,
    // named actions (also reachable via runAct)
    book, pay, join, end, rate, cancel, acceptBooking, declineBooking,
    markNotifRead, markAllRead,
    saveProfile, saveRankPrefs, switchRole, logout,
    doLogin, doSignup, doConfirm, doResend, doForgot, doResetPassword, loginWithGoogle,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
