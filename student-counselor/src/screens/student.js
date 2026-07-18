'use client';
// ══════════════════════════════════════════════════════════════════════════
// Student app — the core experience (23 screens) — WIRED to the live backend.
//   • profile               → greeting, ranks, category, branches, priority
//   • liveApi.predict()     → real Safe/Target/Reach predictor results
//   • resolveCollege(id)    → real college analysis + cutoff chart + chance
//   • shortlist / choiceItems / choiceWarnings / choiceSummary → the planner
//   • liveApi.mentors()     → marketplace of approved mentors
//   • book/pay/join/end/rate/cancel → the booking↔payment↔session saga
//   • notifications + unreadCount → the in-app feed
// Visual design (organic cream/terracotta/sage, ui.js primitives) is preserved —
// only data sources + action handlers changed. Owner TODOs mark missing surfaces.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { Btn, Tile, Tag, ChanceChip, TypeBadge, Avatar, Field, Input, Select, SegOpt } from '@/components/ui';
import { chipStyle } from '@/lib/logic';
import { ROUNDS, FAQS, SETTING_GROUPS, SLOT_LIST, STATES, GENDERS } from '@/lib/data';
import { liveApi } from '@/lib/liveApi';

const REACH_BG = '#f7e2db';
const REACH_FG = '#7a2d1a';
const MENTOR_COLORS = ['#c67139', '#7a8a5e', '#b2622d', '#728157', '#8c491a', '#56633f'];
const BRANCH_OPTIONS = ['Computer Science', 'Electronics', 'Electrical', 'Mechanical'];
// <option> lists reused across the profile + predictor + filter dropdowns.
const stateOptions = STATES.map((s) => <option key={s}>{s}</option>);
const genderOptions = GENDERS.map((g) => <option key={g}>{g}</option>);

// ── small display helpers ────────────────────────────────────────────────────
function fmtTime(t) {
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
const bucketLabel = (b) => (b === 'safe' ? 'Safe' : b === 'target' ? 'Target' : 'Reach');
const initialsOf = (name = '') =>
  name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'M';
const colorFor = (str = '') => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return MENTOR_COLORS[h % MENTOR_COLORS.length];
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—');
const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Time TBD';
const feesTxtOf = (col) => (col?.feesTxt ? col.feesTxt : col?.feesLakh != null ? `₹${col.feesLakh}L total` : '—');
const quotaTxt = (q) => (q === 'AI' ? 'All-India' : q || 'All-India');
// Parse the ₹ lakh figure out of a result's feesTxt (e.g. "₹8.6L" → 8.6); Infinity if unknown.
const feesLakhOf = (c) => { const n = parseFloat(String(c.feesTxt || '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : Infinity; };

// Session-status → Safe/Target/Reach chip colours.
function statusStyle(status) {
  if (status === 'CONFIRMED' || status === 'LIVE') return { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
  if (status === 'PENDING_PAYMENT') return { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' };
  return { background: REACH_BG, color: REACH_FG };
}

// Build CutoffChart geometry from the backend chart payload
// { years, vals, rank, forecast?: { year, predicted, low, high } }.
// The observed closing ranks are drawn solid; the 2026 forecast is a dashed
// segment to a hollow dot, with a shaded low–high uncertainty band.
function chartGeomFromLive(chart) {
  const years = (chart?.years || []).map(String);
  const vals = chart?.vals || [];
  const rank = chart?.rank || 0;
  const fc = chart?.forecast || null;
  const W = 520, H = 210, pad = 34;
  // x-axis columns = observed years + (optionally) the forecast year.
  const cols = fc ? [...years, String(fc.year)] : years;
  const max = Math.max(...vals, rank, fc ? fc.high : 0, 1) * 1.12;
  const n = Math.max(1, cols.length - 1);
  const x = (i) => pad + i * ((W - pad * 2) / n);
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const points = vals.map((v, i) => x(i) + ',' + y(v)).join(' ');
  const fcIdx = cols.length - 1;
  const forecast = fc
    ? {
        x: x(fcIdx), y: y(fc.predicted), predicted: fc.predicted,
        bandTop: y(fc.high), bandBot: y(fc.low), low: fc.low, high: fc.high,
        // dashed link from the last observed point to the forecast point
        linkFrom: vals.length ? { x: x(vals.length - 1), y: y(vals[vals.length - 1]) } : null,
      }
    : null;
  return {
    W, H, pad, years, vals, points, forecast,
    dots: vals.map((v, i) => ({ cx: x(i), cy: y(v), v, tx: x(i), ty: y(v) - 11 })),
    yearLabels: cols.map((yr, i) => ({ x: x(i), y: H - pad + 16, yr })),
    rankY: y(rank), rank,
  };
}

// Confidence → chip colours (how much history the forecast leans on).
const CONF = {
  high: { bg: 'var(--color-accent-2-100)', fg: 'var(--color-accent-2-800)', txt: 'High confidence' },
  medium: { bg: 'var(--color-accent-100)', fg: 'var(--color-accent-800)', txt: 'Medium confidence' },
  low: { bg: REACH_BG, fg: REACH_FG, txt: 'Limited history' },
};
function ConfBadge({ level }) {
  const c = CONF[level] || CONF.medium;
  return <span className="tag" style={{ background: c.bg, color: c.fg, fontSize: 11 }}>{c.txt}</span>;
}

// One-line 2026 forecast band shown on a predictor result / branch row.
function ForecastLine({ f, basis }) {
  if (!f) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)', borderRadius: 10, padding: '7px 11px' }}>
      <span style={{ fontSize: 15 }}>📈</span>
      <span className="text-muted">{f.targetYear} projected close</span>
      <strong style={{ color: 'var(--color-accent-800)' }}>~{f.predicted}</strong>
      <span className="text-muted">({f.low.toLocaleString()}–{f.high.toLocaleString()})</span>
      <ConfBadge level={f.confidence} />
      {basis === 'forecast' && <span className="text-muted" style={{ fontSize: 11 }}>· chance uses this trend</span>}
    </div>
  );
}

// Resolve the mentor the student is viewing/booking. Reads the store cache first
// (populated by the marketplace), otherwise fetches the public mentor list.
function useSelectedMentor() {
  const { mentorSel, mentorsById, update } = useApp();
  const cached = mentorsById[mentorSel];
  const [mentor, setMentor] = useState(cached || null);
  const [loading, setLoading] = useState(!cached);
  useEffect(() => {
    if (cached) { setMentor(cached); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    liveApi.mentors()
      .then((r) => {
        if (cancelled) return;
        const list = r?.mentors || [];
        const found = list.find((m) => String(m.userId) === String(mentorSel)) || list[0] || null;
        setMentor(found);
        if (found) update((s) => ({ mentorsById: { ...s.mentorsById, [found.userId]: found } }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorSel, cached]);
  return [mentor, loading];
}

// ── Dashboard / Home ───────────────────────────────────────────────────────
export function Dashboard() {
  const { navigate, profile, choiceItems, choiceSummary, sessions, unreadCount } = useApp();
  const summary = choiceSummary || { safe: 0, target: 0, reach: 0, total: choiceItems.length };
  const preview = choiceItems.slice(0, 3);
  const upcoming = sessions.find((s) => s.status === 'CONFIRMED' || s.status === 'LIVE');
  const firstName = (profile?.name || 'there').split(' ')[0];
  return (
    <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 32 }}>Hi {firstName} 👋</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 18 }}>JoSAA choice-filling is on — let&apos;s keep your list sharp.{unreadCount > 0 && <> You have <strong style={{ color: 'var(--color-accent-700)' }}>{unreadCount} new</strong> notification{unreadCount > 1 ? 's' : ''}.</>}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
        <Tile go="predictor" className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div className="card-kicker">Your list at a glance</div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, color: 'var(--color-accent-2-800)' }}>{summary.safe}</div><div style={{ fontSize: 11 }}>Safe</div></div>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, color: 'var(--color-accent-800)' }}>{summary.target}</div><div style={{ fontSize: 11 }}>Target</div></div>
            <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, color: REACH_FG }}>{summary.reach}</div><div style={{ fontSize: 11 }}>Reach</div></div>
          </div>
          <span className="sc-btn ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>Open predictor →</span>
        </Tile>
        <Tile go="choiceBuilder" className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div className="card-kicker">My choice list · {choiceItems.length} choices</div>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            {preview.length > 0 ? preview.map((c, i) => (
              <div key={c.id}>{i + 1}. {c.college} — {c.branch}</div>
            )) : <div className="text-muted">Your list is empty — add colleges from the predictor.</div>}
          </div>
          <span className="sc-btn ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>Open builder →</span>
        </Tile>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}>
          <div className="card-kicker">Upcoming session</div>
          {upcoming ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar initials={initialsOf(upcoming.mentorName)} size={40} />
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>{upcoming.mentorName || 'Your mentor'}</div><div className="text-muted" style={{ fontSize: 12 }}>{fmtWhen(upcoming.startsAt)} · {upcoming.durationMin || 25} min</div></div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}><Btn variant="pri" go="sessionRoom">Join</Btn><Btn variant="sec" go="sessions">Manage</Btn></div>
            </>
          ) : (
            <>
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No upcoming sessions. Book a 1:1 with a verified senior for honest advice.</p>
              <Btn variant="pri" go="marketplace" style={{ alignSelf: 'flex-start' }}>Find a senior →</Btn>
            </>
          )}
        </div>
      </div>

      <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Smart nudges</div><Tag tone="accent-2">Personalised</Tag></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: REACH_BG, borderRadius: 12, padding: '11px 13px' }}><span>⚠</span><div style={{ fontSize: 13 }}><strong>Add more Safe colleges.</strong> You have {summary.safe} in your list — aim for 3–4 so you&apos;re never unallotted. <span className="sc-tile" onClick={() => navigate('predictor')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Find some →</span></div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--color-accent-2-100)', borderRadius: 12, padding: '11px 13px' }}><span>📢</span><div style={{ fontSize: 13 }}><strong>Keep your list ordered.</strong> Row order is your JoSAA priority — review it before you lock. <span className="sc-tile" onClick={() => navigate('choiceBuilder')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Open builder →</span></div></div>
          </div>
        </div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Counselling timeline</div>
          <div style={{ fontSize: 13 }}><div style={{ color: 'var(--color-accent-700)', fontWeight: 700 }}>Round 2 · closes Jul 16</div><div className="text-muted">Choice filling open now</div></div>
          <div style={{ fontSize: 13, marginTop: 6 }}><div>Round 3 · Jul 22</div><div className="text-muted">Seat allotment</div></div>
          <Btn variant="sec" go="timeline" block>View all rounds</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <Btn variant="sec" go="predictor">🎯 Predictor</Btn>
        <Btn variant="sec" go="choiceBuilder">📋 Choice list</Btn>
        <Btn variant="sec" go="marketplace">💬 Talk to a senior</Btn>
        <Btn variant="sec" go="filters">🔍 College search</Btn>
      </div>
    </section>
  );
}

// ── Profile — Rank & Preferences ─────────────────────────────────────────────
export function Profile() {
  const { profile, setProfile, saveRankPrefs, navigate } = useApp();
  const [busy, setBusy] = useState(false);
  const branches = profile.branches || [];
  const toggleBranch = (b) => setProfile({ branches: branches.includes(b) ? branches.filter((x) => x !== b) : [...branches, b] });
  const save = async () => { setBusy(true); try { await saveRankPrefs(profile); navigate('predictor'); } finally { setBusy(false); } };
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Rank &amp; preferences</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 16 }}>These power your predictions — change them and your colleges update instantly.</p>
      <div className="card" style={{ background: 'var(--color-surface)' }}>
        <div className="card-kicker">Your ranks</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="JEE Advanced rank" style={{ flex: 1, minWidth: 160 }}><Input value={profile.advRank} onChange={(e) => setProfile({ advRank: +e.target.value || 0 })} /></Field>
          <Field label="JEE Main rank" style={{ flex: 1, minWidth: 160 }}><Input value={profile.mainRank} onChange={(e) => setProfile({ mainRank: +e.target.value || 0 })} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Category" style={{ flex: 1, minWidth: 160 }}><Select value={profile.category} onChange={(e) => setProfile({ category: e.target.value })}><option>Open</option><option>OBC-NCL</option><option>SC</option><option>ST</option><option>EWS</option></Select></Field>
          <Field label="Home state" style={{ flex: 1, minWidth: 160 }}><Select value={profile.home} onChange={(e) => setProfile({ home: e.target.value })}>{stateOptions}</Select></Field>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Gender" style={{ flex: 1, minWidth: 160 }}><Select value={profile.gender || 'Male'} onChange={(e) => setProfile({ gender: e.target.value })}>{genderOptions}</Select></Field>
          <div style={{ flex: 1, minWidth: 160, alignSelf: 'flex-end', fontSize: 12, color: 'var(--color-accent-2-800)', background: 'var(--color-accent-2-100)', borderRadius: 12, padding: '9px 11px' }}>👩 Female candidates also see JoSAA <strong>Female-only</strong> (supernumerary) seats, which usually carry an easier cutoff.</div>
        </div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div className="card-kicker">Preferences</div>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Interested branches</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BRANCH_OPTIONS.map((b) => (
            <span key={b} className={branches.includes(b) ? 'tag tag-accent' : 'tag tag-neutral'} onClick={() => toggleBranch(b)} style={{ cursor: 'pointer' }}>{b}{branches.includes(b) ? ' ✓' : ''}</span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginTop: 8 }}>Priority</div>
        <div className="seg"><SegOpt on={profile.priority !== 'college'} onClick={() => setProfile({ priority: 'branch' })}>Branch first</SegOpt><SegOpt on={profile.priority === 'college'} onClick={() => setProfile({ priority: 'college' })}>College first</SegOpt></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><Btn variant="pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save & see updated colleges'}</Btn><Btn variant="sec" go="dashboard">Cancel</Btn></div>
    </section>
  );
}

// A collapsible legend explaining the Safe / Target / Reach buckets + the % basis.
function BucketExplainer() {
  const rows = [
    { c: '#728157', bg: 'var(--color-accent-2-100)', fg: 'var(--color-accent-2-800)', t: 'Safe', p: '≥ 80% chance', d: 'Last year’s closing rank is comfortably better than yours — a dependable backup you can count on.' },
    { c: '#d67f48', bg: 'var(--color-accent-100)', fg: 'var(--color-accent-800)', t: 'Target', p: '40–80% chance', d: 'You’re right around the closing rank — a realistic, fair shot worth ranking high on your list.' },
    { c: '#a8442e', bg: REACH_BG, fg: REACH_FG, t: 'Reach', p: '< 40% chance', d: 'A stretch — your rank is worse than the recent closing rank, so it hinges on this year’s movement.' },
  ];
  return (
    <details className="card" style={{ background: 'var(--color-surface)', marginBottom: 16, padding: '12px 16px' }}>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-heading)', fontSize: 15 }}>What do Safe / Target / Reach mean?</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, marginTop: 12 }}>
        {rows.map((r) => (
          <div key={r.t} style={{ background: r.bg, borderRadius: 12, padding: '11px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.c }} />
              <strong style={{ color: r.fg }}>{r.t}</strong>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: r.fg }}>{r.p}</span>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 5 }}>{r.d}</div>
          </div>
        ))}
      </div>
      <p className="text-muted" style={{ fontSize: 12, marginTop: 11, marginBottom: 2 }}>
        The <strong>%</strong> is a calibrated admission chance from our 2026 forecast — a normal-curve model fitted to each seat’s multi-year JoSAA cutoff trend. Where a seat has too little history we fall back to a rank-vs-closing estimate. It’s guidance, not a guarantee — always verify on <span style={{ color: 'var(--color-accent-700)' }}>josaa.nic.in</span>.
      </p>
    </details>
  );
}

// ── College Predictor — Results [CORE] ───────────────────────────────────────
export function Predictor() {
  const { profile, filters, setFilters, setProfile, toggleType, runAct } = useApp();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  // Fetch REAL predictor results from the catalog service whenever inputs change.
  useEffect(() => {
    let cancelled = false;
    setBusy(true); setErr(false);
    liveApi.predictCached({
      // Send empty (unranked) rather than "0" when a rank is absent — the API rejects 0,
      // and an unranked Advanced rank correctly hides IITs (predicted from the Main rank).
      advRank: profile.advRank > 0 ? String(profile.advRank) : '',
      mainRank: profile.mainRank > 0 ? String(profile.mainRank) : '',
      category: profile.category, home: profile.home,
      gender: filters.gender, // seat pool — Gender-Neutral vs Female-only (including Supernumerary)
      types: filters.types.join(','), q: filters.q || '',
      sort: filters.sort === 'ranking' ? 'closing' : filters.sort, // API sorts by closing (no NIRF)
    })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setErr(true); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [profile.advRank, profile.mainRank, profile.category, profile.home, filters.gender, filters.types, filters.q, filters.sort]);

  // Client-side branch/state narrowing (the predict API buckets on rank + type).
  let res = data?.results || [];
  if (filters.branch !== 'all') res = res.filter((c) => c.branch === filters.branch);
  if (filters.state !== 'all') res = res.filter((c) => c.state === filters.state);
  if (filters.quota !== 'all') res = res.filter((c) => c.quota === filters.quota);
  if (filters.nirfMax > 0) res = res.filter((c) => c.nirf != null && c.nirf <= filters.nirfMax);
  if (filters.homeOnly) res = res.filter((c) => c.homeQuota === true);
  if (filters.maxFees > 0) res = res.filter((c) => feesLakhOf(c) <= filters.maxFees);
  // Stage breakdown is counted over the full filtered set (BEFORE the bucket filter) so the
  // Safe/Target/Reach tiles always show the true distribution — not 0s for the stages you
  // filtered out. The bucket filter then narrows only the visible list below.
  const safe = res.filter((c) => c.bucket === 'safe').length;
  const target = res.filter((c) => c.bucket === 'target').length;
  const reach = res.filter((c) => c.bucket === 'reach').length;
  if (filters.bucket !== 'all') res = res.filter((c) => c.bucket === filters.bucket);
  const count = res.length;
  const TYPES = ['IIT', 'NIT', 'IIIT', 'GFTI'];
  return (
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 22px 40px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>Core screen</div>
          <h1 style={{ margin: 0, fontSize: 34 }}>Your colleges</h1>
        </div>
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 16, background: 'var(--color-surface)', padding: '10px 18px' }}>
          <div><div className="text-muted" style={{ fontSize: 11 }}>JEE Adv rank</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{profile.advRank}</div></div>
          <div style={{ width: 1, height: 30, background: 'var(--color-divider)' }} />
          <div><div className="text-muted" style={{ fontSize: 11 }}>JEE Main rank</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{profile.mainRank}</div></div>
          <div style={{ width: 1, height: 30, background: 'var(--color-divider)' }} />
          <div><div className="text-muted" style={{ fontSize: 11 }}>Category</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{profile.category}</div></div>
          <Btn variant="ghost" go="profile">Edit rank</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 150, background: 'var(--color-accent-2-100)', borderRadius: 16, padding: '14px 18px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, color: 'var(--color-accent-2-800)' }}>{safe}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#728157' }} />Safe — very likely</div></div>
        <div style={{ flex: 1, minWidth: 150, background: 'var(--color-accent-100)', borderRadius: 16, padding: '14px 18px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, color: 'var(--color-accent-800)' }}>{target}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d67f48' }} />Target — realistic</div></div>
        <div style={{ flex: 1, minWidth: 150, background: REACH_BG, borderRadius: 16, padding: '14px 18px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, color: REACH_FG }}>{reach}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#a8442e' }} />Reach — ambitious</div></div>
      </div>

      <BucketExplainer />

      {data?.iitExcludedNoAdvRank && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', borderRadius: 14, padding: '11px 15px', marginBottom: 16, fontSize: 13 }}>
          <span style={{ fontSize: 18 }}>🎓</span>
          <span style={{ flex: 1, minWidth: 220 }}><strong>IITs are hidden</strong> — they admit only through the JEE&nbsp;Advanced rank, and you haven&apos;t entered one. The NITs, IIITs &amp; GFTIs below are predicted from your JEE&nbsp;Main rank.</span>
          <Btn variant="sec" go="profile">Add Advanced rank</Btn>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <aside className="predictor-aside" style={{ flex: 'none', width: 250, position: 'sticky', top: 76 }}>
          <div className="card" style={{ background: 'var(--color-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Filters</div><Btn variant="ghost" go="filters" style={{ fontSize: 12 }}>All →</Btn></div>
            <Field label="Search college or branch"><Input placeholder="e.g. IIT Bombay" value={filters.q} onChange={(e) => setFilters({ q: e.target.value })} /></Field>
            <Field label="Category"><Select value={profile.category} onChange={(e) => setProfile({ category: e.target.value })}><option>Open</option><option>OBC-NCL</option><option>SC</option><option>ST</option><option>EWS</option></Select></Field>
            <div>
              <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginBottom: 6 }}>Seat pool</div>
              <div className="seg">
                <SegOpt on={filters.gender === 'Gender-Neutral'} onClick={() => setFilters({ gender: 'Gender-Neutral' })}>All students</SegOpt>
                <SegOpt on={filters.gender === 'Female-only (including Supernumerary)'} onClick={() => setFilters({ gender: 'Female-only (including Supernumerary)' })}>Female</SegOpt>
              </div>
              {filters.gender !== 'Gender-Neutral' && <div style={{ fontSize: 11, color: 'var(--color-accent-2-800)', marginTop: 5 }}>Shows Gender-Neutral + Female-only (supernumerary) seats — whichever gives the better chance.</div>}
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginBottom: 6 }}>Result stage</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[['all', 'All'], ['safe', 'Safe'], ['target', 'Target'], ['reach', 'Reach']].map(([val, lbl]) => (
                  <span key={val} className="tag" onClick={() => setFilters({ bucket: val })} style={{ cursor: 'pointer', ...(filters.bucket === val ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }) }}>{lbl}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginBottom: 6 }}>College type</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TYPES.map((t) => (
                  <span key={t} className="tag" onClick={() => toggleType(t)} style={{ cursor: 'pointer', ...(filters.types.includes(t) ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }) }}>{t}</span>
                ))}
              </div>
            </div>
            <Field label="Branch"><Select value={filters.branch} onChange={(e) => setFilters({ branch: e.target.value })}><option value="all">All branches</option><option>Computer Science</option><option>Electronics</option><option>Electrical</option><option>Mechanical</option></Select></Field>
            <Field label="State"><Select value={filters.state} onChange={(e) => setFilters({ state: e.target.value })}><option value="all">All states</option>{stateOptions}</Select></Field>
            <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-accent-700)', borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>More filters</div>
            <Field label="Quota"><Select value={filters.quota} onChange={(e) => setFilters({ quota: e.target.value })}><option value="all">All quotas</option><option value="AI">All-India (AI)</option><option value="HS">Home state (HS)</option><option value="OS">Other state (OS)</option></Select></Field>
            <Field label="NIRF ranking"><Select value={filters.nirfMax} onChange={(e) => setFilters({ nirfMax: +e.target.value })}><option value={0}>Any</option><option value={25}>Top 25</option><option value={50}>Top 50</option><option value={100}>Top 100</option></Select></Field>
            <Field label="Max fees"><Select value={filters.maxFees} onChange={(e) => setFilters({ maxFees: +e.target.value })}><option value={0}>Any</option><option value={2}>≤ ₹2L</option><option value={5}>≤ ₹5L</option><option value={8}>≤ ₹8L</option></Select></Field>
            <div>
              <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginBottom: 6 }}>Home-state seats</div>
              <div className="seg">
                <SegOpt on={!filters.homeOnly} onClick={() => setFilters({ homeOnly: false })}>All seats</SegOpt>
                <SegOpt on={filters.homeOnly} onClick={() => setFilters({ homeOnly: true })}>Home-state only</SegOpt>
              </div>
            </div>
            <div style={{ fontSize: 12, background: 'var(--color-accent-2-100)', borderRadius: 12, padding: '9px 11px', color: 'var(--color-accent-2-800)' }}>🏠 Home-state quota applied for <strong>{profile.home}</strong> NITs &amp; GFTIs.</div>
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14 }}>
              <strong>{count}</strong> <span className="text-muted">options match your rank &amp; filters</span>
              {data?.version && <span className="tag tag-accent-2" style={{ marginLeft: 8, padding: '1px 8px' }}>● Live · official JoSAA {String(data.version).replace('josaa-', '')}</span>}
              {busy && <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>updating…</span>}
            </div>
            <div className="field" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><label style={{ margin: 0 }}>Sort</label><Select style={{ width: 'auto' }} value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value })}><option value="best">Recommended (best first)</option><option value="chance">By chance</option><option value="ranking">By NIRF ranking</option><option value="closing">By closing rank</option><option value="location">By location</option></Select></div>
          </div>

          {err && !data ? (
            <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '44px 20px', background: '#f7e2db', color: REACH_FG }}>
              <div style={{ fontSize: 40 }}>⚠</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>Couldn&apos;t reach the predictor</div>
              <p style={{ fontSize: 14, maxWidth: 340 }}>Check your connection and try again in a moment.</p>
            </div>
          ) : !data && busy ? (
            <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '44px 20px', background: 'var(--color-surface)' }}>
              <div style={{ fontSize: 40 }}>🎯</div>
              <p className="text-muted" style={{ fontSize: 14 }}>Predicting your colleges…</p>
            </div>
          ) : res.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {res.map((c) => (
                <div key={c.id} className="card elev-sm" style={{ background: 'var(--color-surface)', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <TypeBadge type={c.type} />
                        {c.instituteId
                          ? <span onClick={() => runAct({ act: 'viewCollege', slug: c.instituteId })} style={{ fontFamily: 'var(--font-heading)', fontSize: 18, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--color-divider)', textUnderlineOffset: 3 }}>{c.college}</span>
                          : <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{c.college}</span>}
                        {c.homeQuota && <Tag tone="accent-2">🏠 Home state</Tag>}
                        {c.femaleSeat && <Tag tone="accent">👩 Female-only seat</Tag>}
                      </div>
                      <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>{c.branch}{c.city ? ` · ${c.city}, ${c.state}` : ''}{c.nirf ? ` · NIRF #${c.nirf}` : ''} · {quotaTxt(c.quota)} quota</div>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <ChanceChip bucket={c.bucket} label={c.label || bucketLabel(c.bucket)} pct={c.pct} withDot />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 22, fontSize: 13, flexWrap: 'wrap' }}>
                    <div><span className="text-muted">Closing rank{c.examLabel ? ` (${c.examLabel})` : ''}</span> <strong>{c.close}</strong></div>
                    {c.open != null && <div><span className="text-muted">Opening rank</span> <strong>{c.open}</strong></div>}
                    <div><span className="text-muted">Fees</span> <strong>{feesTxtOf(c)}</strong></div>
                    {c.seatType && <div><span className="text-muted">Seat</span> <strong>{c.seatType}</strong></div>}
                  </div>
                  {c.forecast && <ForecastLine f={c.forecast} basis={c.chanceBasis} />}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>
                    <Btn variant="pri" act="addList" id={c.id}>+ Add to list</Btn>
                    <Btn variant="sec" act="viewDetail" id={c.id}>View analysis</Btn>
                    {c.instituteId && <Btn variant="sec" act="viewCollege" slug={c.instituteId}>🏛 Full college</Btn>}
                    <Btn variant="ghost" act="shortlist" id={c.id} style={{ marginLeft: 'auto' }}>♡ Save</Btn>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '44px 20px', background: 'var(--color-surface)' }}>
              <div style={{ fontSize: 40 }}>🔍</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>No colleges match these filters</div>
              <p className="text-muted" style={{ fontSize: 14, maxWidth: 340 }}>Try loosening a filter — remove a college type, widen the branch, or clear the search.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Advanced Filters / Search ────────────────────────────────────────────────
export function Filters() {
  const { filters, setFilters, toggleType, showToast } = useApp();
  const TYPES = ['IIT', 'NIT', 'IIIT', 'GFTI'];
  const reset = () => { setFilters({ types: ['IIT', 'NIT', 'IIIT', 'GFTI'], branch: 'all', state: 'all', q: '', sort: 'best', gender: 'Gender-Neutral', bucket: 'all', quota: 'all', nirfMax: 0, maxFees: 0, homeOnly: false }); showToast('Filters reset'); };
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Advanced filters &amp; search</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>Narrow across every dimension, then apply.</p>
      <div className="card" style={{ background: 'var(--color-surface)' }}>
        <Field label="Search college or branch"><Input placeholder="e.g. NIT Trichy CSE" value={filters.q} onChange={(e) => setFilters({ q: e.target.value })} /></Field>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>College type</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TYPES.map((t) => (
            <span key={t} className="tag" onClick={() => toggleType(t)} style={{ cursor: 'pointer', ...(filters.types.includes(t) ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }) }}>{t}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Branch" style={{ flex: 1, minWidth: 150 }}><Select value={filters.branch} onChange={(e) => setFilters({ branch: e.target.value })}><option value="all">All branches</option><option>Computer Science</option><option>Electronics</option><option>Electrical</option><option>Mechanical</option></Select></Field>
          <Field label="State" style={{ flex: 1, minWidth: 150 }}><Select value={filters.state} onChange={(e) => setFilters({ state: e.target.value })}><option value="all">All states</option>{stateOptions}</Select></Field>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Max fees" style={{ flex: 1, minWidth: 150 }}><Select value={filters.maxFees} onChange={(e) => setFilters({ maxFees: +e.target.value })}><option value={0}>Any</option><option value={2}>≤ ₹2L</option><option value={5}>≤ ₹5L</option><option value={8}>≤ ₹8L</option></Select></Field>
          <Field label="NIRF ranking" style={{ flex: 1, minWidth: 150 }}><Select value={filters.nirfMax} onChange={(e) => setFilters({ nirfMax: +e.target.value })}><option value={0}>Any</option><option value={25}>Top 25</option><option value={50}>Top 50</option><option value={100}>Top 100</option></Select></Field>
        </div>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Seat pool</div>
        <div className="seg" style={{ maxWidth: 340 }}>
          <SegOpt on={filters.gender === 'Gender-Neutral'} onClick={() => setFilters({ gender: 'Gender-Neutral' })}>Gender-Neutral</SegOpt>
          <SegOpt on={filters.gender === 'Female-only (including Supernumerary)'} onClick={() => setFilters({ gender: 'Female-only (including Supernumerary)' })}>Female-only</SegOpt>
        </div>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Result stage</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['all', 'All'], ['safe', 'Safe'], ['target', 'Target'], ['reach', 'Reach']].map(([val, lbl]) => (
            <span key={val} className="tag" onClick={() => setFilters({ bucket: val })} style={{ cursor: 'pointer', ...(filters.bucket === val ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }) }}>{lbl}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Quota" style={{ flex: 1, minWidth: 150 }}><Select value={filters.quota} onChange={(e) => setFilters({ quota: e.target.value })}><option value="all">All quotas</option><option value="AI">All-India (AI)</option><option value="HS">Home state (HS)</option><option value="OS">Other state (OS)</option></Select></Field>
          <Field label="Home-state seats" style={{ flex: 1, minWidth: 150 }}>
            <div className="seg">
              <SegOpt on={!filters.homeOnly} onClick={() => setFilters({ homeOnly: false })}>All seats</SegOpt>
              <SegOpt on={filters.homeOnly} onClick={() => setFilters({ homeOnly: true })}>Home only</SegOpt>
            </div>
          </Field>
        </div>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Saved presets</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag tone="outline" style={{ cursor: 'pointer' }}>CSE only</Tag><Tag tone="outline" style={{ cursor: 'pointer' }}>Home-state NITs</Tag><Tag tone="outline" style={{ cursor: 'pointer' }}>Top 10 NIRF</Tag>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}><Btn variant="pri" go="predictor" style={{ flex: 1 }}>Apply filters</Btn><Btn variant="sec" onClick={reset}>Reset</Btn></div>
      </div>
    </section>
  );
}

// ── College Detail & Analysis [CORE] ─────────────────────────────────────────
export function CollegeDetail() {
  const { selected, resolveCollege } = useApp();
  const [data, setData] = useState(null); // { college, chart }
  const [state, setState] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    setState('loading'); setData(null);
    resolveCollege(selected)
      .then((d) => { if (cancelled) return; if (d && d.college) { setData(d); setState('ready'); } else setState('error'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [selected, resolveCollege]);

  if (state !== 'ready') {
    return (
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '40px 22px' }}>
        <Btn variant="ghost" go="predictor" style={{ paddingLeft: 0 }}>← Back to predictor</Btn>
        <p className="text-muted" style={{ marginTop: 12 }}>{state === 'error' ? 'We couldn’t load this college. Please head back to the predictor and try again.' : 'Loading analysis…'}</p>
      </section>
    );
  }

  const col = data.college;
  const chart = chartGeomFromLive(data.chart);
  const rank = chart.rank;
  const max = Math.max(col.close, rank, 1) * 1.1;
  const bar = (v, color) => <div style={{ height: 14, borderRadius: 7, background: color, width: `${Math.max(4, Math.min(100, (v / max) * 100))}%` }} />;
  return (
    <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 22px 96px' }}>
      <Btn variant="ghost" go="predictor" style={{ paddingLeft: 0, marginBottom: 6 }}>← Back to predictor</Btn>
      <div className="card elev-sm" style={{ background: 'var(--color-surface)', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><TypeBadge type={col.type} /><span className="tag" style={chipStyle(col.bucket)}>{col.label || bucketLabel(col.bucket)} · {col.pct}% for you</span>{col.homeQuota && <Tag tone="accent-2">🏠 Home state</Tag>}</div>
            <h1 style={{ margin: '8px 0 2px', fontSize: 34 }}>{col.college}</h1>
            <div className="text-muted" style={{ fontSize: 14 }}>{col.branch}{col.city ? ` · ${col.city}, ${col.state}` : ''}{col.nirf ? ` · NIRF #${col.nirf}` : ''} · {quotaTxt(col.quota)} quota</div>
            {col.instituteId && <Btn variant="ghost" act="viewCollege" slug={col.instituteId} style={{ paddingLeft: 0, marginTop: 4 }}>🏛 See all branches at {col.college} →</Btn>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="pri" act="addList" id={col.id}>+ Add to list</Btn>
            <Btn variant="ghost" act="shortlist" id={col.id}>♡ Save</Btn>
            <Btn variant="sec" act="talkHere" id={col.id}>💬 Talk to a student</Btn>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ background: 'var(--color-surface)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Cutoff trend — with your rank</div>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Closing rank{col.examLabel ? ` (${col.examLabel})` : ''}. The dashed line is where you stand.</p>
          <CutoffChart chart={chart} />
        </div>
        <div className="card" style={{ background: 'var(--color-surface)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Your rank vs 2024 cutoff</div>
          <div style={{ fontSize: 12 }} className="text-muted">Closing rank{col.seatType ? ` (${col.seatType})` : ''}</div>{bar(col.close, 'var(--color-accent)')}<div style={{ fontSize: 12 }}>{col.close}</div>
          <div style={{ fontSize: 12, marginTop: 6 }} className="text-muted">Your rank</div>{bar(rank, '#a8442e')}<div style={{ fontSize: 12 }}>{rank}</div>
          <p className="text-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Opening {col.open} · closing {col.close}. {rank <= col.close ? 'You’re within last year’s closing rank — a strong sign.' : 'You’re beyond last year’s closing — this is a reach.'}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Overview</div><div className="card-title">About {col.college}</div><p className="card-body">A premier institute known for rigorous academics, a strong alumni network and vibrant campus life{col.city ? ` in ${col.city}` : ''}. Sprawling residential campus with modern labs and active technical &amp; cultural clubs.</p></div>
        <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Branch</div><div className="card-title">{col.branch}</div><p className="card-body">Core coursework spans algorithms, systems and applied maths, with electives in AI/ML. Graduates head into software, quant, higher studies and research.</p></div>
        <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Fees &amp; ranking</div><div className="card-title">{feesTxtOf(col)}</div><p className="card-body">NIRF 2024 {col.nirf ? `#${col.nirf}` : '—'} · seat {col.seatType || '—'} · {quotaTxt(col.quota)} quota. Merit-cum-means scholarships and fee waivers available for eligible categories.</p></div>
      </div>

      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Things to know — honest pros &amp; cons</div>
        <div className="proscons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><div style={{ fontSize: 12, color: 'var(--color-accent-2-800)', marginBottom: 6 }}>👍 Pros</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}><li>Excellent peer group and coding culture</li><li>Strong placements across software &amp; quant</li><li>Great alumni network</li></ul></div>
          <div><div style={{ fontSize: 12, color: REACH_FG, marginBottom: 6 }}>👎 Cons</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}><li>Competitive, high-pressure environment</li><li>City weather can be extreme</li><li>Popular electives fill quickly</li></ul></div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Reviews from verified seniors</div><Tag tone="accent-2">✔ Verified</Tag></div>
        {/* TODO(owner): per-college reviews need a reviews endpoint — showing representative notes. */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, border: '1px solid var(--color-divider)', borderRadius: 14, padding: 12 }}><div style={{ fontSize: 13 }}>⭐ 4.8 · Aarav, Y3 CSE</div><p style={{ fontSize: 13, margin: '6px 0 0' }} className="text-muted">&quot;Placements are as good as advertised, but be ready to work hard from year one.&quot;</p></div>
          <div style={{ flex: 1, minWidth: 220, border: '1px solid var(--color-divider)', borderRadius: 14, padding: 12 }}><div style={{ fontSize: 13 }}>⭐ 4.6 · Priya, Alumni</div><p style={{ fontSize: 13, margin: '6px 0 0' }} className="text-muted">&quot;The alumni network opened doors for me abroad. Hostel food is hit or miss.&quot;</p></div>
        </div>
        <Btn variant="sec" act="toCompare" id={col.id} style={{ alignSelf: 'flex-start' }}>Compare with similar colleges</Btn>
      </div>

      <div className="card" style={{ background: '#f7e2db', marginTop: 16 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>⚠ Official JoSAA 2024 data</div><p style={{ fontSize: 13, margin: 0 }}>Opening/closing ranks are official JoSAA 2024 figures — an estimate for the coming season, not a guarantee. Always verify on josaa.nic.in.</p></div>

      <div style={{ position: 'sticky', bottom: 64, marginTop: 20, display: 'flex', gap: 10, background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 12, borderRadius: 16, boxShadow: 'var(--shadow-md)' }}>
        <Btn variant="pri" act="addList" id={col.id} style={{ flex: 1 }}>+ Add to choice list</Btn>
        <Btn variant="sec" act="talkHere" id={col.id} style={{ flex: 1 }}>💬 Talk to a student here</Btn>
      </div>
    </section>
  );
}

// ── Deep College Explorer [CORE] — profile keyed by canonical slug ───────────
// Renders the institute header + every branch's cutoff, multi-year trend and 2026
// forecast + the student's calibrated chance. Content sections (fees / seat matrix /
// placements / photos) are shaped now and fill in with the Phase 3 dataset.
function monogram(short = '') {
  const parts = short.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'C').toUpperCase() + (parts[1]?.[0] || parts[0]?.[1] || '').toUpperCase();
}
const TYPE_HUE = { IIT: 18, NIT: 205, IIIT: 265, GFTI: 150 };

function BranchRow({ b, rank }) {
  const [open, setOpen] = useState(false);
  const chart = b.history
    ? chartGeomFromLive({
        years: b.history.map((h) => h.year), vals: b.history.map((h) => h.close), rank,
        forecast: b.forecast ? { year: b.forecast.targetYear, predicted: b.forecast.predicted, low: b.forecast.low, high: b.forecast.high } : null,
      })
    : null;
  return (
    <div className="card" style={{ background: 'var(--color-surface)', gap: 8, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{b.branch}</div>
          <div className="text-muted" style={{ fontSize: 12.5, marginTop: 1 }}>
            Closing <strong>{b.close}</strong>{b.open != null ? ` · opening ${b.open}` : ''} · {b.seatType} · {quotaTxt(b.quota)}{b.homeQuota ? ' 🏠' : ''}
          </div>
        </div>
        <ChanceChip bucket={b.bucket} label={b.label || bucketLabel(b.bucket)} pct={b.pct} withDot />
      </div>
      {b.forecast && <ForecastLine f={b.forecast} basis={b.chanceBasis} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chart && <Btn variant="ghost" onClick={() => setOpen((v) => !v)} style={{ paddingLeft: 0 }}>{open ? '▲ Hide trend' : '📈 Trend & 2026 forecast'}</Btn>}
        <Btn variant="sec" act="addList" id={b.id} style={{ marginLeft: 'auto' }}>+ Add to list</Btn>
      </div>
      {open && chart && (
        <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 8 }}>
          <CutoffChart chart={chart} />
          <p className="text-muted" style={{ fontSize: 12, margin: '2px 0 0' }}>Solid line = official closing ranks. Hollow dot + shaded band = the 2026 forecast range. Dashed red = your rank.</p>
        </div>
      )}
    </div>
  );
}

function ComingSoon({ icon, title, note }) {
  return (
    <div className="card" style={{ background: 'var(--color-surface)', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{icon}</span><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>{title}</div><Tag tone="outline" style={{ marginLeft: 'auto', fontSize: 11 }}>Coming soon</Tag></div>
      <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>{note}</p>
    </div>
  );
}

export function CollegeExplorer() {
  const { selectedCollege, resolveProfile, profile } = useApp();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error

  useEffect(() => {
    if (!selectedCollege) { setState('error'); return; }
    let cancelled = false;
    setState('loading'); setData(null);
    resolveProfile(selectedCollege)
      .then((d) => { if (cancelled) return; if (d && d.institute) { setData(d); setState('ready'); } else setState('error'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [selectedCollege, resolveProfile]);

  if (state !== 'ready') {
    return (
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '40px 22px' }}>
        <Btn variant="ghost" go="predictor" style={{ paddingLeft: 0 }}>← Back to predictor</Btn>
        <p className="text-muted" style={{ marginTop: 12 }}>{state === 'error' ? 'We couldn’t load this college. Head back to the predictor and pick one from the list.' : 'Loading college profile…'}</p>
      </section>
    );
  }

  const inst = data.institute;
  const branches = data.branches || [];
  const sum = data.summary || {};
  const rank = inst.type === 'IIT' ? profile.advRank : profile.mainRank;
  const hue = TYPE_HUE[inst.type] ?? 205;

  return (
    <section style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 22px 96px' }}>
      <Btn variant="ghost" go="predictor" style={{ paddingLeft: 0, marginBottom: 6 }}>← Back to predictor</Btn>

      {/* Hero — gradient monogram stands in until a licensed photo lands (Phase 3). */}
      <div className="card elev-sm" style={{ background: 'var(--color-surface)', padding: 0, overflow: 'hidden', gap: 0 }}>
        <div style={{ position: 'relative', height: 132, background: `linear-gradient(120deg, hsl(${hue} 45% 32%), hsl(${hue + 30} 55% 46%))`, display: 'flex', alignItems: 'center', padding: '0 22px' }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: 28, color: '#fff', flex: 'none' }}>{monogram(inst.short)}</div>
          <div style={{ marginLeft: 16, color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TypeBadge type={inst.type} /></div>
            <h1 style={{ margin: '4px 0 0', fontSize: 30, color: '#fff' }}>{inst.short}</h1>
            <div style={{ fontSize: 13, opacity: 0.9 }}>{inst.city}{inst.state ? `, ${inst.state}` : ''}{inst.nirf ? ` · NIRF #${inst.nirf}` : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 22px', fontSize: 13 }}>
          <div><span className="text-muted">Branches</span> <strong>{data.branchCount}</strong></div>
          <div><span className="text-muted">Approx fees</span> <strong>₹{inst.feesLakh}L</strong></div>
          <div><span className="text-muted">Admission via</span> <strong>{inst.exam === 'adv' ? 'JEE Advanced' : 'JEE Main'}</strong></div>
          {inst.nirf && <div><span className="text-muted">NIRF 2024</span> <strong>#{inst.nirf}</strong></div>}
        </div>
      </div>

      {/* Your-chances summary for this college */}
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 16, gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Your chances at {inst.short}</div>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Based on your {inst.exam === 'adv' ? 'JEE Advanced' : 'JEE Main'} rank <strong>{rank ? rank.toLocaleString() : '—'}</strong> · {profile.category} category{profile.home ? ` · home ${profile.home}` : ''}. Every branch below shows the 2026 forecast + your calibrated chance.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120, background: 'var(--color-accent-2-100)', borderRadius: 14, padding: '10px 14px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--color-accent-2-800)' }}>{sum.safeCount ?? 0}</div><div style={{ fontSize: 12 }}>Safe</div></div>
          <div style={{ flex: 1, minWidth: 120, background: 'var(--color-accent-100)', borderRadius: 14, padding: '10px 14px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--color-accent-800)' }}>{sum.targetCount ?? 0}</div><div style={{ fontSize: 12 }}>Target</div></div>
          <div style={{ flex: 1, minWidth: 120, background: REACH_BG, borderRadius: 14, padding: '10px 14px' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: REACH_FG }}>{sum.reachCount ?? 0}</div><div style={{ fontSize: 12 }}>Reach</div></div>
        </div>
      </div>

      {/* Cutoffs — the crown jewel: every branch, best reachable first */}
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, margin: '22px 0 10px' }}>Cutoffs, trend &amp; your chance — by branch</div>
      {branches.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {branches.map((b) => <BranchRow key={b.id} b={b} rank={rank} />)}
        </div>
      ) : (
        <div className="card" style={{ background: 'var(--color-surface)', textAlign: 'center', padding: 30 }}><p className="text-muted" style={{ margin: 0 }}>No branches match your category/gender pool at this college.</p></div>
      )}

      {/* Content layer — Phase 3 (curated + NIRF + Wikimedia) */}
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, margin: '24px 0 10px' }}>More about {inst.short}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <ComingSoon icon="💰" title="Fee structure" note="Tuition, hostel & mess split with the full-degree total and category waivers — sourced from NIRF data & official brochures." />
        <ComingSoon icon="🪑" title="Seat matrix" note="Seats per branch × category × gender pool, so you can see supply alongside the cutoffs." />
        <ComingSoon icon="📊" title="Placements" note="Average / median / highest package with year and top recruiters — official, year-labelled figures." />
        <ComingSoon icon="🏫" title="Campus & photos" note="About the institute, how to reach, and licensed campus photos (Wikimedia Commons, with credit)." />
      </div>

      <div className="card" style={{ background: '#f7e2db', marginTop: 18 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>⚠ Forecasts are estimates</div><p style={{ fontSize: 13, margin: 0 }}>Cutoffs are official JoSAA figures (2018–2024). The 2026 projection is a trend-based estimate with an uncertainty band — a planning aid, not a guarantee. Always verify on josaa.nic.in.</p></div>

      <div style={{ position: 'sticky', bottom: 64, marginTop: 20, display: 'flex', gap: 10, background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 12, borderRadius: 16, boxShadow: 'var(--shadow-md)' }}>
        <Btn variant="pri" go="predictor" style={{ flex: 1 }}>← Find more colleges</Btn>
        <Btn variant="sec" act="talkHere" id={branches[0]?.id} style={{ flex: 1 }}>💬 Talk to a senior here</Btn>
      </div>
    </section>
  );
}

function CutoffChart({ chart }) {
  const { W, H, pad, points, dots, yearLabels, rankY, rank, forecast: fc } = chart;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: W }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--color-divider)" />
      {/* 2026 forecast: shaded uncertainty band + dashed link + hollow projected dot */}
      {fc && (
        <>
          <rect x={fc.x - 16} y={fc.bandTop} width={32} height={Math.max(2, fc.bandBot - fc.bandTop)} rx={4} fill="var(--color-accent)" opacity={0.14} />
          {fc.linkFrom && <line x1={fc.linkFrom.x} y1={fc.linkFrom.y} x2={fc.x} y2={fc.y} stroke="var(--color-accent)" strokeWidth={2.5} strokeDasharray="5 4" />}
          <circle cx={fc.x} cy={fc.y} r={5} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2.5} />
          <text x={fc.x} y={fc.y - 11} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-accent-800)">{fc.predicted}</text>
        </>
      )}
      <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {dots.map((d, i) => <circle key={`c${i}`} cx={d.cx} cy={d.cy} r={4.5} fill="var(--color-accent)" />)}
      {dots.map((d, i) => <text key={`v${i}`} x={d.tx} y={d.ty} textAnchor="middle" fontSize={11} fill="var(--color-neutral-700)">{d.v}</text>)}
      {yearLabels.map((y, i) => <text key={`y${i}`} x={y.x} y={y.y} textAnchor="middle" fontSize={11} fill="var(--color-neutral-600)">{y.yr}</text>)}
      <line x1={pad} y1={rankY} x2={W - pad} y2={rankY} stroke="#a8442e" strokeWidth={2} strokeDasharray="6 5" />
      <text x={W - pad} y={rankY - 6} textAnchor="end" fontSize={11} fontWeight={700} fill="#a8442e">Your rank {rank}</text>
    </svg>
  );
}

// ── College Comparison ───────────────────────────────────────────────────────
export function Compare() {
  const { compareIds, resolveCollege } = useApp();
  const [items, setItems] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    Promise.all(compareIds.map((id) => resolveCollege(id)))
      .then((rs) => { if (!cancelled) setItems(rs.filter(Boolean).map((r) => r.college)); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [compareIds, resolveCollege]);
  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Compare colleges</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>Weigh your options side by side. Key differences are highlighted.</p>
      {items === null ? (
        <p className="text-muted" style={{ fontSize: 14 }}>Loading colleges…</p>
      ) : items.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, background: 'var(--color-surface)' }}><div style={{ fontSize: 38 }}>📊</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Nothing to compare yet</div><p className="text-muted" style={{ fontSize: 14 }}>Open a college and tap &quot;Compare&quot; to line options up here.</p><Btn variant="pri" go="predictor">Open predictor</Btn></div>
      ) : (
        <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 520 }}>
            <thead><tr><th>Metric</th>{items.map((c) => <th key={c.id}>{c.college}<div className="text-muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{c.branch}</div></th>)}</tr></thead>
            <tbody>
              <tr><td>Your chance</td>{items.map((c) => <td key={c.id}><span className="tag" style={chipStyle(c.bucket)}>{c.label || bucketLabel(c.bucket)} · {c.pct}%</span></td>)}</tr>
              <tr><td>Closing rank</td>{items.map((c) => <td key={c.id}>{c.close}</td>)}</tr>
              <tr><td>Opening rank</td>{items.map((c) => <td key={c.id}>{c.open ?? '—'}</td>)}</tr>
              <tr><td>Fees</td>{items.map((c) => <td key={c.id}>{feesTxtOf(c)}</td>)}</tr>
              <tr><td>NIRF</td>{items.map((c) => <td key={c.id}>{c.nirf ? `#${c.nirf}` : '—'}</td>)}</tr>
              <tr><td>Location</td>{items.map((c) => <td key={c.id}>{c.city || '—'}</td>)}</tr>
              <tr><td></td>{items.map((c) => <td key={c.id}><Btn variant="pri" act="addList" id={c.id}>Add to list</Btn></td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
      <Btn variant="sec" go="predictor" style={{ marginTop: 12 }}>+ Add another college</Btn>
    </section>
  );
}

// ── Shortlist / Saved Colleges ───────────────────────────────────────────────
export function Shortlist() {
  const { shortlist, resolveCollege, runAct } = useApp();
  const [items, setItems] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    Promise.all(shortlist.map((id) => resolveCollege(id)))
      .then((rs) => { if (!cancelled) setItems(rs.filter(Boolean).map((r) => r.college)); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [shortlist, resolveCollege]);
  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '24px 22px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}><h1 style={{ margin: 0, fontSize: 30 }}>Saved colleges</h1><Btn variant="pri" go="choiceBuilder">Build ordered list →</Btn></div>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>A holding area before you commit to an ordered choice list.</p>
      {items === null ? (
        <p className="text-muted" style={{ fontSize: 14 }}>Loading your saved colleges…</p>
      ) : items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((c) => (
            <div key={c.id} className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TypeBadge type={c.type} />
              <div style={{ flex: 1 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{c.college}</div><div className="text-muted" style={{ fontSize: 12 }}>{c.branch} · close {c.close}</div></div>
              <span className="tag" style={chipStyle(c.bucket)}>{c.label || bucketLabel(c.bucket)}</span>
              <Btn variant="pri" act="addList" id={c.id}>Move to list</Btn>
              <span className="sc-tile" onClick={() => runAct({ act: 'removeShort', id: c.id })} style={{ cursor: 'pointer', color: '#a8442e' }}>✕</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, background: 'var(--color-surface)' }}><div style={{ fontSize: 38 }}>♡</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Nothing saved yet</div><p className="text-muted" style={{ fontSize: 14 }}>Tap &quot;Save&quot; on any college in the predictor to hold it here.</p><Btn variant="pri" go="predictor">Open predictor</Btn></div>
      )}
    </section>
  );
}

// ── Choice-List Builder (drag & drop) [CORE] ─────────────────────────────────
export function ChoiceBuilder() {
  const { choiceItems, choiceWarnings, onDragStart, onDragOver, onDragEnd, runAct, dragIndex } = useApp();
  const rows = choiceItems.map((c, ix) => ({ ...c, pos: ix + 1, idx: ix, label: c.label || bucketLabel(c.bucket) }));
  const sevMap = { high: { color: '#a8442e', icon: '⚠' }, med: { color: '#d67f48', icon: '!' } };
  const doctor = (choiceWarnings && choiceWarnings.length)
    ? choiceWarnings.map((w) => ({ t: w.title, d: w.detail, ...(sevMap[w.sev] || { color: '#728157', icon: '✔' }) }))
    : [{ t: 'List looks healthy', d: 'Good spread of Safe, Target and Reach. You’re ready to lock.', color: '#728157', icon: '✔' }];
  const projected = rows.find((c) => c.bucket === 'safe') || rows.find((c) => c.bucket === 'target') || rows[0] || { college: '—', branch: 'Add colleges first' };
  return (
    <section style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 22px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        <div><div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>Core screen</div><h1 style={{ margin: 0, fontSize: 34 }}>Choice-List Builder</h1><p className="text-muted" style={{ fontSize: 14, margin: '6px 0 0' }}>Drag rows to reorder — the order is your JoSAA priority. {rows.length} choices · saved to your account.</p></div>
        <div style={{ display: 'flex', gap: 8 }}><Btn variant="sec" go="predictor">+ Add from predictor</Btn><Btn variant="pri" go="choiceExport">Export list</Btn></div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          {rows.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((c) => (
                <div
                  key={c.idx}
                  className={['drag-row card elev-sm', dragIndex === c.idx ? 'dragging' : ''].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={() => onDragStart(c.idx)}
                  onDragOver={(e) => { e.preventDefault(); onDragOver(c.idx); }}
                  onDragEnd={onDragEnd}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, background: 'var(--color-surface)', padding: '12px 14px' }}
                >
                  <span style={{ fontSize: 18, color: 'var(--color-neutral-500)', cursor: 'grab' }}>⠿</span>
                  <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--color-accent)', color: 'var(--color-bg)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 14 }}>{c.pos}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><TypeBadge type={c.type} /><span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{c.college}</span></div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{c.branch} · close {c.close}</div>
                  </div>
                  <span className="tag" style={chipStyle(c.bucket)}>{c.label}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="sc-tile" onClick={() => runAct({ act: 'moveUp', i: c.idx })} style={{ cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>▲</span>
                    <span className="sc-tile" onClick={() => runAct({ act: 'moveDown', i: c.idx })} style={{ cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>▼</span>
                  </div>
                  <span className="sc-tile" onClick={() => runAct({ act: 'removeChoice', i: c.idx })} style={{ cursor: 'pointer', color: '#a8442e', fontSize: 16 }}>✕</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '48px 20px', background: 'var(--color-surface)' }}><div style={{ fontSize: 42 }}>📋</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>Add your first colleges</div><p className="text-muted" style={{ fontSize: 14, maxWidth: 320 }}>Head to the predictor and tap &quot;Add to list&quot; — they&apos;ll appear here, ready to drag into your preferred order.</p><Btn variant="pri" go="predictor">Open predictor</Btn></div>
          )}
        </div>

        <aside className="builder-aside" style={{ flex: 'none', width: 300 }}>
          <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 20 }}>🩺</span><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>List Doctor</div></div>
            {doctor.map((w, i) => (
              <div key={i} style={{ borderRadius: 12, padding: '11px 12px', background: 'var(--color-bg)', borderLeft: `4px solid ${w.color}` }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{w.icon} {w.t}</div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{w.d}</div>
              </div>
            ))}
          </div>
          <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Projected allotment</div>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>With this list and order, you&apos;d most likely be allotted:</p>
            <div style={{ borderRadius: 12, padding: 12, background: 'var(--color-accent-2-100)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--color-accent-2-800)' }}>{projected.college}</div><div className="text-muted" style={{ fontSize: 12 }}>{projected.branch} · current round (est.)</div></div>
          </div>
          <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Scenarios</div>
            {/* TODO(owner): scenario re-weighting needs a planner "what-if" endpoint. */}
            <div className="seg" style={{ width: '100%' }}><SegOpt on style={{ flex: 1, justifyContent: 'center' }}>Balanced</SegOpt><SegOpt style={{ flex: 1, justifyContent: 'center' }}>Safe</SegOpt><SegOpt style={{ flex: 1, justifyContent: 'center' }}>Aggressive</SegOpt></div>
          </div>
        </aside>
      </div>
    </section>
  );
}

// ── Choice-List Export / Print Preview ───────────────────────────────────────
export function ChoiceExport() {
  const { profile, choiceItems, showToast } = useApp();
  const rows = choiceItems.map((c, ix) => ({ ...c, pos: ix + 1 }));
  const [busy, setBusy] = useState(false);
  const doExport = async () => {
    setBusy(true);
    try { const r = await liveApi.exportChoiceList(); showToast(r?.message || 'Export ready — check your downloads.'); }
    catch { showToast('PDF export is coming soon — for now copy the list into josaa.nic.in in this order.'); }
    finally { setBusy(false); }
  };
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <Btn variant="ghost" go="choiceBuilder" style={{ paddingLeft: 0 }}>← Back to builder</Btn>
      <h1 style={{ margin: '4px 0 2px', fontSize: 30 }}>Export your choice list</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>A clean, numbered list — paste it into josaa.nic.in in the same order.</p>
      {rows.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, background: 'var(--color-surface)' }}><div style={{ fontSize: 38 }}>📋</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>Nothing to export yet</div><p className="text-muted" style={{ fontSize: 14 }}>Build your choice list first, then come back to export it.</p><Btn variant="pri" go="choiceBuilder">Open builder</Btn></div>
      ) : (
        <>
          <div className="card" style={{ background: '#fff', border: '1px solid var(--color-divider)', color: '#201e1d' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, borderBottom: '1px solid var(--color-divider)', paddingBottom: 8 }}>JoSAA Choice List — {profile?.name || 'You'} · {rows.length} choices</div>
            {rows.map((c) => (
              <div key={c.pos} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '3px 0' }}><span style={{ width: 24, color: 'var(--color-neutral-600)' }}>{c.pos}.</span><span style={{ flex: 1 }}>{c.college} — {c.branch}</span><span className="text-muted">{c.type}</span></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><Btn variant="pri" onClick={doExport} disabled={busy}>{busy ? 'Preparing…' : '⬇ Download PDF'}</Btn><Btn variant="sec" act="toast" msg="Opening print dialog…">🖨 Print</Btn><Btn variant="sec" act="toast" msg="Share link copied">↗ Share</Btn></div>
          <div style={{ fontSize: 12, background: 'var(--color-accent-2-100)', borderRadius: 12, padding: 11, marginTop: 12, color: 'var(--color-accent-2-800)' }}>💡 On josaa.nic.in, add choices in this exact order under &quot;Choice Filling&quot;. Lock only when you&apos;re sure.</div>
        </>
      )}
    </section>
  );
}

// ── Browse Counsellors (Mentor Marketplace) ──────────────────────────────────
export function Marketplace() {
  const { navigate, update } = useApp();
  const [mentors, setMentors] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setErr(false);
    liveApi.mentors()
      .then((r) => { if (!cancelled) setMentors(r?.mentors || []); })
      .catch(() => { if (!cancelled) { setErr(true); setMentors([]); } });
    return () => { cancelled = true; };
  }, []);
  const pick = (m) => { update((s) => ({ mentorsById: { ...s.mentorsById, [m.userId]: m }, mentorSel: m.userId })); navigate('mentorProfile'); };
  return (
    <section style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Talk to a verified senior</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 14 }}>25-minute 1:1 video calls · every mentor is a verified current student.</p>
      {/* TODO(owner): filter chips need server-side mentor query params (college/branch/rating). */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}><Tag tone="accent" style={{ cursor: 'pointer' }}>All colleges</Tag><Tag style={{ cursor: 'pointer' }}>IITs</Tag><Tag style={{ cursor: 'pointer' }}>NITs</Tag><Tag style={{ cursor: 'pointer' }}>CSE</Tag><Tag style={{ cursor: 'pointer' }}>Top rated</Tag></div>
      {mentors === null ? (
        <p className="text-muted" style={{ fontSize: 14 }}>Loading mentors…</p>
      ) : mentors.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, background: 'var(--color-surface)' }}><div style={{ fontSize: 38 }}>💬</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>{err ? 'Couldn’t load mentors' : 'No mentors available yet'}</div><p className="text-muted" style={{ fontSize: 14 }}>{err ? 'Please try again in a moment.' : 'Verified seniors will appear here soon. Are you one? Become a mentor.'}</p><Btn variant="pri" go="mentorOnboarding">Become a mentor</Btn></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {mentors.map((m) => (
            <div key={m.userId} className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><Avatar initials={initialsOf(m.name)} color={colorFor(m.userId || m.name)} size={48} /><div style={{ flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{m.name}</span><span className="tag tag-accent-2" style={{ padding: '1px 7px' }}>✔</span></div><div className="text-muted" style={{ fontSize: 12 }}>{m.college} · {m.branch} · Y{m.year}</div></div></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>⭐ {m.ratingAvg != null ? (m.ratingAvg.toFixed ? m.ratingAvg.toFixed(1) : m.ratingAvg) : 'New'} · {m.ratingCount ?? 0} ratings</span><span style={{ fontFamily: 'var(--font-heading)' }}>₹{m.priceINR}</span></div>
              {(m.topics && m.topics.length > 0) && <div className="text-muted" style={{ fontSize: 12 }}>{m.topics.slice(0, 3).join(' · ')}</div>}
              <div style={{ display: 'flex', gap: 6 }}><Btn variant="pri" onClick={() => pick(m)} style={{ flex: 1 }}>View &amp; book</Btn></div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 18, fontSize: 13 }} className="text-muted">Are you a current student? <span className="sc-tile" onClick={() => navigate('mentorOnboarding')} style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Become a mentor →</span></div>
    </section>
  );
}

// ── Mentor Profile (student view) ─────────────────────────────────────────────
export function MentorProfile() {
  const [m, loading] = useSelectedMentor();
  if (loading) return <section style={{ maxWidth: 720, margin: '0 auto', padding: '40px 22px' }}><Btn variant="ghost" go="marketplace" style={{ paddingLeft: 0 }}>← Back to mentors</Btn><p className="text-muted" style={{ marginTop: 12 }}>Loading mentor…</p></section>;
  if (!m) return <section style={{ maxWidth: 720, margin: '0 auto', padding: '40px 22px' }}><Btn variant="ghost" go="marketplace" style={{ paddingLeft: 0 }}>← Back to mentors</Btn><p className="text-muted" style={{ marginTop: 12 }}>Pick a mentor from the marketplace to see their profile.</p></section>;
  const rating = m.ratingAvg != null ? (m.ratingAvg.toFixed ? m.ratingAvg.toFixed(1) : m.ratingAvg) : 'New';
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <Btn variant="ghost" go="marketplace" style={{ paddingLeft: 0 }}>← Back to mentors</Btn>
      <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 6 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><Avatar initials={initialsOf(m.name)} color={colorFor(m.userId || m.name)} size={66} /><div style={{ flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h2 style={{ margin: 0 }}>{m.name}</h2><Tag tone="accent-2">✔ Verified</Tag></div><div className="text-muted" style={{ fontSize: 14 }}>{m.college} · {m.branch} · Year {m.year}</div><div style={{ fontSize: 13, marginTop: 4 }}>⭐ {rating} · {m.ratingCount ?? 0} ratings</div></div><div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 24 }}>₹{m.priceINR}</div><div className="text-muted" style={{ fontSize: 12 }}>per 25 min</div></div></div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}><div className="card-kicker">About</div><p style={{ fontSize: 14, margin: 0 }}>{m.bio || 'Happy to give you an honest, no-sugarcoat picture of life here — academics, the coding culture, placements and everything in between.'}</p>{(m.topics && m.topics.length > 0) && <><div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginTop: 8 }}>Helps with</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{m.topics.map((t) => <Tag key={t}>{t}</Tag>)}</div></>}</div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}><div className="card-kicker">Reviews</div><div style={{ fontSize: 13 }}>⭐⭐⭐⭐⭐ &quot;Cleared all my doubts about CSE. Super honest!&quot; — Riya</div><div style={{ fontSize: 13 }}>⭐⭐⭐⭐⭐ &quot;Best money I spent this counselling season.&quot; — Dev</div></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><Btn variant="pri" go="booking" style={{ flex: 1, padding: 13 }}>Book a session</Btn><Btn variant="sec" act="toast" msg="Reported — thanks">⚑ Report</Btn></div>
    </section>
  );
}

// ── Booking / Scheduling ──────────────────────────────────────────────────────
export function Booking() {
  const { bookingSlot, runAct, book, navigate } = useApp();
  const [m, loading] = useSelectedMentor();
  const [busy, setBusy] = useState(false);
  const selectedSlot = bookingSlot || SLOT_LIST[1];
  const proceed = async () => {
    if (!m) return;
    setBusy(true);
    // TODO(owner): map the chosen display slot to a real availability slotId; dev books 's1'.
    try { await book(m.userId, 's1'); navigate('payment'); } finally { setBusy(false); }
  };
  if (loading) return <section style={{ maxWidth: 640, margin: '0 auto', padding: '40px 22px' }}><Btn variant="ghost" go="mentorProfile" style={{ paddingLeft: 0 }}>← Back</Btn><p className="text-muted" style={{ marginTop: 12 }}>Loading…</p></section>;
  if (!m) return <section style={{ maxWidth: 640, margin: '0 auto', padding: '40px 22px' }}><Btn variant="ghost" go="marketplace" style={{ paddingLeft: 0 }}>← Back to mentors</Btn><p className="text-muted" style={{ marginTop: 12 }}>Pick a mentor first.</p></section>;
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <Btn variant="ghost" go="mentorProfile" style={{ paddingLeft: 0 }}>← Back</Btn>
      <h1 style={{ margin: '4px 0 2px', fontSize: 28 }}>Pick a slot</h1>
      <div className="card" style={{ background: 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar initials={initialsOf(m.name)} color={colorFor(m.userId || m.name)} size={40} /><div><div style={{ fontWeight: 700 }}>{m.name}</div><div className="text-muted" style={{ fontSize: 12 }}>{m.college} · ₹{m.priceINR} / 25 min</div></div></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div className="card-kicker">Available slots</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SLOT_LIST.map((t) => (
          <span key={t} className="tag" onClick={() => runAct({ act: 'bookSlot', slot: t })} style={{ cursor: 'pointer', ...(bookingSlot === t ? { background: 'var(--color-accent)', color: 'var(--color-bg)' } : { border: '1px solid var(--color-accent)', color: 'var(--color-accent-700)' }) }}>{t}</span>
        ))}</div>
        <Field label={`A note or question for ${m.name} (optional)`}><textarea className="input" placeholder="e.g. CSE at a lower IIT vs ECE at a top one?" /></Field>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontSize: 13 }}>25-min 1:1 video call</div><div className="text-muted" style={{ fontSize: 12 }}>Selected: {selectedSlot}</div></div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>₹{m.priceINR}</div></div>
      <Btn variant="pri" onClick={proceed} block disabled={busy} style={{ padding: 13, marginTop: 14 }}>{busy ? 'Reserving…' : 'Proceed to pay →'}</Btn>
    </section>
  );
}

// ── Payment / Checkout ────────────────────────────────────────────────────────
// Load Razorpay Checkout.js once, on demand.
function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(s);
  });
}

export function Payment() {
  const { sessions, bookingSlot, pay, navigate, showToast, profile, loadSessions } = useApp();
  const pending = [...sessions].reverse().find((s) => s.status === 'PENDING_PAYMENT');
  const [busy, setBusy] = useState(false);
  const selectedSlot = pending?.startsAt ? fmtWhen(pending.startsAt) : (bookingSlot || SLOT_LIST[1]);
  const price = pending?.priceINR ?? 100;

  // Poll the booking a few times for the webhook to flip it to CONFIRMED.
  const waitForConfirm = async (id) => {
    for (let i = 0; i < 8; i++) {
      const { booking } = await liveApi.getBooking(id).catch(() => ({ booking: null }));
      if (booking && booking.status !== 'PENDING_PAYMENT') return booking.status;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return 'PENDING_PAYMENT';
  };

  const doPay = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const { payment } = await liveApi.getBooking(pending.id);
      if (payment?.orderId && payment?.keyId) {
        // Real Razorpay Checkout.
        await loadRazorpay();
        await new Promise((resolve) => {
          const rzp = new window.Razorpay({
            key: payment.keyId,
            order_id: payment.orderId,
            amount: (payment.amountINR ?? price) * 100,
            currency: 'INR',
            name: 'Student-Counselor',
            description: `Mentoring session with ${pending.mentorName || 'your mentor'}`,
            prefill: { name: profile?.name || '', email: profile?.email || '' },
            theme: { color: '#c9603f' },
            handler: async () => {
              showToast('Payment received — confirming…');
              const status = await waitForConfirm(pending.id);
              await loadSessions();
              if (status === 'CONFIRMED' || status === 'LIVE') navigate('bookingConfirm');
              else showToast('Paid — confirmation is pending the payment webhook.');
              resolve();
            },
            modal: { ondismiss: () => resolve() },
          });
          rzp.open();
        });
      } else {
        // Razorpay not configured yet → dev-simulate the capture (still real backend).
        await pay(pending.id);
        navigate('bookingConfirm');
      }
    } catch (e) {
      showToast(e.message || 'Payment could not start');
    } finally { setBusy(false); }
  };

  const doSimulate = async () => { if (!pending) return; setBusy(true); try { await pay(pending.id); navigate('bookingConfirm'); } finally { setBusy(false); } };
  return (
    <section style={{ maxWidth: 520, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Checkout</h1>
      {!pending ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 36, background: 'var(--color-surface)' }}><div style={{ fontSize: 38 }}>🧾</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>No booking awaiting payment</div><p className="text-muted" style={{ fontSize: 14 }}>Start a booking from a mentor&apos;s profile, then come back to pay.</p><Btn variant="pri" go="marketplace">Find a mentor</Btn></div>
      ) : (
        <>
          <div className="card" style={{ background: 'var(--color-surface)' }}>
            <div className="card-kicker">Order summary</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{pending.mentorName || 'Mentor'} · 25 min</span><span>₹{price}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }} className="text-muted"><span>{selectedSlot}</span><span></span></div>
            <div className="hr" style={{ margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-heading)', fontSize: 18 }}><span>Total</span><span>₹{price}</span></div>
          </div>
          <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
            <div className="card-kicker">Payment method</div>
            <label className="radio" style={{ border: '1px solid var(--color-accent)', borderRadius: 14, padding: 12, background: 'var(--color-accent-100)' }}><input type="radio" name="pay" defaultChecked /><span className="dot" />UPI (GPay / PhonePe / Paytm)</label>
            <label className="radio" style={{ border: '1px solid var(--color-divider)', borderRadius: 14, padding: 12 }}><input type="radio" name="pay" /><span className="dot" />Credit / debit card</label>
            <Field label="Have a coupon?"><div style={{ display: 'flex', gap: 8 }}><Input placeholder="Enter code" style={{ flex: 1 }} /><Btn variant="sec" act="toast" msg="Coupon applied">Apply</Btn></div></Field>
          </div>
          <Btn variant="pri" onClick={doPay} block disabled={busy} style={{ padding: 13, marginTop: 14 }}>{busy ? 'Processing…' : `🔒 Pay ₹${price} securely`}</Btn>
          <button onClick={doSimulate} disabled={busy} style={{ display: 'block', margin: '8px auto 0', background: 'none', border: 'none', color: 'var(--color-neutral-600)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>Simulate payment (test — skips the gateway)</button>
          <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>Payments processed by Razorpay. Full refund if the mentor no-shows.</p>
        </>
      )}
    </section>
  );
}

// ── Booking Confirmation ──────────────────────────────────────────────────────
export function BookingConfirm() {
  const { sessions } = useApp();
  const sess = [...sessions].reverse().find((s) => s.status === 'CONFIRMED' || s.status === 'LIVE');
  return (
    <section style={{ maxWidth: 520, margin: '0 auto', padding: '40px 22px' }}>
      <div className="card elev-md" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', padding: 32 }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--color-accent-2-100)', display: 'grid', placeItems: 'center', fontSize: 32 }}>✅</div>
        <h2 style={{ margin: '2px 0' }}>You&apos;re booked!</h2>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>Session with <strong style={{ color: 'var(--color-text)' }}>{sess?.mentorName || 'your mentor'}</strong>{sess?.startsAt ? ` · ${fmtWhen(sess.startsAt)}` : ''} · {sess?.durationMin || 25} min</p>
        {sess?.meetingUrl && (
          <a href={sess.meetingUrl} target="_blank" rel="noreferrer" className="sc-btn sec" style={{ textDecoration: 'none' }}>🎥 Open Google Meet{sess.meetingProvider === 'stub' ? ' (placeholder)' : ''}</a>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}><Btn variant="pri" go="sessionRoom">Join session</Btn><Btn variant="sec" go="sessions">My sessions</Btn></div>
        <div style={{ width: '100%', textAlign: 'left', background: 'var(--color-bg)', borderRadius: 14, padding: 14, fontSize: 13 }}><strong>Prep tips</strong><ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}><li>Have your rank &amp; shortlist ready</li><li>Join from a quiet spot with good internet</li><li>Note your top 2–3 questions</li></ul></div>
        <div className="text-muted" style={{ fontSize: 12 }}>Free cancellation up to 4 hours before. <span className="sc-tile" style={{ color: 'var(--color-accent-700)', cursor: 'pointer', display: 'inline' }}>Contact support</span></div>
      </div>
    </section>
  );
}

// ── My Sessions / Bookings ────────────────────────────────────────────────────
export function Sessions() {
  const { sessions, sessionsTab, runAct, join, navigate } = useApp();
  const groups = { upcoming: ['PENDING_PAYMENT', 'CONFIRMED', 'LIVE'], past: ['ENDED', 'RATED'], cancelled: ['CANCELLED', 'REFUNDED'] };
  const list = (sessions || []).filter((s) => groups[sessionsTab]?.includes(s.status));
  const joinAndGo = async (s) => { await join(s.id); navigate('sessionRoom'); };
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 30 }}>My sessions</h1>
      <div className="seg" style={{ marginBottom: 14 }}>
        {['upcoming', 'past', 'cancelled'].map((tab) => (
          <SegOpt key={tab} on={sessionsTab === tab} onClick={() => runAct({ act: 'sessTab', tab })} style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}>{tab}</SegOpt>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, background: 'var(--color-surface)' }}><div style={{ fontSize: 38 }}>📅</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>No {sessionsTab} sessions</div><p className="text-muted" style={{ fontSize: 14 }}>{sessionsTab === 'upcoming' ? 'Book a 1:1 with a verified senior to get started.' : 'Nothing here yet.'}</p>{sessionsTab === 'upcoming' && <Btn variant="pri" go="marketplace">Find a mentor</Btn>}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((s) => (
            <div key={s.id} className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Avatar initials={initialsOf(s.mentorName)} color={colorFor(s.mentorId || s.mentorName)} size={42} />
              <div style={{ flex: 1, minWidth: 140 }}><div style={{ fontWeight: 700 }}>{s.mentorName || 'Mentor'}</div><div className="text-muted" style={{ fontSize: 12 }}>{fmtWhen(s.startsAt)} · {s.durationMin || 25} min · ₹{s.priceINR}</div></div>
              <span className="tag" style={statusStyle(s.status)}>{s.status}{s.rating ? ` · ⭐${s.rating}` : ''}</span>
              {s.meetingUrl && <a href={s.meetingUrl} target="_blank" rel="noreferrer" className="text-muted" style={{ fontSize: 13 }} title={s.meetingProvider === 'stub' ? 'Placeholder Meet link' : 'Google Meet'}>🎥 Meet</a>}
              {s.status === 'PENDING_PAYMENT' && <Btn variant="pri" act="pay" id={s.id}>Pay ₹{s.priceINR}</Btn>}
              {(s.status === 'CONFIRMED' || s.status === 'LIVE') && <Btn variant="pri" onClick={() => joinAndGo(s)}>Join</Btn>}
              {s.status === 'LIVE' && <Btn variant="sec" act="end" id={s.id}>End</Btn>}
              {s.status === 'ENDED' && <Btn variant="pri" go="rateSession">Rate</Btn>}
              {(s.status === 'PENDING_PAYMENT' || s.status === 'CONFIRMED') && <Btn variant="ghost" act="cancel" id={s.id}>Cancel</Btn>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Session Room — 1:1 Video Call [CORE] ─────────────────────────────────────
export function SessionRoom() {
  const { sessions, sessTime, camOn, micOn, chat, chatDraft, update, sendChat, runAct, navigate, end } = useApp();
  const sess = (sessions || []).find((s) => s.status === 'LIVE') || (sessions || []).find((s) => s.status === 'CONFIRMED') || null;
  const name = sess?.mentorName || 'Your mentor';
  const chatStyled = chat.map((m) => ({ ...m, style: { alignSelf: m.who === 'me' ? 'flex-end' : 'flex-start', background: m.who === 'me' ? 'var(--color-accent)' : 'var(--color-surface)', color: m.who === 'me' ? 'var(--color-bg)' : 'var(--color-text)', fontSize: 13, borderRadius: 14, padding: '8px 11px', maxWidth: '82%' } }));
  const endAndRate = async () => { if (sess) await end(sess.id); navigate('rateSession'); };
  return (
    <section style={{ background: 'var(--color-neutral-900)', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', color: '#fff', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#5fce7f', animation: 'pulse 1.6s infinite' }} /><span style={{ fontSize: 14 }}>{sess ? 'Connected · 25-min session' : 'No active session'}</span></div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, background: 'rgba(255,255,255,.1)', padding: '4px 16px', borderRadius: 999 }}>{fmtTime(sessTime)} <span style={{ opacity: .5, fontSize: 14 }}>/ 25:00</span></div>
        {sess?.meetingUrl && <a href={sess.meetingUrl} target="_blank" rel="noreferrer" className="sc-btn sec" style={{ textDecoration: 'none', padding: '4px 14px' }}>🎥 Open Google Meet{sess.meetingProvider === 'stub' ? ' (placeholder)' : ''}</a>}
      </div>
      <div className="session-body" style={{ flex: 1, display: 'flex', gap: 14, padding: '0 20px 14px', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 320, borderRadius: 20, background: 'linear-gradient(135deg,#56633f,#3d472b)', position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <span style={{ width: 96, height: 96, borderRadius: '50%', background: '#c67139', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 40 }}>{initialsOf(name)}</span>
            <div style={{ position: 'absolute', bottom: 14, left: 16, color: '#fff', fontSize: 14, background: 'rgba(0,0,0,.35)', padding: '4px 12px', borderRadius: 999 }}>{name}</div>
            <div style={{ position: 'absolute', top: 14, right: 16, width: 150, height: 100, borderRadius: 14, background: '#201e1d', border: '2px solid rgba(255,255,255,.2)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12 }}>{camOn ? 'You' : 'Camera off'}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button className="sc-btn" onClick={() => runAct({ act: 'toggleMic' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{micOn ? '🎤' : '🔇'}</button>
            <button className="sc-btn" onClick={() => runAct({ act: 'toggleCam' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{camOn ? '📷' : '🚫'}</button>
            <button className="sc-btn" onClick={() => runAct({ act: 'toast', msg: 'Screen sharing started' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>🖥</button>
            <button className="sc-btn" onClick={() => runAct({ act: 'toast', msg: 'Reported to support' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>⚑</button>
            <button className="sc-btn" onClick={endAndRate} style={{ background: '#a8442e', color: '#fff', padding: '0 22px', borderRadius: 999 }}>End session</button>
          </div>
        </div>
        <aside className="session-chat" style={{ flex: 'none', width: 300, background: 'var(--color-bg)', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-divider)', fontFamily: 'var(--font-heading)', fontSize: 15 }}>Chat</div>
          {/* TODO(owner): in-call chat is local-only until a realtime chat channel is wired. */}
          <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 160 }}>
            {chatStyled.map((m, i) => <div key={i} style={m.style}>{m.t}</div>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} style={{ padding: 10, borderTop: '1px solid var(--color-divider)', display: 'flex', gap: 6 }}>
            <Input placeholder="Message…" value={chatDraft} onChange={(e) => update({ chatDraft: e.target.value })} style={{ flex: 1 }} />
            <Btn variant="pri" onClick={(e) => { e.preventDefault(); sendChat(); }}>Send</Btn>
          </form>
        </aside>
      </div>
    </section>
  );
}

// ── Post-Session — Rate & Review ──────────────────────────────────────────────
export function RateSession() {
  const { sessions, rate, navigate } = useApp();
  const sess = [...(sessions || [])].reverse().find((s) => s.status === 'ENDED') || [...(sessions || [])].reverse().find((s) => s.status === 'RATED') || null;
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const name = sess?.mentorName || 'your mentor';
  const submit = async () => {
    setBusy(true);
    try { if (sess) await rate(sess.id, stars, comment); navigate('dashboard'); } finally { setBusy(false); }
  };
  return (
    <section style={{ maxWidth: 560, margin: '0 auto', padding: '40px 22px' }}>
      <div className="card elev-md" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', padding: 32 }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 26 }}>{initialsOf(name)}</div>
        <h2 style={{ margin: '6px 0 0' }}>How was your session?</h2>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>with {name}</p>
        <div style={{ fontSize: 34, letterSpacing: 6, cursor: 'pointer' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} onClick={() => setStars(n)} style={{ opacity: n <= stars ? 1 : 0.3 }}>⭐</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}><Tag style={{ cursor: 'pointer' }}>Helpful</Tag><Tag style={{ cursor: 'pointer' }}>Honest</Tag><Tag style={{ cursor: 'pointer' }}>Knowledgeable</Tag></div>
        <textarea className="input" placeholder="Write a review (optional)…" value={comment} onChange={(e) => setComment(e.target.value)} />
        <Btn variant="pri" onClick={submit} block disabled={busy}>{busy ? 'Submitting…' : 'Submit review'}</Btn>
        <Btn variant="ghost" go="marketplace">Book another session</Btn>
      </div>
    </section>
  );
}

// ── Counselling Timeline / Deadlines ──────────────────────────────────────────
export function Timeline() {
  // TODO(owner): JoSAA round dates are seasonal reference data — wire to a rounds
  // endpoint (or CMS) when available. Static for now.
  const toneStyle = (tone) => tone === 'accent-2' ? { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' } : tone === 'accent' ? { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' } : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)' };
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 30 }}>Counselling timeline</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 16 }}>JoSAA 2026 rounds. We&apos;ll remind you before every deadline.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {ROUNDS.map((r) => (
          <div key={r.title} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ width: 16, height: 16, borderRadius: '50%', background: r.dot, border: '3px solid var(--color-bg)', boxShadow: `0 0 0 2px ${r.dot}` }} /><span style={{ flex: 1, width: 2, background: 'var(--color-divider)' }} /></div>
            <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginBottom: 12, flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{r.title}</div><span className="tag" style={toneStyle(r.tone)}>{r.status}</span></div><div className="text-muted" style={{ fontSize: 13 }}>{r.date} · {r.desc}</div></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ background: 'var(--color-accent-100)', marginTop: 6 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Freeze / Float / Slide — in plain words</div><div style={{ fontSize: 13, lineHeight: 1.7 }}><strong>Freeze:</strong> Happy with your seat — lock it, exit counselling.<br /><strong>Float:</strong> Keep this seat but stay open to any better option.<br /><strong>Slide:</strong> Keep this college, but try for a better branch in it.</div></div>
    </section>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────
export function Notifications() {
  const { notifications, unreadCount, runAct } = useApp();
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}><h1 style={{ margin: 0, fontSize: 30 }}>Notifications</h1><div style={{ display: 'flex', gap: 8 }}>{unreadCount > 0 && <Btn variant="sec" act="markAllRead">Mark all read</Btn>}<Btn variant="ghost" go="settings">Settings</Btn></div></div>
      {notifications.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, background: 'var(--color-surface)', marginTop: 14 }}><div style={{ fontSize: 38 }}>🔔</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>You&apos;re all caught up</div><p className="text-muted" style={{ fontSize: 14 }}>Deadline reminders, booking updates and mentor replies will appear here.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {notifications.map((n) => (
            <div key={n.id} onClick={() => !n.read && runAct({ act: 'markNotifRead', id: n.id })} className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 12, alignItems: 'flex-start', cursor: n.read ? 'default' : 'pointer', ...(!n.read ? { borderLeft: '4px solid var(--color-accent)' } : {}) }}>
              <span style={{ fontSize: 20 }}>{n.read ? '✅' : '🔔'}</span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{n.title}</div><div className="text-muted" style={{ fontSize: 13 }}>{n.body}</div></div>
              {n.link && <a href={n.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 13 }}>🎥</a>}
              <span className="text-muted" style={{ fontSize: 11 }}>{fmtDate(n.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Help / Support ────────────────────────────────────────────────────────────
export function Help() {
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 30 }}>Help &amp; support</h1>
      <Field><Input placeholder="Search help articles…" /></Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {FAQS.slice(0, 3).map((f, i) => (
          <details key={i} className="card" style={{ background: 'var(--color-surface)' }}><summary style={{ fontFamily: 'var(--font-heading)', fontSize: 15, cursor: 'pointer' }}>{f.q}</summary><p style={{ fontSize: 13, margin: '8px 0 0' }} className="text-muted">{f.a}</p></details>
        ))}
      </div>
      <div className="card" style={{ background: 'var(--color-accent-100)', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Still stuck?</div><div className="text-muted" style={{ fontSize: 13 }}>We reply within a few hours during season.</div></div><Btn variant="pri" act="toast" msg="Chat opened">Chat with us</Btn></div>
    </section>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function Settings() {
  const { runAct } = useApp();
  return (
    <section style={{ maxWidth: 640, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 14px', fontSize: 30 }}>Settings</h1>
      {SETTING_GROUPS.map((g) => (
        <div key={g.title} className="card" style={{ background: 'var(--color-surface)', marginBottom: 12 }}>
          <div className="card-kicker">{g.title}</div>
          {g.rows.map((r, i) => (
            <div key={i} className="sc-row" onClick={() => runAct({ go: r.go, act: r.act, msg: r.msg })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 4px', fontSize: 14, cursor: 'pointer' }}>{r.label}<span className="text-muted">{r.val} ›</span></div>
          ))}
        </div>
      ))}
      <Btn variant="sec" act="logout" block>Log out</Btn>
      <Btn variant="ghost" act="toast" msg="Account deletion requested" block style={{ color: '#a8442e' }}>Delete account</Btn>
    </section>
  );
}

// ── Payment History / Receipts ────────────────────────────────────────────────
export function Receipts() {
  const { sessions } = useApp();
  const paidStatuses = { CONFIRMED: 'Paid', LIVE: 'Paid', ENDED: 'Paid', RATED: 'Paid', REFUNDED: 'Refunded' };
  const rows = (sessions || []).filter((s) => paidStatuses[s.status]);
  const toneOf = (status) => status === 'REFUNDED' ? { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)' } : { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '24px 22px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 30 }}>Payment history</h1>
      {rows.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40, background: 'var(--color-surface)' }}><div style={{ fontSize: 38 }}>🧾</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>No payments yet</div><p className="text-muted" style={{ fontSize: 14 }}>Your session receipts will appear here after your first booking.</p><Btn variant="pri" go="marketplace">Find a mentor</Btn></div>
      ) : (
        <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 420 }}><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
            {rows.map((s) => <tr key={s.id}><td>{fmtDate(s.startsAt)}</td><td>Session · {s.mentorName || 'Mentor'}</td><td>₹{s.priceINR}</td><td><span className="tag" style={toneOf(s.status)}>{paidStatuses[s.status]}</span></td><td><Btn variant="ghost" act="toast" msg="Receipt downloaded">Receipt</Btn></td></tr>)}
          </tbody></table>
        </div>
      )}
    </section>
  );
}
