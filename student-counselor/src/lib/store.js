'use client';
// ══════════════════════════════════════════════════════════════════════════
// App state — a single React context mirroring the prototype's component state
// and its universal `act` dispatcher. Persists across route navigation because
// the provider lives in the root layout. No backend; all state is in-memory.
// ══════════════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { idToPath, slugToId, ctxOf } from './routes';

const AppCtx = createContext(null);

const INITIAL = {
  profile: { advRank: 850, mainRank: 4200, category: 'Open', home: 'Maharashtra', gender: 'Male', pwd: false, branches: ['Computer Science', 'Electronics'], priority: 'branch' },
  filters: { types: ['IIT', 'NIT', 'IIIT', 'GFTI'], branch: 'all', state: 'all', q: '', sort: 'chance', grouped: true },
  shortlist: [3, 7],
  choiceList: [1, 6, 9, 12, 15],
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

export function AppProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState(INITIAL);
  const toastTimer = useRef(null);

  const screen = slugToId(pathname === '/' ? '' : pathname.replace(/^\//, ''));

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

  // Session timer: tick while on a live call screen.
  useEffect(() => {
    const t = setInterval(() => {
      if ((screen === 'sessionRoom' || screen === 'mSession') && state.sessState === 'in') {
        setState((s) => ({ ...s, sessTime: s.sessTime + 1 }));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [screen, state.sessState]);

  useEffect(() => () => { clearTimeout(toastTimer.current); }, []);

  // Universal click dispatcher — mirrors the prototype's `act`.
  const runAct = useCallback((d = {}) => {
    if (d.go) { navigate(d.go, { id: d.id }); return; }
    if (!d.act) return;
    const id = d.id != null ? +d.id : null;
    const i = d.i != null ? +d.i : null;
    switch (d.act) {
      case 'addList':
        setState((s) => {
          if (!s.choiceList.includes(id)) { toast('Added to choice list'); return { ...s, choiceList: [...s.choiceList, id] }; }
          toast('Already in your list'); return s;
        });
        break;
      case 'shortlist':
        setState((s) => {
          if (!s.shortlist.includes(id)) { toast('Saved to shortlist'); return { ...s, shortlist: [...s.shortlist, id] }; }
          toast('Already shortlisted'); return s;
        });
        break;
      case 'removeShort': update((s) => ({ shortlist: s.shortlist.filter((x) => x !== id) })); break;
      case 'removeChoice': update((s) => ({ choiceList: s.choiceList.filter((_, ix) => ix !== i) })); toast('Removed'); break;
      case 'moveUp': update((s) => { const a = [...s.choiceList]; if (i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; } return { choiceList: a }; }); break;
      case 'moveDown': update((s) => { const a = [...s.choiceList]; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; } return { choiceList: a }; }); break;
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
  }, [navigate, toast, update, router]);

  // Field handlers.
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

  // Drag & drop for the choice list.
  const onDragStart = (i) => update({ dragIndex: i });
  const onDragOver = (to) => update((s) => {
    const from = s.dragIndex;
    if (from == null || from === to) return {};
    const a = [...s.choiceList];
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    return { choiceList: a, dragIndex: to };
  });
  const onDragEnd = () => update({ dragIndex: null });

  const value = {
    ...state,
    screen,
    ctx: ctxOf(screen),
    navigate,
    runAct,
    showToast: toast, // state.toast (the message string) stays as `toast`; expose the setter separately
    update,
    setProfile,
    setFilters,
    toggleType,
    sendChat,
    onDragStart,
    onDragOver,
    onDragEnd,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
