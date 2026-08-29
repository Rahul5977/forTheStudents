'use client';
// ══════════════════════════════════════════════════════════════════════════
// Students & prep (Phase 11 packet 6): for each upcoming BOOKED session, the
// student's first name + counselling inputs (rank, category, home state, target
// branches, note) from GET /sessions/:id/student-prep. Read-only, per booked
// session only — never a browsable student directory. Approved mentors only.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn } from '@/components/ui';
import { Status, useMyMentoringSessions, useMentorGate, GateCard, SuspendedBanner, fmtFull, initialsOf, isUpcoming, statusStyle, WARN } from './mentor-shared';

const RANK_LABEL = { advRank: 'JEE Advanced', mainRank: 'JEE Main' };

function PrepCard({ session }) {
  const [prep, setPrep] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let on = true;
    liveApi.sessionStudentPrep(session.id)
      .then((r) => { if (on) setPrep(r); })
      .catch((e) => { if (on) setErr(e.message || 'Could not load the prep sheet'); });
    return () => { on = false; };
  }, [session.id]);
  const st = prep?.student || {};
  const name = st.firstName || session.studentName || 'Student';
  const ranks = ['advRank', 'mainRank'].filter((k) => st[k] > 0);
  return (
    <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{initialsOf(name)}</span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>{fmtFull(session.startsAt)} · {session.durationMin || 25} min</div>
        </div>
        <span className="tag" style={statusStyle(session.status)}>{session.status}</span>
        <Btn variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Prep sheet'}</Btn>
      </div>
      {open && (
        <Status loading={!prep && !err} err={err}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
            {ranks.length === 0 && <div className="text-muted" style={{ fontSize: 13, gridColumn: '1 / -1' }}>No rank on file yet — ask them at the start of the call.</div>}
            {ranks.map((k) => (
              <div key={k} className="card" style={{ background: 'var(--color-bg)', gap: 2 }}><div className="card-kicker">{RANK_LABEL[k]}</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>AIR {Number(st[k]).toLocaleString('en-IN')}</div></div>
            ))}
            <div className="card" style={{ background: 'var(--color-bg)', gap: 2 }}><div className="card-kicker">Category</div><div style={{ fontSize: 15 }}>{st.category || '—'}{st.pwd ? ' · PwD' : ''}</div></div>
            <div className="card" style={{ background: 'var(--color-bg)', gap: 2 }}><div className="card-kicker">Home state</div><div style={{ fontSize: 15 }}>{st.home || '—'}</div></div>
            <div className="card" style={{ background: 'var(--color-bg)', gap: 2 }}><div className="card-kicker">Priority</div><div style={{ fontSize: 15, textTransform: 'capitalize' }}>{st.priority || '—'}</div></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="card-kicker" style={{ marginBottom: 4 }}>Target branches</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(st.branches || []).length ? st.branches.map((b) => <span key={b} className="tag tag-accent">{b}</span>) : <span className="text-muted" style={{ fontSize: 13 }}>Not set</span>}
            </div>
          </div>
          <div style={{ marginTop: 10, background: 'var(--color-bg)', borderRadius: 12, padding: '9px 12px', fontSize: 13 }}>
            <strong>Their note:</strong> {prep?.note ? <span>“{prep.note}”</span> : <span className="text-muted">none left</span>}
          </div>
          <p className="text-muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>Shared only because this student booked you. First name only — never share their details outside the session.</p>
        </Status>
      )}
    </div>
  );
}

export function MStudents() {
  const { loadSessions } = useApp();
  const gate = useMentorGate();
  const mySessions = useMyMentoringSessions();
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setLoading(true); await loadSessions(); setLoading(false); })(); }, [loadSessions]);
  const upcoming = useMemo(
    () => mySessions.filter(isUpcoming).sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0)),
    [mySessions],
  );
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <SuspendedBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div><h1 style={{ margin: 0, fontSize: 28 }}>Students &amp; prep</h1><p className="text-muted" style={{ fontSize: 14, margin: '2px 0 0' }}>Know who you&apos;re talking to before each session.</p></div>
        <Btn variant="ghost" onClick={loadSessions}>↻ Refresh</Btn>
      </div>
      {!gate.unlocked ? <GateCard /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <Status loading={loading} empty={upcoming.length === 0} emptyMsg="No upcoming booked sessions — prep sheets appear here once a student's request is accepted.">
            {upcoming.map((s) => <PrepCard key={s.id} session={s} />)}
          </Status>
          <div style={{ ...WARN, borderRadius: 10, padding: '9px 12px', fontSize: 12.5 }}>Prep sheets exist only for sessions you have accepted. There is no student directory — by design.</div>
        </div>
      )}
    </section>
  );
}
