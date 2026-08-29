'use client';
// ══════════════════════════════════════════════════════════════════════════
// Super Admin — the owner's control panel.
// Wired to the live admin-ops + marketplace + identity + booking backends:
//   • Phase 7: adminStats / adminAudit / adminSuspendMentor / adminReinstateMentor / adminBroadcast
//   • Phase 11: the verification console (admin-verify.js), mentor directory + interview
//     calendar (admin-mentors.js), audit log (admin-audit.js), shared helpers (admin-shared.js)
// Screens without a backend surface yet render a tidy panel that names the real
// source of truth (see // TODO(owner) markers). Visual design is untouched.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn, Input, Field, Select, SegOpt } from '@/components/ui';
import { COLLEGES, FUNNEL, ADMIN_SCOPES } from '@/lib/data';
import { typeStyle } from '@/lib/logic';
import { CRIT, Note, Status, QUEUE_STATUSES, STATUS_META, durationLabel, stageAverages, useCounts } from './admin-shared';

// Phase 11 screens live in their own files (split by concern); re-exported so the
// screen registry keeps importing everything from `./admin`.
export { AVerifyQueue } from './admin-verify';
export { AMentors, AInterviews } from './admin-mentors';
export { AAudit } from './admin-audit';

// A "not-yet-wired" panel that names the real backend + leaves an owner TODO.
function BackendTODO({ source }) {
  return (
    <Note style={{ marginBottom: 12 }}>
      Illustrative sample. Live data comes from <strong>{source}</strong> — not yet surfaced by an admin
      endpoint. {/* TODO(owner): expose this via the admin-ops service. */}
    </Note>
  );
}

// ── Admin Dashboard ─────────────────────────────────────────────────────────
export function ADashboard() {
  const { runAct } = useApp();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [queueApps, setQueueApps] = useState(null); // loaded queue items → interviews this week + approx stage times
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const { counts } = useCounts();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      // Users directory + queue are best-effort — a stats failure shouldn't blank the whole page.
      const [s, u, q] = await Promise.all([
        liveApi.adminStats(),
        liveApi.adminUsers().catch(() => null),
        Promise.all(QUEUE_STATUSES.map((st) => liveApi.adminMentorQueue({ status: st, limit: 100 }).then((r) => r.items || []).catch(() => []))).then((pages) => pages.flat()),
      ]);
      setStats(s); setUsers(u); setQueueApps(q);
    } catch (e) { setErr(e.message || 'Could not load platform stats'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Queue health (Phase 11): waiting per stage, interviews this week, approximate time per stage.
  const health = useMemo(() => {
    const apps = queueApps || [];
    const now = Date.now(); const week = now + 7 * 86_400_000;
    const interviewsThisWeek = apps.filter((a) => a.status === 'INTERVIEW_SCHEDULED' && a.interview?.interviewAt && Date.parse(a.interview.interviewAt) >= now - 3_600_000 && Date.parse(a.interview.interviewAt) <= week).length;
    const oldest = apps.reduce((m, a) => { const t = Date.parse(a.waitingSince || a.submittedAt || 0); return t && (!m || t < m) ? t : m; }, 0);
    return { interviewsThisWeek, oldestWait: oldest ? durationLabel(now - oldest) : '—', avg: stageAverages(apps) };
  }, [queueApps]);

  const num = (v) => (v == null ? '—' : v.toLocaleString('en-IN'));
  const pending = stats?.mentors?.pendingReview;
  const approved = stats?.mentors?.approved;
  const auditN = stats?.audit?.entries;

  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}><h1 style={{ margin: 0, fontSize: 28 }}>Platform overview</h1><div className="seg"><SegOpt on>In-season</SegOpt><SegOpt>Off-season</SegOpt></div></div>
      {err && <div className="card" style={{ background: '#f7e2db', color: '#7a2d1a', fontSize: 13, marginTop: 12 }}>⚠ {err} — <button className="sc-btn ghost" style={{ padding: '0 6px', color: '#7a2d1a' }} onClick={load}>retry</button></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', cursor: 'pointer' }} onClick={() => runAct({ go: 'aMentors' })}><div className="card-kicker">Approved mentors</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(approved)}</div><div className="text-muted" style={{ fontSize: 11 }}>live count</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)', cursor: 'pointer' }} onClick={() => runAct({ go: 'aVerifyQueue' })}><div className="card-kicker">Pending review</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(counts?.PENDING_REVIEW ?? pending)}</div><div className="text-muted" style={{ fontSize: 11 }}>verification queue</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', cursor: 'pointer' }} onClick={() => runAct({ go: 'aInterviews' })}><div className="card-kicker">Interviews this week</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(health.interviewsThisWeek)}</div><div className="text-muted" style={{ fontSize: 11 }}>{counts ? `${num(counts.INTERVIEW_SCHEDULED)} scheduled in total` : 'scheduled'}</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', cursor: 'pointer' }} onClick={() => runAct({ go: 'aModeration' })}><div className="card-kicker">Audit actions</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(auditN)}</div><div className="text-muted" style={{ fontSize: 11 }}>your trail</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', cursor: 'pointer' }} onClick={() => runAct({ go: 'aStudents' })}><div className="card-kicker">Total users</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(users?.total)}</div><div className="text-muted" style={{ fontSize: 11 }}>signed-in accounts</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-2-100)', cursor: 'pointer' }} onClick={() => runAct({ go: 'aStudents' })}><div className="card-kicker">Live now</div><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3fae6b', boxShadow: '0 0 0 3px rgba(63,174,107,.2)' }} /><span style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(users?.liveNow)}</span></div><div className="text-muted" style={{ fontSize: 11 }}>active in last 5 min</div></div>
      </div>
      {/* Queue health (Phase 11) */}
      <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Verification queue health</div>
          <span className="text-muted" style={{ fontSize: 12 }}>oldest application waiting <strong>{health.oldestWait}</strong></span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {QUEUE_STATUSES.map((st) => (
            <div key={st} className="sc-tile" onClick={() => runAct({ go: 'aVerifyQueue' })} style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
              <div className="card-kicker">{STATUS_META[st].label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontFamily: 'var(--font-heading)', fontSize: 24 }}>{counts ? num(counts[st]) : '…'}</span><span className="text-muted" style={{ fontSize: 11.5 }}>waiting</span></div>
              <div className="text-muted" style={{ fontSize: 11.5 }}>≈ {health.avg[st] != null ? durationLabel(health.avg[st]) : '—'} per application in this stage</div>
            </div>
          ))}
        </div>
        <Note>Stage times are <strong>approximate</strong> — averaged from the status history of the applications currently loaded (up to 100 per stage), not a full report.</Note>
      </div>
      <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Sessions &amp; revenue (14 days)</div><svg viewBox="0 0 520 180" style={{ width: '100%', height: 'auto' }}><polyline points="10,150 50,140 90,120 130,125 170,100 210,90 250,70 290,80 330,55 370,45 410,50 450,30 490,25 510,20" fill="none" stroke="var(--color-accent)" strokeWidth="3" /><polyline points="10,165 50,160 90,150 130,155 170,140 210,138 250,120 290,128 330,110 370,100 410,105 450,88 490,82 510,78" fill="none" stroke="var(--color-accent-2)" strokeWidth="3" strokeDasharray="4 4" /></svg><div style={{ display: 'flex', gap: 16, fontSize: 12 }}><span>▬ Revenue</span><span style={{ color: 'var(--color-accent-2-700)' }}>┄ Sessions</span></div><Note style={{ marginTop: 8 }}>Trend line is illustrative — revenue/session rollups are fed by Phase 8 DynamoDB Streams aggregates. {/* TODO(owner) */}</Note></div>
        <div className="card elev-sm" style={{ background: '#f7e2db' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>⚠ Alerts</div><div className="sc-row" onClick={() => runAct({ go: 'aVerifyQueue' })} style={{ fontSize: 13, padding: 8, cursor: 'pointer' }}>🔴 {(counts?.PENDING_REVIEW ?? pending) == null ? '—' : (counts?.PENDING_REVIEW ?? pending)} mentor application{(counts?.PENDING_REVIEW ?? pending) === 1 ? '' : 's'} pending review</div><div className="sc-row" onClick={() => runAct({ go: 'aInterviews' })} style={{ fontSize: 13, padding: 8, cursor: 'pointer' }}>🟠 {counts ? num(counts.DOCS_VERIFIED) : '—'} docs-verified, awaiting an interview slot</div><div className="sc-row" onClick={() => runAct({ go: 'aModeration' })} style={{ fontSize: 13, padding: 8, cursor: 'pointer' }}>🟡 Review the moderation audit trail</div></div>
      </div>
    </section>
  );
}

// ── Users & presence ─────────────────────────────────────────────────────
// Live directory from the identity service: GET /admin/users returns every signed-in
// user + live/active counts (lastSeenAt is bumped on each session bootstrap).
const num = (v) => (v == null ? '—' : v.toLocaleString('en-IN'));
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—');
function agoOf(iso) {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const ROLE_TONE = { student: 'var(--color-accent-2-100)', mentor: 'var(--color-accent-100)', admin: '#f7e2db' };

export function AStudents() {
  const { showToast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await liveApi.adminUsers()); }
    catch (e) { setErr(e.message || 'Could not load users'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const users = data?.users || [];
  const ql = q.trim().toLowerCase();
  const shown = ql ? users.filter((u) => `${u.name || ''} ${u.email || ''} ${u.userId}`.toLowerCase().includes(ql)) : users;

  const stat = (label, value, tone, hint) => (
    <div className="card elev-sm" style={{ background: tone || 'var(--color-surface)' }}>
      <div className="card-kicker">{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(value)}</div>
      {hint && <div className="text-muted" style={{ fontSize: 11 }}>{hint}</div>}
    </div>
  );

  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Users &amp; presence</h1>
        <Btn variant="sec" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
        {stat('Total users', data?.total, 'var(--color-surface)', data?.capped ? 'showing first 5,000' : 'all signed-in users')}
        <div className="card elev-sm" style={{ background: 'var(--color-accent-2-100)' }}>
          <div className="card-kicker">Live now</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3fae6b', boxShadow: '0 0 0 3px rgba(63,174,107,.2)' }} /><span style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(data?.liveNow)}</span></div>
          <div className="text-muted" style={{ fontSize: 11 }}>active in last 5 min</div>
        </div>
        {stat('Active today', data?.activeToday, 'var(--color-surface)', 'last 24 hours')}
        {stat('New today', data?.newToday, 'var(--color-accent-100)', 'signed up in 24h')}
      </div>

      {data?.byRole && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {Object.entries(data.byRole).map(([role, n]) => (
            <span key={role} className="tag" style={{ background: ROLE_TONE[role] || 'var(--color-neutral-200)', textTransform: 'capitalize' }}>{role}: <strong style={{ marginLeft: 4 }}>{num(n)}</strong></span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, margin: '14px 0 12px' }}>
        <Input placeholder="Search name / email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <Btn variant="sec" onClick={() => showToast('CSV export is an owner TODO — the data is live above.')}>Export</Btn>
      </div>

      <Status loading={loading && !data} err={err} empty={!!data && shown.length === 0} emptyMsg={ql ? 'No users match that search.' : 'No signed-in users yet.'} onRetry={load}>
        <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 620 }}>
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Joined</th><th>Last seen</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.userId}>
                  <td>{u.name || <span className="text-muted">—</span>}</td>
                  <td style={{ fontSize: 12.5 }}>{u.email || <span className="text-muted">—</span>}</td>
                  <td><span className="tag" style={{ background: ROLE_TONE[u.role] || 'var(--color-neutral-200)', textTransform: 'capitalize' }}>{u.role}</span></td>
                  <td>{fmtDay(u.createdAt)}</td>
                  <td style={{ fontSize: 12.5 }}>{agoOf(u.lastSeenAt)}</td>
                  <td>{u.live ? <span style={{ color: '#2c7a4b', fontSize: 12.5 }}>● Live</span> : u.activeToday ? <span className="text-muted" style={{ fontSize: 12.5 }}>Today</span> : <span className="text-muted" style={{ fontSize: 12.5 }}>Offline</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Status>
      {data?.capped && <Note style={{ marginTop: 10 }}>Over 5,000 users — the list is capped. {/* TODO(owner): move counts to a Streams-fed Stats rollup for exact totals at scale. */}</Note>}
    </section>
  );
}

// ── College & Cutoff Data Management [CRITICAL] ───────────────────────────
export function ACollegeData() {
  const rows = COLLEGES.slice(0, 7).map((c) => ({ ...c, seats: Math.round(c.close / 8) + 20 }));
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h1 style={{ margin: 0, fontSize: 26 }}>College &amp; cutoff data</h1><span className="tag" style={CRIT}>CRITICAL</span><span className="tag tag-neutral">Data version 2025.2</span></div>
      <p className="text-muted" style={{ fontSize: 14 }}>The database the predictor reads from. Accuracy here is the product&apos;s credibility.</p>
      <BackendTODO source="the catalog service (colleges/cutoffs DynamoDB dataset)" />
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}><Btn variant="pri" act="toast" msg="Cutoff import is an owner TODO">⬆ Import 2026 cutoffs</Btn><Btn variant="sec" act="toast" msg="Spot-check tooling is an owner TODO">🔍 Spot-check predictions</Btn></div>
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 620 }}><thead><tr><th>College</th><th>Type</th><th>Branch</th><th>2025 close (Open)</th><th>Seats</th><th></th></tr></thead><tbody>
        {rows.map((c) => <tr key={c.id}><td>{c.college}</td><td><span className="tag" style={typeStyle(c.type)}>{c.type}</span></td><td>{c.branch}</td><td>{c.close}</td><td>{c.seats}</td><td><Btn variant="ghost" act="toast" msg="Cutoff editing is an owner TODO">Edit</Btn></td></tr>)}
      </tbody></table></div>
    </section>
  );
}

// ── College Content Management ────────────────────────────────────────────
export function AContent() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>College content management</h1>
      <BackendTODO source="the catalog/content service (per-college CMS)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">Descriptions &amp; media</div><p className="card-body">Edit overviews, placements, fees, photos and hostel info per college.</p><Btn variant="sec" act="toast" msg="Content editing is an owner TODO">Edit content</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">Review moderation</div><p className="card-body">College reviews awaiting moderation.</p><Btn variant="sec" go="aModeration">Moderate</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">&quot;Things to know&quot;</div><p className="card-body">Curate honest pros &amp; cons shown on analysis pages.</p><Btn variant="sec" act="toast" msg="Pros/cons editing is an owner TODO">Curate</Btn></div>
      </div>
    </section>
  );
}

// A KPI tile + a session-status colour.
function Kpi({ label, v, tone }) {
  const bg = tone === 'ok' ? 'var(--color-accent-2-100)' : tone === 'accent' ? 'var(--color-accent-100)' : 'var(--color-surface)';
  return <div className="card elev-sm" style={{ background: bg, minWidth: 140, flex: 1 }}><div className="card-kicker">{label}</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{v == null ? '—' : v}</div></div>;
}
const PAID_STATUSES = ['CONFIRMED', 'LIVE', 'ENDED', 'RATED'];
function sessTone(status) {
  if (['CONFIRMED', 'LIVE', 'ENDED', 'RATED'].includes(status)) return { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' };
  if (['REQUESTED', 'ACCEPTED'].includes(status)) return { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' };
  return CRIT;
}
const fmtWhenAdmin = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

// ── Sessions Monitoring (real, from the booking service) ──────────────────
export function ASessions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await liveApi.adminBookings({ days: 14 })); }
    catch (e) { setErr(e.message || 'Could not load sessions'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const rows = data?.bookings || [];
  const st = data?.stats;
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h1 style={{ margin: 0, fontSize: 26 }}>Sessions</h1><Btn variant="ghost" onClick={load}>↻ Refresh</Btn></div>
      <p className="text-muted" style={{ fontSize: 14 }}>Every request → acceptance → confirmed session, last 14 days.</p>
      {st && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '8px 0 14px' }}><Kpi label="Sessions" v={st.total} /><Kpi label="Confirmed/paid" v={st.paid} tone="ok" /><Kpi label="Requests/other" v={st.unpaid} tone="accent" /></div>}
      <Status loading={loading} err={err} empty={rows.length === 0} emptyMsg="No sessions in the last 14 days." onRetry={load}>
        <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 660 }}>
          <thead><tr><th>When</th><th>Mentor</th><th>Student</th><th>Status</th><th>₹</th></tr></thead>
          <tbody>{rows.map((b) => <tr key={b.id}><td>{fmtWhenAdmin(b.startsAt || b.createdAt)}</td><td>{b.mentorName || (b.mentorId || '').slice(0, 8)}</td><td>{(b.studentId || '').slice(0, 8)}…</td><td><span className="tag" style={sessTone(b.status)}>{b.status}</span></td><td>{b.priceINR ?? '—'}</td></tr>)}</tbody>
        </table></div>
      </Status>
    </section>
  );
}

// ── Payments (real paid/unpaid + revenue) ─────────────────────────────────
export function APayments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await liveApi.adminBookings({ days: 30 })); }
    catch (e) { setErr(e.message || 'Could not load payments'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const st = data?.stats;
  const paid = (data?.bookings || []).filter((b) => PAID_STATUSES.includes(b.status));
  const inr = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h1 style={{ margin: 0, fontSize: 26 }}>Payments</h1><Btn variant="ghost" onClick={load}>↻ Refresh</Btn></div>
      <p className="text-muted" style={{ fontSize: 14 }}>Paid vs unpaid across the last 30 days. Revenue = confirmed sessions × price.</p>
      {st && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '8px 0 14px' }}><Kpi label="Revenue (30d)" v={inr(st.revenueINR)} tone="accent" /><Kpi label="Paid sessions" v={st.paid} tone="ok" /><Kpi label="Unpaid / pending" v={st.unpaid} /></div>}
      <Status loading={loading} err={err} empty={paid.length === 0} emptyMsg="No payments in the last 30 days." onRetry={load}>
        <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 640 }}>
          <thead><tr><th>When</th><th>Mentor</th><th>Amount</th><th>Mentor cut (80%)</th><th>Status</th></tr></thead>
          <tbody>{paid.map((b) => <tr key={b.id}><td>{fmtWhenAdmin(b.createdAt)}</td><td>{b.mentorName || (b.mentorId || '').slice(0, 8)}</td><td>{inr(b.priceINR)}</td><td>{inr(Math.round((b.priceINR || 0) * 0.8))}</td><td><span className="tag" style={sessTone(b.status)}>{b.status}</span></td></tr>)}</tbody>
        </table></div>
      </Status>
    </section>
  );
}

// ── Reviews & Moderation (Trust & Safety) ─────────────────────────────────
// Live moderation: suspend / reinstate a mentor by id + the real admin audit trail.
export function AModeration() {
  const { showToast } = useApp();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const loadAudit = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const r = await liveApi.adminAudit({ limit: 25 }); setAudit(r?.entries ?? []); }
    catch (e) { setErr(e.message || 'Could not load the audit trail'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadAudit(); }, [loadAudit]);

  const act = async (kind) => {
    const id = target.trim();
    if (!id) { showToast('Enter a mentor userId first'); return; }
    setBusy(true);
    try {
      if (kind === 'suspend') { await liveApi.adminSuspendMentor(id, reason.trim() || undefined); showToast('Mentor suspended'); }
      else { await liveApi.adminReinstateMentor(id); showToast('Mentor reinstated'); }
      setTarget(''); setReason('');
      await loadAudit();
    } catch (e) { showToast(e.message || 'Moderation action failed'); }
    finally { setBusy(false); }
  };

  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 26 }}>Trust &amp; safety</h1>
      <p className="text-muted" style={{ fontSize: 14 }}>Extra care — many students are minors.</p>

      <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 8 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Mentor moderation</div>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Suspend drops an approved mentor from public search; reinstate restores them. Every action is written to the append-only audit trail.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Mentor userId" style={{ flex: 1, minWidth: 200 }}><Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. cognito sub / userId" /></Field>
          <Field label="Reason (optional)" style={{ flex: 1, minWidth: 200 }}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Policy violation…" /></Field>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="sec" onClick={() => act('suspend')} disabled={busy} style={{ color: '#a8442e' }}>{busy ? '…' : 'Suspend'}</Btn>
          <Btn variant="pri" onClick={() => act('reinstate')} disabled={busy}>{busy ? '…' : 'Reinstate'}</Btn>
        </div>
      </div>

      <div className="card elev-sm" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Audit trail</div>
          <Btn variant="ghost" onClick={loadAudit}>↻ Refresh</Btn>
        </div>
        <Status loading={loading} err={err} empty={audit?.length === 0} emptyMsg="No admin actions recorded yet." onRetry={loadAudit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(audit ?? []).map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, background: 'var(--color-bg)', borderRadius: 10, padding: '7px 10px', flexWrap: 'wrap' }}>
                <span className="tag tag-accent" style={{ padding: '1px 7px' }}>{e.action}</span>
                {e.target && <span className="text-muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>→ {e.target}</span>}
                {e.detail?.reason && <span style={{ fontSize: 12 }}>“{String(e.detail.reason)}”</span>}
                <span className="text-muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{e.at ? new Date(e.at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
        </Status>
      </div>

      <Note style={{ marginTop: 12 }}>
        Reported-content / flagged-session review is not yet a backend surface — reports &amp; refunds are an owner TODO. {/* TODO(owner): reports service */}
      </Note>
    </section>
  );
}

// ── Support / Tickets ─────────────────────────────────────────────────────
export function ASupport() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Support tickets</h1>
      <BackendTODO source="a support/ticketing service (not yet built)" />
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 560 }}><thead><tr><th>#</th><th>User</th><th>Subject</th><th>Status</th><th></th></tr></thead><tbody>
        <tr><td>#912</td><td>Aditya</td><td>Payment not reflecting</td><td><span className="tag tag-accent">Open</span></td><td><Btn variant="ghost" act="toast" msg="Ticketing is an owner TODO">Assign</Btn></td></tr>
        <tr><td>#908</td><td>Riya</td><td>Mentor didn&apos;t join</td><td><span className="tag" style={CRIT}>Urgent</span></td><td><Btn variant="ghost" act="toast" msg="Ticketing is an owner TODO">Reply</Btn></td></tr>
        <tr><td>#901</td><td>Dev</td><td>Can&apos;t edit rank</td><td><span className="tag tag-accent-2">Resolved</span></td><td><Btn variant="ghost" act="toast" msg="Ticketing is an owner TODO">Reopen</Btn></td></tr>
      </tbody></table></div>
    </section>
  );
}

// ── Content / CMS ─────────────────────────────────────────────────────────
export function ACms() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h1 style={{ margin: 0, fontSize: 26 }}>Content / CMS</h1><Btn variant="pri" act="toast" msg="Article editor is an owner TODO">+ New article</Btn></div>
      <BackendTODO source="a content/CMS service (not yet built)" />
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><table className="table"><thead><tr><th>Title</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody><tr><td>How JoSAA counselling works in 2026</td><td>Guide</td><td><span className="tag tag-accent-2">Published</span></td><td><Btn variant="ghost" act="toast" msg="Article editor is an owner TODO">Edit</Btn></td></tr><tr><td>CSE vs ECE: which to pick</td><td>Branch guide</td><td><span className="tag tag-accent">Draft</span></td><td><Btn variant="ghost" act="toast" msg="Article editor is an owner TODO">Edit</Btn></td></tr><tr><td>NIT cutoff trends 2020–2025</td><td>Cutoffs</td><td><span className="tag tag-neutral">Scheduled</span></td><td><Btn variant="ghost" act="toast" msg="Article editor is an owner TODO">Edit</Btn></td></tr></tbody></table></div>
    </section>
  );
}

// ── Broadcast / Announcements ─────────────────────────────────────────────
// Live: publishes one 'admin.broadcast' event → per-user notification fanout.
export function ABroadcast() {
  const { showToast } = useApp();
  const [title, setTitle] = useState('Round 2 results are out');
  const [body, setBody] = useState('Round 2 results are out — review your allotment and decide Freeze / Float / Slide.');
  const [userIds, setUserIds] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const ids = userIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (title.trim().length < 2) { showToast('Title needs at least 2 characters'); return; }
    if (body.trim().length < 2) { showToast('Message needs at least 2 characters'); return; }
    if (ids.length === 0) { showToast('Add at least one recipient userId'); return; }
    setBusy(true);
    try {
      const r = await liveApi.adminBroadcast({ title: title.trim(), body: body.trim(), userIds: ids });
      showToast(`Broadcast sent to ${r?.recipients ?? ids.length} recipient${(r?.recipients ?? ids.length) === 1 ? '' : 's'}`);
    } catch (e) { showToast(e.message || 'Could not send broadcast'); }
    finally { setBusy(false); }
  };

  return (
    <section style={{ padding: '26px 28px 40px', maxWidth: 640 }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Broadcast / announcements</h1>
      <div className="card" style={{ background: 'var(--color-surface)' }}>
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short headline" /></Field>
        <Field label="Message"><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Field label="Recipient userIds (comma-separated)"><Input value={userIds} onChange={(e) => setUserIds(e.target.value)} placeholder="userId-1, userId-2, …" /></Field>
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Publishes one <code>admin.broadcast</code> event → the notifications consumer fans it out to one in-app notification per userId. Email/push channels &amp; segment targeting are an owner TODO.</p>
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Templates</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="tag tag-outline" style={{ cursor: 'pointer' }} onClick={() => { setTitle('Round results out'); setBody('Round results are out — review your allotment and decide Freeze / Float / Slide.'); }}>Round X results out</span>
          <span className="tag tag-outline" style={{ cursor: 'pointer' }} onClick={() => { setTitle('Deadline reminder'); setBody('Reminder: the choice-locking deadline is approaching. Lock your list before it closes.'); }}>Deadline reminder</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="pri" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send now'}</Btn>
          <Btn variant="sec" act="toast" msg="Scheduling is an owner TODO">Schedule</Btn>
        </div>
      </div>
    </section>
  );
}

// ── Analytics & Reports ───────────────────────────────────────────────────
export function AAnalytics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setStats(await liveApi.adminStats()); }
    catch (e) { setErr(e.message || 'Could not load stats'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const num = (v) => (v == null ? '—' : v.toLocaleString('en-IN'));
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Analytics &amp; reports</h1>
      {err && <div className="card" style={{ background: '#f7e2db', color: '#7a2d1a', fontSize: 13, marginBottom: 12 }}>⚠ {err} — <button className="sc-btn ghost" style={{ padding: '0 6px', color: '#7a2d1a' }} onClick={load}>retry</button></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Approved mentors</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(stats?.mentors?.approved)}</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">Pending review</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(stats?.mentors?.pendingReview)}</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Audit actions</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{loading ? '…' : num(stats?.audit?.entries)}</div></div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Conversion funnel</div>
        {FUNNEL.map((f) => (
          <div key={f.label} style={{ margin: '6px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{f.label}</span><span>{f.n}</span></div><div style={{ height: 22, borderRadius: 8, background: 'var(--color-neutral-200)', overflow: 'hidden' }}><div style={{ height: '100%', background: 'var(--color-accent)', width: f.w }} /></div></div>
        ))}
        <Note style={{ marginTop: 10 }}>Funnel &amp; leaderboards below are illustrative. Deep analytics (funnels, cohort retention, popular-college &amp; top-mentor rollups) live in <strong>S3 + Athena</strong> off the event/stream firehose — surfaced here as a report export is an owner TODO.</Note>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}><div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Popular colleges</div><div style={{ fontSize: 13, lineHeight: 1.9 }}>1. IIT Bombay CSE<br />2. NIT Trichy CSE<br />3. IIT Delhi CSE</div></div><div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Top mentors</div><div style={{ fontSize: 13, lineHeight: 1.9 }}>1. Ananya Rao — 143<br />2. Aarav Sharma — 128<br />3. Priya Menon — 96</div></div></div>
    </section>
  );
}

// ── Platform Settings / Config ────────────────────────────────────────────
export function ASettings() {
  return (
    <section style={{ padding: '26px 28px 40px', maxWidth: 640 }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Platform settings</h1>
      <BackendTODO source="a platform-config service (pricing, rounds &amp; feature flags)" />
      <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Pricing</div><div style={{ display: 'flex', gap: 10 }}><Field label="Session price (₹)" style={{ flex: 1 }}><Input defaultValue="100" /></Field><Field label="Platform fee (%)" style={{ flex: 1 }}><Input defaultValue="20" /></Field></div></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div className="card-kicker">Counselling dates</div><Field label="Current round"><Select defaultValue="Round 2"><option>Round 1</option><option>Round 2</option><option>Round 3</option></Select></Field></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div className="card-kicker">Feature flags</div><label className="radio"><input type="checkbox" defaultChecked /><span className="dot" />Mentor marketplace live</label><label className="radio"><input type="checkbox" defaultChecked /><span className="dot" />Auto-approve .ac.in emails</label><label className="radio"><input type="checkbox" /><span className="dot" />Premium bundles</label></div>
      <Btn variant="pri" act="toast" msg="Config persistence is an owner TODO" style={{ marginTop: 14 }}>Save config</Btn>
    </section>
  );
}

// ── Admins & permissions (superadmin only) ───────────────────────────────────
export function AAdmins() {
  const { isSuperadmin, profile } = useApp();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [newId, setNewId] = useState('');
  const [newScopes, setNewScopes] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await liveApi.adminAdmins()); setErr(null); }
    catch (e) { setErr(e.message || 'Could not load admins'); }
  }, []);
  useEffect(() => { if (isSuperadmin) load(); }, [isSuperadmin, load]);

  if (!isSuperadmin) return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '26px 24px' }}>
      <h1 style={{ fontSize: 28 }}>Admins</h1>
      <div className="card" style={{ background: 'var(--color-surface)' }}>Only the superadmin can manage the admin team.</div>
    </section>
  );

  const toggle = (list, set, s) => set(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);
  const promote = async () => {
    if (!newId.trim()) { setErr('Enter the user id to promote.'); return; }
    setBusy(true);
    try { await liveApi.promoteAdmin(newId.trim(), newScopes); setNewId(''); setNewScopes([]); await load(); }
    catch (e) { setErr(e.message || 'Could not add admin'); }
    finally { setBusy(false); }
  };

  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 28 }}>Admins &amp; permissions</h1>
      <p className="text-muted" style={{ fontSize: 14, marginBottom: 8 }}>You&apos;re the <strong>superadmin</strong>. Promote trusted users to admin and choose exactly what each one can do.</p>
      <Note style={{ marginBottom: 16 }}>🔑 Permissions travel inside the admin&apos;s sign-in token. A change you save here takes effect on their <strong>next sign-in</strong> (or the next silent token refresh) — until then the API still enforces their previous permissions. Every promotion, scope change and demotion is written to the audit log.</Note>
      {err && <div className="card" style={{ background: '#f7e2db', color: '#7a2d1a', marginBottom: 12 }}>{err}</div>}

      <div className="card" style={{ background: 'var(--color-surface)', marginBottom: 16 }}>
        <div className="card-kicker">Add an admin</div>
        <Field label="User ID (copy it from the Users directory)"><Input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="e.g. d1d37d3a-5041-7022-..." /></Field>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginBottom: 6 }}>Permissions to grant</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ADMIN_SCOPES.map((s) => (
            <span key={s.key} className={newScopes.includes(s.key) ? 'tag tag-accent' : 'tag tag-neutral'} onClick={() => toggle(newScopes, setNewScopes, s.key)} style={{ cursor: 'pointer' }} title={s.desc}>{s.label}{newScopes.includes(s.key) ? ' ✓' : ''}</span>
          ))}
        </div>
        <Btn variant="pri" onClick={promote} disabled={busy} style={{ alignSelf: 'flex-start', marginTop: 10 }}>{busy ? 'Adding…' : 'Make admin'}</Btn>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(data?.admins || []).map((a) => <AdminRow key={a.userId} a={a} me={profile?.userId} onChanged={load} />)}
        {data && data.admins.length === 0 && <div className="card" style={{ background: 'var(--color-surface)' }}>No admins yet.</div>}
        {!data && !err && <p className="text-muted">Loading admins…</p>}
      </div>
    </section>
  );
}

function AdminRow({ a, me, onChanged }) {
  const [scopes, setScopes] = useState(a.permissions || []);
  const [busy, setBusy] = useState(false);
  const isSuper = a.role === 'superadmin';
  const toggle = (s) => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s]);
  const save = async () => { setBusy(true); try { await liveApi.updateAdmin(a.userId, scopes); await onChanged(); } finally { setBusy(false); } };
  const demote = async () => { setBusy(true); try { await liveApi.demoteAdmin(a.userId); await onChanged(); } finally { setBusy(false); } };
  return (
    <div className="card" style={{ background: 'var(--color-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{a.name || a.email || a.userId}</span>
        <span className={isSuper ? 'tag tag-accent' : 'tag tag-accent-2'}>{isSuper ? '👑 Superadmin' : 'Admin'}</span>
        {a.email && <span className="text-muted" style={{ fontSize: 12 }}>{a.email}</span>}
      </div>
      {isSuper ? (
        <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Full access — managed out-of-band.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {ADMIN_SCOPES.map((s) => (
              <span key={s.key} className={scopes.includes(s.key) ? 'tag tag-accent' : 'tag tag-neutral'} onClick={() => toggle(s.key)} style={{ cursor: 'pointer' }} title={s.desc}>{s.label}{scopes.includes(s.key) ? ' ✓' : ''}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn variant="pri" onClick={save} disabled={busy}>Save permissions</Btn><span className="text-muted" style={{ fontSize: 11.5 }}>applies on their next sign-in</span>
            {a.userId !== me && <Btn variant="ghost" onClick={demote} disabled={busy} style={{ color: '#a8442e' }}>Demote to student</Btn>}
          </div>
        </>
      )}
    </div>
  );
}
