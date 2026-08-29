'use client';
// ══════════════════════════════════════════════════════════════════════════
// Counsellor / Mentor app — WIRED to the live backend (Phase 4 → Phase 11).
//   • mentorProfile / mentorApply / mentorSubmit / mentorUploadDocument → the
//     application lifecycle (mentor-application.js)
//   • mentorUpdateProfile → bio / topics / languages / price (pre-approval)
//   • mentorAvailability / putMentorAvailability (optimistic concurrency, 409-aware)
//   • sessions / accept / decline / join / end → bookings + session room
//   • sessionStudentPrep → Students & prep (mentor-students.js)
//   • earnings + reviews from the session rows (mentor-money.js)
// Gating is UX only — the API enforces (static export ⇒ no server gating).
// Visual design (organic cream/terracotta/sage, ui.js primitives) preserved.
// ══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { liveApi } from '@/lib/liveApi';
import { Btn, Field, Input, Select } from '@/components/ui';
import {
  Status, useMentorProfile, useMyMentoringSessions, useMentorGate, useConfirm, GateCard, SuspendedBanner,
  MENTOR_SHARE, SESSION_MIN, inr, initialsOf, fmtTime, fmtWhen, statusStyle, isDone, isUpcoming, WARN,
} from './mentor-shared';

export { MVerification } from './mentor-application';
export { MStudents } from './mentor-students';
export { MEarnings, MReviews } from './mentor-money';

// ── Mentor Dashboard ────────────────────────────────────────────────────────
export function MDashboard() {
  const { profile, join, navigate, loadSessions } = useApp();
  const gate = useMentorGate();
  const { mentor } = useMentorProfile();
  const mySessions = useMyMentoringSessions();
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const upcoming = useMemo(() => mySessions.filter(isUpcoming).sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0)), [mySessions]);
  const requests = useMemo(() => mySessions.filter((s) => s.status === 'REQUESTED'), [mySessions]);
  const completed = useMemo(() => mySessions.filter(isDone), [mySessions]);
  const now = new Date();
  const thisMonthEarn = completed
    .filter((s) => { const d = s.startsAt ? new Date(s.startsAt) : null; return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((sum, s) => sum + (s.priceINR || 0) * MENTOR_SHARE, 0);
  const totalEarn = completed.reduce((sum, s) => sum + (s.priceINR || 0) * MENTOR_SHARE, 0);
  const joinSession = async (s) => { await join(s.id); navigate('mSession'); };

  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '26px 24px 40px' }}>
      <SuspendedBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>Welcome back, {profile?.name?.split(' ')[0] || 'mentor'}</h1>
        {gate.approved && <span className="tag tag-accent-2">✔ Verified mentor</span>}
      </div>
      {!gate.unlocked ? (
        <>
          <GateCard title={gate.status === 'none' ? 'Become a mentor' : 'Your application is in progress'} />
          <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
            <div className="card-kicker">What unlocks after approval</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}><li>Availability slots students can book</li><li>Session requests, prep sheets and the session room</li><li>Earnings, payouts and your ratings</li></ul>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
            <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">This month (released)</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>{inr(thisMonthEarn)}</div></div>
            <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Total earned</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>{inr(totalEarn)}</div><div className="text-muted" style={{ fontSize: 11 }}>{completed.length} completed</div></div>
            <div className="card elev-sm" style={{ background: requests.length ? 'var(--color-accent-100)' : 'var(--color-surface)', cursor: 'pointer' }} onClick={() => navigate('mBookings')}><div className="card-kicker">Requests</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>{requests.length}</div><div className="text-muted" style={{ fontSize: 11 }}>awaiting your accept</div></div>
            <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Rating</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>{mentor?.ratingCount ? `${Number(mentor.ratingAvg).toFixed(1)} ⭐` : '—'}</div><div className="text-muted" style={{ fontSize: 11 }}>{mentor?.ratingCount ?? 0} rated</div></div>
          </div>
          <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }}>
            <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Upcoming sessions</div><Btn variant="ghost" go="mBookings">See all</Btn></div>
              {upcoming.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13, margin: '8px 0 0' }}>No booked sessions yet — students book you from the marketplace.</p>
              ) : upcoming.slice(0, 3).map((s) => {
                const label = s.studentName || 'Student';
                return (
                  <div key={s.id} className="card" style={{ background: 'var(--color-bg)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{initialsOf(label)}</span>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{label} · {fmtWhen(s.startsAt)}</div><div className="text-muted" style={{ fontSize: 12 }}>{s.status === 'LIVE' ? 'Live now' : s.status === 'ACCEPTED' ? 'Awaiting payment' : `${s.durationMin || SESSION_MIN} min · ${inr((s.priceINR || 0) * MENTOR_SHARE)} to you`}</div></div>
                    {s.meetingUrl && <a href={s.meetingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>🎥</a>}
                    {(s.status === 'CONFIRMED' || s.status === 'LIVE') && !gate.readOnly && <Btn variant="pri" onClick={() => joinSession(s)}>Join</Btn>}
                  </div>
                );
              })}
            </div>
            <div className="card elev-sm" style={{ background: 'var(--color-accent-2-100)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Get more bookings</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}><li>Add 3+ availability slots this week</li><li>Accept requests within a day</li><li>Read the prep sheet before each call</li></ul><Btn variant="sec" go="mAvailability" disabled={gate.readOnly}>Set availability</Btn></div>
          </div>
        </>
      )}
    </section>
  );
}

// ── Mentor Profile Editor ─────────────────────────────────────────────────
const LANGS = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Gujarati'];
export function MProfile() {
  const { showToast, navigate } = useApp();
  const gate = useMentorGate();
  const { mentor, setMentor, loading, err, reload } = useMentorProfile();
  const [bio, setBio] = useState('');
  const [topics, setTopics] = useState('');
  const [price, setPrice] = useState('');
  const [langs, setLangs] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (mentor) { setBio(mentor.bio || ''); setTopics((mentor.topics || []).join(', ')); setPrice(String(mentor.priceINR ?? 100)); setLangs(mentor.languages || []); }
  }, [mentor]);
  const locked = mentor?.status === 'APPROVED' || mentor?.status === 'SUSPENDED';
  const underReview = mentor && !locked && mentor.status !== 'DRAFT';

  const save = async () => {
    if (!mentor) return;
    setSaving(true);
    try {
      const body = { bio: bio.trim(), topics: topics.split(',').map((s) => s.trim()).filter(Boolean), languages: langs, ...(locked ? {} : { priceINR: Number(price) || mentor.priceINR }) };
      const m = await liveApi.mentorUpdateProfile(body);
      setMentor(m); showToast('Profile saved');
    } catch (e) { showToast(e.message || 'Could not save profile'); }
    finally { setSaving(false); }
  };
  const requestChange = () => { showToast('Identity changes go through support so your verification stays valid.'); navigate('help'); };

  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '26px 24px 40px' }}>
      <SuspendedBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h1 style={{ margin: 0, fontSize: 28 }}>Profile editor</h1>{locked && <Btn variant="sec" act="viewMentor" id={mentor?.userId}>👁 Preview as student</Btn>}</div>
      <Status loading={loading} err={err} empty={!mentor} emptyMsg="You haven't applied as a mentor yet." onRetry={reload}>
        {mentor ? (
          <>
            {underReview && <div style={{ ...WARN, borderRadius: 10, padding: '8px 11px', fontSize: 12.5, marginTop: 10 }}>Your application is under review. You can still polish your public bio, topics and languages; everything else is locked until the decision.</div>}
            <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 20 }}>{initialsOf(mentor.name)}</span>
                <div><div style={{ fontWeight: 700 }}>{mentor.name}</div><div className="text-muted" style={{ fontSize: 12.5 }}>{locked ? 'Name is locked after approval' : 'Name is edited on your application'}</div></div>
              </div>
              <Field label="Short bio"><textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell students what you can help with…" disabled={gate.readOnly} /></Field>
              <Field label="Topics (comma-separated)"><Input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="CSE vs ECE, Placements, Campus life" disabled={gate.readOnly} /></Field>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{topics.split(',').map((t) => t.trim()).filter(Boolean).map((t, i) => <span key={i} className="tag tag-accent">{t}</span>)}</div>
              <div style={{ fontSize: 12.5, margin: '8px 0 4px' }}>Languages</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{LANGS.map((l) => { const on = langs.includes(l); return <span key={l} className={on ? 'tag tag-accent' : 'tag tag-neutral'} onClick={() => !gate.readOnly && setLangs(on ? langs.filter((x) => x !== l) : [...langs, l])} style={{ cursor: 'pointer' }}>{l}{on ? ' ✓' : ''}</span>; })}</div>
            </div>
            <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}>
              <div className="card-kicker">{locked ? 'Locked after verification' : 'From your application'}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Field label="College" style={{ flex: 1, minWidth: 140 }}><Input value={mentor.college || ''} disabled readOnly /></Field>
                <Field label="Branch" style={{ flex: 1, minWidth: 140 }}><Input value={mentor.branch || ''} disabled readOnly /></Field>
                <Field label="Year" style={{ width: 90 }}><Input value={mentor.year ?? ''} disabled readOnly /></Field>
                <Field label="Roll number" style={{ width: 140 }}><Input value={mentor.rollNumber || ''} disabled readOnly /></Field>
              </div>
              <Field label="Price per session (₹)" style={{ width: 180 }}><Input value={price} onChange={(e) => setPrice(e.target.value)} disabled={locked || gate.readOnly} /></Field>
              {locked
                ? <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Identity fields and price are locked so your verified badge stays trustworthy.</p><Btn variant="sec" onClick={requestChange}>Request a change</Btn></div>
                : <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>College, branch, year and roll number are edited on your <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('mVerification')}>application</span> while it is a draft.</p>}
            </div>
            <Btn variant="pri" onClick={save} disabled={saving || gate.readOnly} block style={{ marginTop: 14 }}>{saving ? 'Saving…' : 'Save profile'}</Btn>
          </>
        ) : (
          <div className="card" style={{ background: 'var(--color-accent-2-100)', marginTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Become a mentor first</div>
            <p style={{ fontSize: 13, margin: '4px 0 8px' }}>Apply and verify to unlock your profile editor.</p>
            <Btn variant="pri" go="mVerification">Start your application →</Btn>
          </div>
        )}
      </Status>
    </section>
  );
}

// ── Availability / Calendar Management ────────────────────────────────────
export function MAvailability() {
  const { showToast } = useApp();
  const gate = useMentorGate();
  const [slots, setSlots] = useState(null);
  const [version, setVersion] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newWhen, setNewWhen] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null); setStale(false);
    try { const r = await liveApi.mentorAvailability(); setSlots(r?.slots ?? []); setVersion(typeof r?.version === 'number' ? r.version : undefined); }
    catch (e) { setErr(e.message || 'Could not load your availability'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (gate.unlocked) load(); }, [load, gate.unlocked]);

  const slotLabel = (s) => (s.startsAt ? new Date(s.startsAt).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : s.id || 'Slot');
  const toggle = (id) => !gate.readOnly && setSlots((cur) => cur.map((s) => (s.id === id ? { ...s, open: !s.open } : s)));
  const remove = (id) => !gate.readOnly && setSlots((cur) => cur.filter((s) => s.id !== id));
  const addSlot = () => {
    const startsAt = newWhen ? new Date(newWhen).toISOString() : new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    setSlots((cur) => [...(cur || []), { id: `s${Date.now().toString(36)}`, startsAt, durationMin: SESSION_MIN, open: true }]);
    setNewWhen('');
  };
  const save = async () => {
    setSaving(true);
    try { const r = await liveApi.putMentorAvailability(slots || [], version); setSlots(r?.slots ?? slots); setVersion(r?.version); setStale(false); showToast('Availability saved'); }
    catch (e) { if (e.status === 409) setStale(true); else showToast(e.message || 'Could not save availability'); }
    finally { setSaving(false); }
  };

  if (!gate.unlocked) return <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}><h1 style={{ margin: 0, fontSize: 28 }}>Availability</h1><GateCard /></section>;
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <SuspendedBanner />
      <h1 style={{ margin: '0 0 2px', fontSize: 28 }}>Availability</h1>
      <p className="text-muted" style={{ fontSize: 14 }}>Tap a slot to toggle. Students can only book green slots.</p>
      {stale && (
        <div className="card" style={{ background: '#f7e2db', color: '#7a2d1a', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: 13 }}>⚠ Your availability changed elsewhere (another tab or a booking took a slot). Reload to see the latest, then re-apply your edits.</span>
          <Btn variant="pri" onClick={load}>Reload</Btn>
        </div>
      )}
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 10 }}>
        <Status loading={loading} err={err} empty={slots?.length === 0} emptyMsg="No slots yet — add one below so students can book you." onRetry={load}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
            {(slots ?? []).map((s) => (
              <div key={s.id} className="sc-tile" onClick={() => toggle(s.id)}
                style={{ minHeight: 46, borderRadius: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 10px', fontSize: 12.5, cursor: gate.readOnly ? 'default' : 'pointer', border: '1px solid var(--color-divider)', background: s.open ? 'var(--color-accent-2-100)' : 'var(--color-neutral-100)', color: s.open ? 'var(--color-accent-2-800)' : 'var(--color-neutral-500)', position: 'relative' }}>
                <span style={{ fontWeight: 700 }}>{slotLabel(s)}</span>
                <span style={{ fontSize: 11 }}>{s.open ? '✓ Open' : 'Closed'} · {s.durationMin || SESSION_MIN} min</span>
                {!gate.readOnly && <span onClick={(e) => { e.stopPropagation(); remove(s.id); }} title="Remove slot" style={{ position: 'absolute', top: 4, right: 8, fontSize: 12, opacity: 0.6 }}>✕</span>}
              </div>
            ))}
          </div>
        </Status>
      </div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <Field label="Add a slot (date & time, IST)" style={{ flex: 1, minWidth: 200 }}><Input type="datetime-local" value={newWhen} onChange={(e) => setNewWhen(e.target.value)} disabled={gate.readOnly} /></Field>
        <Btn variant="sec" onClick={addSlot} disabled={gate.readOnly}>＋ Add slot</Btn>
      </div>
      <Btn variant="pri" onClick={save} disabled={saving || loading || gate.readOnly} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save availability'}</Btn>
    </section>
  );
}

// ── Bookings / Session Requests ───────────────────────────────────────────
export function MBookings() {
  const { join, navigate, loadSessions, acceptBooking, declineBooking } = useApp();
  const gate = useMentorGate();
  const mySessions = useMyMentoringSessions();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming');
  const confirm = useConfirm();
  useEffect(() => { (async () => { setLoading(true); await loadSessions(); setLoading(false); })(); }, [loadSessions]);

  const sorted = useMemo(() => [...mySessions].sort((a, b) => new Date(b.startsAt || 0) - new Date(a.startsAt || 0)), [mySessions]);
  const shown = useMemo(() => sorted.filter((s) => (tab === 'upcoming' ? (s.status === 'REQUESTED' || isUpcoming(s)) : !(s.status === 'REQUESTED' || isUpcoming(s)))), [sorted, tab]);
  const joinSession = async (s) => { await join(s.id); navigate('mSession'); };
  const decline = (s) => confirm.ask({
    title: `Decline ${s.studentName || 'this student'}'s request?`, danger: true, confirmLabel: 'Decline request',
    body: `The ${fmtWhen(s.startsAt)} slot is released and becomes bookable again. The student is asked to pick another slot or mentor.`,
    notify: 'the student (request declined)',
  }, () => declineBooking(s.id));

  if (!gate.unlocked) return <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}><h1 style={{ margin: 0, fontSize: 28 }}>Bookings &amp; requests</h1><GateCard /></section>;
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <SuspendedBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Bookings &amp; requests</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant={tab === 'upcoming' ? 'pri' : 'sec'} onClick={() => setTab('upcoming')}>Upcoming</Btn>
          <Btn variant={tab === 'past' ? 'pri' : 'sec'} onClick={() => setTab('past')}>Past</Btn>
          <Btn variant="ghost" onClick={loadSessions}>↻</Btn>
        </div>
      </div>
      <Status loading={loading} empty={shown.length === 0} emptyMsg={tab === 'upcoming' ? 'No upcoming bookings — students will appear here once they request a session with you.' : 'No past sessions yet.'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((s) => {
            const label = s.studentName || 'Student';
            const canJoin = (s.status === 'CONFIRMED' || s.status === 'LIVE') && !gate.readOnly;
            const isRequest = s.status === 'REQUESTED';
            return (
              <div key={s.id} className="card elev-sm" style={{ background: isRequest ? 'var(--color-accent-100)' : 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{initialsOf(label)}</span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{label} · {fmtWhen(s.startsAt)}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{s.durationMin || SESSION_MIN} min · {inr(s.priceINR)} · {inr((s.priceINR || 0) * MENTOR_SHARE)} to you{s.status === 'ACCEPTED' ? ' · awaiting the student’s payment' : ''}</div>
                  {s.meetingUrl && <a href={s.meetingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>🎥 Meet link{s.meetingProvider === 'stub' ? ' (placeholder)' : ''}</a>}
                </div>
                <span className="tag" style={statusStyle(s.status)}>{isRequest ? '🙋 Request' : s.status}{s.rating ? ` · ⭐${s.rating}` : ''}</span>
                {isRequest && !gate.readOnly && <><Btn variant="pri" onClick={() => acceptBooking(s.id)}>Accept</Btn><Btn variant="sec" onClick={() => decline(s)}>Decline</Btn></>}
                {isUpcoming(s) && <Btn variant="ghost" go="mStudents" title="Prep sheet">🎒</Btn>}
                {canJoin && <Btn variant="pri" onClick={() => joinSession(s)}>Join</Btn>}
              </div>
            );
          })}
        </div>
      </Status>
      <confirm.Modal />
    </section>
  );
}

// ── Session Room (mentor side) [CORE] ─────────────────────────────────────
export function MSession() {
  const { sessTime, camOn, micOn, runAct, navigate, join, end, loadSessions } = useApp();
  const mySessions = useMyMentoringSessions();
  const confirm = useConfirm();
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const active = useMemo(() => {
    const live = mySessions.find((s) => s.status === 'LIVE');
    if (live) return live;
    return mySessions.filter((s) => s.status === 'CONFIRMED').sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0))[0] || null;
  }, [mySessions]);

  const studentLabel = active?.studentName || 'Student';
  const doJoin = async () => { if (active) await join(active.id); };
  const doEnd = () => {
    if (!active) { navigate('mDashboard'); return; }
    confirm.ask({ title: 'End this session?', danger: true, confirmLabel: 'End session', body: `Marks the session with ${studentLabel} as delivered. The student is then asked to rate it and your earnings for it are released.`, notify: 'the student (rate your session)' },
      async () => { await end(active.id); navigate('mDashboard'); });
  };

  return (
    <section style={{ background: 'var(--color-neutral-900)', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', color: '#fff', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: active?.status === 'LIVE' ? '#5fce7f' : '#d9b25f', animation: 'pulse 1.6s infinite' }} />{active ? `Session with ${studentLabel}` : 'No active session'}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, background: 'rgba(255,255,255,.1)', padding: '4px 16px', borderRadius: 999 }}>{fmtTime(sessTime)} / {String(active?.durationMin || SESSION_MIN).padStart(2, '0')}:00</div>
      </div>
      <div className="session-body" style={{ flex: 1, display: 'flex', gap: 14, padding: '0 20px 14px', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 320, borderRadius: 20, background: 'linear-gradient(135deg,#3d472b,#56633f)', position: 'relative', display: 'grid', placeItems: 'center' }}>
            <span style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 40 }}>{initialsOf(studentLabel)}</span>
            <div style={{ position: 'absolute', bottom: 14, left: 16, color: '#fff', fontSize: 14, background: 'rgba(0,0,0,.35)', padding: '4px 12px', borderRadius: 999 }}>{studentLabel} · Student</div>
            {active?.meetingUrl && <a href={active.meetingUrl} target="_blank" rel="noreferrer" style={{ position: 'absolute', top: 14, right: 16, color: '#fff', fontSize: 13, background: 'rgba(0,0,0,.4)', padding: '6px 12px', borderRadius: 999 }}>🎥 Open Meet{active.meetingProvider === 'stub' ? ' (placeholder)' : ''}</a>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="sc-btn" onClick={() => runAct({ act: 'toggleMic' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{micOn ? '🎤' : '🔇'}</button>
            <button className="sc-btn" onClick={() => runAct({ act: 'toggleCam' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{camOn ? '📷' : '🚫'}</button>
            {active?.status === 'CONFIRMED' && <button className="sc-btn" onClick={doJoin} style={{ background: 'var(--color-accent-2-500)', color: '#fff', padding: '0 22px', borderRadius: 999 }}>Start &amp; get link</button>}
            <button className="sc-btn" onClick={doEnd} style={{ background: '#a8442e', color: '#fff', padding: '0 22px', borderRadius: 999 }}>{active ? 'End session' : 'Back to dashboard'}</button>
          </div>
        </div>
        <aside className="session-chat" style={{ flex: 'none', width: 280, background: 'var(--color-bg)', borderRadius: 18, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, marginBottom: 8 }}>Session details</div>
          {active ? (
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div><strong>Student:</strong> {studentLabel}</div>
              <div><strong>When:</strong> {fmtWhen(active.startsAt)}</div>
              <div><strong>Status:</strong> {active.status}</div>
              <div><strong>Duration:</strong> {active.durationMin || SESSION_MIN} min</div>
              <div><strong>You earn:</strong> {inr((active.priceINR || 0) * MENTOR_SHARE)}</div>
              <Btn variant="sec" go="mStudents" style={{ marginTop: 8 }}>🎒 Open prep sheet</Btn>
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: 13 }}>No confirmed session to join right now. Head back to your dashboard.</p>
          )}
        </aside>
      </div>
      <confirm.Modal />
    </section>
  );
}

// ── Mentor Notifications ──────────────────────────────────────────────────
export function MNotifications() {
  const { notifications, unreadCount, markAllRead, markNotifRead, loadNotifs } = useApp();
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setLoading(true); await loadNotifs(); setLoading(false); })(); }, [loadNotifs]);
  const list = Array.isArray(notifications) ? notifications : [];
  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Notifications{unreadCount > 0 && <span className="tag tag-accent" style={{ marginLeft: 8, fontSize: 12 }}>{unreadCount} new</span>}</h1>
        {unreadCount > 0 && <Btn variant="sec" onClick={markAllRead}>Mark all read</Btn>}
      </div>
      <Status loading={loading} empty={list.length === 0} emptyMsg="You're all caught up — no notifications yet." onRetry={loadNotifs}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((n) => (
            <div key={n.id} onClick={() => !n.read && markNotifRead(n.id)} className="card elev-sm"
              style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 10, cursor: n.read ? 'default' : 'pointer', borderLeft: n.read ? '4px solid transparent' : '4px solid var(--color-accent)' }}>
              <span style={{ width: 7, height: 7, marginTop: 6, borderRadius: '50%', background: n.read ? 'transparent' : 'var(--color-accent)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div><div className="text-muted" style={{ fontSize: 13 }}>{n.body}</div></div>
              {n.link && <a href={n.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 13 }}>🎥</a>}
            </div>
          ))}
        </div>
      </Status>
    </section>
  );
}

// ── Mentor Settings ───────────────────────────────────────────────────────
export function MSettings() {
  const { runAct, navigate } = useApp();
  const gate = useMentorGate();
  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '26px 24px 40px' }}>
      <SuspendedBanner />
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Settings</h1>
      <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Mentor status</div><div style={{ fontSize: 14 }}>{gate.approved ? '✔ Verified — students can book you when you have open slots.' : gate.suspended ? '⛔ Suspended — hidden from students.' : 'Not verified yet — finish your application to go live.'}</div><Btn variant="sec" go={gate.approved ? 'mAvailability' : 'mVerification'} style={{ alignSelf: 'flex-start' }}>{gate.approved ? 'Manage availability' : 'Application status'}</Btn></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div className="card-kicker">Account</div><div className="sc-row" onClick={() => runAct({ go: 'mProfile' })} style={{ padding: '8px 4px', fontSize: 14, cursor: 'pointer' }}>Profile &amp; languages ›</div><div className="sc-row" onClick={() => runAct({ go: 'mEarnings' })} style={{ padding: '8px 4px', fontSize: 14, cursor: 'pointer' }}>Earnings &amp; payouts ›</div><div className="sc-row" onClick={() => runAct({ go: 'help' })} style={{ padding: '8px 4px', fontSize: 14, cursor: 'pointer' }}>Contact support ›</div></div>
      <Btn variant="sec" onClick={() => navigate('dashboard')} block style={{ marginTop: 14 }}>🎓 Switch to student view</Btn>
      <Btn variant="ghost" onClick={() => runAct({ act: 'logout' })} block style={{ color: '#a8442e', marginTop: 10 }}>Log out</Btn>
    </section>
  );
}
