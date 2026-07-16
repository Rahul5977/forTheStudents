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
import { getToken, captureCognitoRedirect } from './liveAuth';
import { login as cognitoLogin, signUp as cognitoSignUp, confirm as cognitoConfirm, logout as cognitoLogout } from './auth';

const AppCtx = createContext(null);

// Default profile shape kept so public screens (and pre-hydration renders) never
// crash reading profile.advRank etc. Overwritten by the DB profile after login.
const DEFAULT_PROFILE = { advRank: 850, mainRank: 4200, category: 'Open', home: 'Maharashtra', gender: 'Male', pwd: false, branches: ['Computer Science', 'Electronics'], priority: 'branch' };

const INITIAL = {
  // ── auth ──────────────────────────────────────────────────────────────
  token: null,
  loggedIn: false,
  role: 'student',
  authReady: false,
  // ── profile / predictor inputs (flattened rankPrefs live here) ─────────
  profile: DEFAULT_PROFILE,
  filters: { types: ['IIT', 'NIT', 'IIIT', 'GFTI'], branch: 'all', state: 'all', q: '', sort: 'best', grouped: true },
  // ── planner: ids the screens read + the decorated/versioned server data ─
  shortlist: [3, 7],
  shortlistVersion: null,
  choiceList: [1, 6, 9, 12, 15],
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
  mentorsById: {},
  // ── local UI state (unchanged from the prototype) ──────────────────────
  scenario: 'balanced',
  selected: 1,
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

  const predictParamsOf = (p) => ({ advRank: p.advRank, mainRank: p.mainRank, category: p.category, home: p.home });

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

  // Hydrate everything a signed-in user needs.
  const hydrateData = useCallback(() => {
    loadShortlist(); loadChoice(); loadSessions(); loadNotifs();
  }, [loadShortlist, loadChoice, loadSessions, loadNotifs]);

  // Bootstrap the account row + read the profile back.
  const hydrateAuth = useCallback(async (tok) => {
    try {
      await liveApi.bootstrap();
      const me = await liveApi.getMe();
      setState((s) => ({ ...s, token: tok, loggedIn: true, role: me?.role || 'student', profile: profileFromMe(me), authReady: true }));
      return me;
    } catch {
      // Token present but invalid/expired — treat as logged out.
      setState((s) => ({ ...s, token: null, loggedIn: false, authReady: true }));
      return null;
    }
  }, []);

  // ── On mount: capture a Hosted-UI redirect, then hydrate if a token exists. ──
  useEffect(() => {
    captureCognitoRedirect();
    const t = getToken();
    if (t) { hydrateAuth(t); }
    else { setState((s) => ({ ...s, authReady: true })); }
  }, [hydrateAuth]);

  // ── Load per-user data once authenticated. ──
  useEffect(() => {
    if (state.loggedIn && state.token) hydrateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loggedIn, state.token]);

  // ── AUTH GATE: redirect unauthenticated users away from gated screens. ──
  useEffect(() => {
    if (!state.authReady) return;
    // A signed-in user hitting the marketing root goes straight to their app.
    if (state.token && screen === 'landing') { navigate(state.role === 'mentor' ? 'mDashboard' : state.role === 'admin' ? 'aDashboard' : 'dashboard'); return; }
    if (!GATED.has(ctx)) return;
    if (!state.token) { navigate('login'); return; }
    if (ctx === 'admin' && state.role !== 'admin') { navigate('dashboard'); }
  }, [ctx, screen, state.authReady, state.token, state.role, navigate]);

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

  const book = useCallback((mentorId, slotId) =>
    withSessionRefresh(() => liveApi.createBooking(mentorId, slotId || 's1', `ui-${mentorId}-${Date.now()}`), 'Booking created'), [withSessionRefresh]);
  const pay = useCallback((bookingId) => withSessionRefresh(() => liveApi.simulatePayment(bookingId), 'Payment confirmed'), [withSessionRefresh]);
  const join = useCallback((id) => withSessionRefresh(() => liveApi.joinSession(id)), [withSessionRefresh]);
  const end = useCallback((id) => withSessionRefresh(() => liveApi.endSession(id), 'Session ended'), [withSessionRefresh]);
  const rate = useCallback((id, n, comment) => withSessionRefresh(() => liveApi.rateSession(id, n, comment), 'Thanks for the rating'), [withSessionRefresh]);
  const cancel = useCallback((id) => withSessionRefresh(() => liveApi.cancelBooking(id), 'Booking cancelled'), [withSessionRefresh]);

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

  const doSignup = useCallback(async (email, password, name) => {
    await cognitoSignUp(email, password, name);
    // Dev pool auto-confirms → logging straight in works.
    return doLogin(email, password);
  }, [doLogin]);

  const doConfirm = useCallback(async (email, code) => {
    await cognitoConfirm(email, code); // tolerant of already-confirmed
    return true;
  }, []);

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
      // ── notifications (new) ──
      case 'markNotifRead': markNotifRead(d.id ?? id); break;
      case 'markAllRead': markAllRead(); break;
      // ── role / auth (new) ──
      case 'switchRole': switchRole(d.role); break;
      case 'logout': logout(); break;
      // ── navigation / local UI (unchanged) ──
      case 'viewDetail': setState((s) => ({ ...s, selected: id })); navigate('collegeDetail', { id }); break;
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
  }, [navigate, toast, update, router, putChoice, putShort, reorderChoice, book, pay, join, end, rate, cancel, markNotifRead, markAllRead, switchRole, logout]);

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
    // named actions (also reachable via runAct)
    book, pay, join, end, rate, cancel,
    markNotifRead, markAllRead,
    saveProfile, saveRankPrefs, switchRole, logout,
    doLogin, doSignup, doConfirm,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
