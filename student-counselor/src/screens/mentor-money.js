'use client';
// ══════════════════════════════════════════════════════════════════════════
// Earnings & payouts + Ratings & feedback (Phase 11 packet 6). Read from the
// mentor's own session rows (the booking ledger is the source of truth);
// payout batching is not built — shown honestly, never faked.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { Status, useMentorProfile, useMyMentoringSessions, useMentorGate, GateCard, SuspendedBanner, MENTOR_SHARE, inr, fmtDate, isDone, isPaid, WARN } from './mentor-shared';

const monthKey = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—');

export function MEarnings() {
  const { loadSessions } = useApp();
  const gate = useMentorGate();
  const mySessions = useMyMentoringSessions();
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setLoading(true); await loadSessions(); setLoading(false); })(); }, [loadSessions]);

  const paid = useMemo(() => mySessions.filter(isPaid).sort((a, b) => new Date(b.startsAt || 0) - new Date(a.startsAt || 0)), [mySessions]);
  const released = paid.filter(isDone);
  const pending = paid.filter((s) => !isDone(s));
  const net = (list) => list.reduce((sum, s) => sum + (s.priceINR || 0) * MENTOR_SHARE, 0);

  if (!gate.unlocked) return <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}><h1 style={{ margin: 0, fontSize: 28 }}>Earnings &amp; payouts</h1><GateCard /></section>;
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <SuspendedBanner />
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Earnings &amp; payouts</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-2-100)' }}><div className="card-kicker">Released (delivered)</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{inr(net(released))}</div><div className="text-muted" style={{ fontSize: 11 }}>{released.length} completed session{released.length === 1 ? '' : 's'}</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">Pending (paid, upcoming)</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{inr(net(pending))}</div><div className="text-muted" style={{ fontSize: 11 }}>{pending.length} booked, not yet delivered</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Gross · fee</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{inr(paid.reduce((n, s) => n + (s.priceINR || 0), 0))}</div><div className="text-muted" style={{ fontSize: 11 }}>platform fee {Math.round((1 - MENTOR_SHARE) * 100)}% · you keep {Math.round(MENTOR_SHARE * 100)}%</div></div>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Per-session breakdown</div>
        <Status loading={loading} empty={paid.length === 0} emptyMsg="No paid sessions yet — earnings appear here once a student pays for a session.">
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 560 }}>
              <thead><tr><th>Date</th><th>Student</th><th>Gross</th><th>Platform ({Math.round((1 - MENTOR_SHARE) * 100)}%)</th><th>Net to you</th><th>Status</th></tr></thead>
              <tbody>
                {paid.map((s) => { const fee = s.priceINR || 0; return (
                  <tr key={s.id}><td>{fmtDate(s.startsAt)}</td><td>{s.studentName || 'Student'}</td><td>{inr(fee)}</td><td>{inr(fee * (1 - MENTOR_SHARE))}</td><td><strong>{inr(fee * MENTOR_SHARE)}</strong></td><td><span className="tag" style={isDone(s) ? { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)' } : WARN}>{isDone(s) ? 'Released' : 'Pending'}</span></td></tr>
                ); })}
              </tbody>
            </table>
          </div>
        </Status>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Payouts</div>
        <div style={{ ...WARN, borderRadius: 10, padding: '9px 12px', fontSize: 12.5 }}>
          <strong>Coming soon.</strong> Released earnings are tracked in the booking ledger, but automated payouts (UPI/bank batching) aren&apos;t built yet — we settle manually for now and will add payout history + a payout method here. Nothing shown above is an estimate: it&apos;s exactly what students paid.
        </div>
        <div className="text-muted" style={{ fontSize: 12.5 }}>Payout history: none yet.</div>
      </div>
    </section>
  );
}

export function MReviews() {
  const { mentor, loading: mLoading } = useMentorProfile();
  const { loadSessions } = useApp();
  const gate = useMentorGate();
  const mySessions = useMyMentoringSessions();
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setLoading(true); await loadSessions(); setLoading(false); })(); }, [loadSessions]);

  const rated = useMemo(() => mySessions.filter((s) => s.rating != null).sort((a, b) => new Date(b.startsAt || 0) - new Date(a.startsAt || 0)), [mySessions]);
  const dist = useMemo(() => [5, 4, 3, 2, 1].map((n) => ({ n, c: rated.filter((s) => Math.round(s.rating) === n).length })), [rated]);
  const trend = useMemo(() => {
    const by = new Map();
    for (const s of [...rated].reverse()) { const k = monthKey(s.startsAt); const e = by.get(k) || { sum: 0, n: 0 }; e.sum += s.rating; e.n += 1; by.set(k, e); }
    return [...by.entries()].map(([k, e]) => ({ k, avg: e.sum / e.n, n: e.n }));
  }, [rated]);
  const localAvg = rated.length ? rated.reduce((a, s) => a + s.rating, 0) / rated.length : null;
  const avg = mentor?.ratingCount ? mentor.ratingAvg : localAvg;
  const count = mentor?.ratingCount || rated.length;

  if (!gate.unlocked) return <section style={{ maxWidth: 680, margin: '0 auto', padding: '26px 24px 40px' }}><h1 style={{ margin: 0, fontSize: 28 }}>Reviews &amp; ratings</h1><GateCard /></section>;
  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '26px 24px 40px' }}>
      <SuspendedBanner />
      <h1 style={{ margin: '0 0 2px', fontSize: 28 }}>Reviews &amp; ratings</h1>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 40 }}>{avg != null ? Number(avg).toFixed(1) : '—'}</span>
        <span className="text-muted">⭐ from {count} rated session{count === 1 ? '' : 's'}</span>
      </div>
      <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
        <div className="card" style={{ background: 'var(--color-surface)' }}>
          <div className="card-kicker">Distribution</div>
          {dist.map(({ n, c }) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><span style={{ width: 22 }}>{n}★</span><div style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--color-neutral-200)', overflow: 'hidden' }}><div style={{ height: '100%', width: rated.length ? `${(c / rated.length) * 100}%` : 0, background: 'var(--color-accent)' }} /></div><span className="text-muted" style={{ width: 20, textAlign: 'right' }}>{c}</span></div>
          ))}
        </div>
        <div className="card" style={{ background: 'var(--color-surface)' }}>
          <div className="card-kicker">Trend (monthly average)</div>
          {trend.length === 0 ? <span className="text-muted" style={{ fontSize: 13 }}>No ratings yet.</span> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70 }}>
              {trend.map((t) => <div key={t.k} title={`${t.k}: ${t.avg.toFixed(1)} (${t.n})`} style={{ flex: 1, textAlign: 'center', fontSize: 10 }}><div style={{ height: `${(t.avg / 5) * 50}px`, background: 'var(--color-accent-2-500)', borderRadius: 6 }} /><div>{t.avg.toFixed(1)}</div><div className="text-muted">{t.k}</div></div>)}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <Status loading={loading || mLoading} empty={rated.length === 0} emptyMsg="No reviews yet — ratings appear here after students rate a completed session.">
          {rated.map((s) => (
            <div key={s.id} className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontWeight: 700, fontSize: 14 }}>{s.studentName || 'Student'} · {fmtDate(s.startsAt)}</div><div>{'⭐'.repeat(Math.max(0, Math.min(5, Math.round(s.rating || 0))))}</div></div>
              {(s.ratingComment || s.comment) && <p style={{ fontSize: 13, margin: '4px 0 0' }}>“{s.ratingComment || s.comment}”</p>}
            </div>
          ))}
        </Status>
      </div>
    </section>
  );
}
