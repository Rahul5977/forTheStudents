'use client';
// ══════════════════════════════════════════════════════════════════════════
// Counsellor / Mentor app (10 screens).
// ══════════════════════════════════════════════════════════════════════════
import { useApp } from '@/lib/store';
import { Btn, Field, Input, Select } from '@/components/ui';
import { M_BOOKINGS, M_REVIEWS, WEEK_DAYS } from '@/lib/data';

function fmtTime(t) {
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

// ── Mentor Dashboard ────────────────────────────────────────────────────────
export function MDashboard() {
  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}><h1 style={{ margin: 0, fontSize: 30 }}>Welcome back, Aarav</h1><label className="radio" style={{ background: 'var(--color-accent-2-100)', borderRadius: 999, padding: '8px 14px' }}><input type="checkbox" defaultChecked /><span className="dot" />Available for bookings</label></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">This month</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>₹6,400</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Total earned</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>₹42,300</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Pending payout</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>₹1,200</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Rating</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 28 }}>4.9 ⭐</div><div className="text-muted" style={{ fontSize: 11 }}>128 sessions</div></div>
      </div>
      <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>Upcoming sessions</div><Btn variant="ghost" go="mBookings">See all</Btn></div><div className="card" style={{ background: 'var(--color-bg)', flexDirection: 'row', alignItems: 'center', gap: 10 }}><span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>A</span><div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>Aditya · Today 6:30 PM</div><div className="text-muted" style={{ fontSize: 12 }}>&quot;CSE at a lower IIT vs ECE at a top one?&quot;</div></div><Btn variant="pri" go="mSession">Join</Btn></div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-2-100)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Get more bookings</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}><li>Add 3+ availability slots this week</li><li>Reply to booking notes quickly</li><li>Keep your rating above 4.8</li></ul><Btn variant="sec" go="mAvailability">Set availability</Btn></div>
      </div>
    </section>
  );
}

// ── Mentor Profile Editor ─────────────────────────────────────────────────
export function MProfile() {
  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '26px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h1 style={{ margin: 0, fontSize: 28 }}>Profile editor</h1><Btn variant="sec" act="viewMentor" id="1">👁 Preview as student</Btn></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 20 }}>AS</span><Btn variant="sec" act="toast" msg="Photo updated">Change photo</Btn></div><Field label="Short bio"><textarea className="input" defaultValue="Third-year CSE at IIT Bombay. Happy to give honest advice on branch choice, coding culture and placements." /></Field><div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Topics</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tag tag-accent">CSE vs ECE ✓</span><span className="tag tag-accent">Campus life ✓</span><span className="tag tag-accent">Placements ✓</span><span className="tag tag-neutral">+ Add</span></div></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}><div className="card-kicker">Locked after verification</div><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Field label="College" style={{ flex: 1 }}><Input defaultValue="IIT Bombay" disabled /></Field><Field label="Branch" style={{ flex: 1 }}><Input defaultValue="Computer Science" disabled /></Field><Field label="Year" style={{ width: 100 }}><Input defaultValue="3" disabled /></Field></div></div>
      <Btn variant="pri" act="toast" msg="Profile saved" block style={{ marginTop: 14 }}>Save profile</Btn>
    </section>
  );
}

// ── Availability / Calendar Management ────────────────────────────────────
export function MAvailability() {
  const { runAct } = useApp();
  const slotLabels = ['Morning', 'Evening', 'Night'];
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 28 }}>Availability</h1>
      <p className="text-muted" style={{ fontSize: 14 }}>Tap a slot to toggle. Students can only book green slots.</p>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 10, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', gap: 6, minWidth: 560 }}>
          <div />
          {WEEK_DAYS.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700 }}>{d}</div>)}
          {slotLabels.map((label, row) => (
            < RowFragment key={row} label={label} row={row} onToggle={() => runAct({ act: 'toast', msg: 'Slot toggled' })} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}><Field label="Timezone" style={{ flex: 1 }}><Input defaultValue="IST (GMT+5:30)" /></Field><Field label="Buffer between sessions" style={{ flex: 1 }}><Select defaultValue="10 min"><option>5 min</option><option>10 min</option><option>15 min</option></Select></Field></div>
      <Btn variant="pri" act="toast" msg="Availability saved" style={{ marginTop: 6 }}>Save availability</Btn>
    </section>
  );
}
function RowFragment({ label, row, onToggle }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', color: 'var(--color-neutral-600)' }}>{label}</div>
      {Array.from({ length: 7 }).map((_, c) => {
        const on = (row + c) % 3 === 0;
        return (
          <div key={c} className="sc-tile" onClick={onToggle} style={{ height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 13, cursor: 'pointer', background: on ? 'var(--color-accent-2-100)' : 'var(--color-neutral-100)', color: on ? 'var(--color-accent-2-800)' : 'var(--color-neutral-500)', border: '1px solid var(--color-divider)' }}>{on ? '✓' : ''}</div>
        );
      })}
    </>
  );
}

// ── Verification Center ───────────────────────────────────────────────────
export function MVerification() {
  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 28 }}>Verification center</h1>
      <span className="tag tag-accent-2">✔ Approved</span>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, alignItems: 'center' }}>College email (.ac.in)<span className="tag tag-accent-2">Verified</span></div><div className="text-muted" style={{ fontSize: 13 }}>21b0xxx@iitb.ac.in</div></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, alignItems: 'center' }}>Student ID<span className="tag tag-accent-2">Verified</span></div><div className="text-muted" style={{ fontSize: 13 }}>Uploaded Jul 1 · reviewed Jul 2</div></div>
      <div className="card" style={{ background: 'var(--color-accent-2-100)', marginTop: 12 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>You&apos;re a verified mentor 🎉</div><p style={{ fontSize: 13, margin: 0 }}>Students see your verified badge. Re-verify each academic year to keep it.</p></div>
    </section>
  );
}

// ── Bookings / Session Requests ───────────────────────────────────────────
export function MBookings() {
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Bookings &amp; requests</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {M_BOOKINGS.map((b, i) => (
          <div key={i} className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', alignItems: 'center', gap: 12 }}><span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{b.initial}</span><div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{b.name} · {b.when}</div><div className="text-muted" style={{ fontSize: 12 }}>&quot;{b.q}&quot;</div></div>{b.actions.map((a, j) => <Btn key={j} variant={a.cls} go={a.go} act={a.act} msg={a.msg}>{a.label}</Btn>)}</div>
        ))}
      </div>
    </section>
  );
}

// ── Session Room (mentor side) [CORE] ─────────────────────────────────────
export function MSession() {
  const { sessTime, camOn, micOn, runAct, navigate } = useApp();
  return (
    <section style={{ background: 'var(--color-neutral-900)', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', color: '#fff', flexWrap: 'wrap', gap: 8 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#5fce7f', animation: 'pulse 1.6s infinite' }} />Session with Aditya</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, background: 'rgba(255,255,255,.1)', padding: '4px 16px', borderRadius: 999 }}>{fmtTime(sessTime)} / 25:00</div></div>
      <div className="session-body" style={{ flex: 1, display: 'flex', gap: 14, padding: '0 20px 14px', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 320, borderRadius: 20, background: 'linear-gradient(135deg,#3d472b,#56633f)', position: 'relative', display: 'grid', placeItems: 'center' }}><span style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 40 }}>A</span><div style={{ position: 'absolute', bottom: 14, left: 16, color: '#fff', fontSize: 14, background: 'rgba(0,0,0,.35)', padding: '4px 12px', borderRadius: 999 }}>Aditya · Student</div></div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}><button className="sc-btn" onClick={() => runAct({ act: 'toggleMic' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{micOn ? '🎤' : '🔇'}</button><button className="sc-btn" onClick={() => runAct({ act: 'toggleCam' })} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', width: 52, height: 52, borderRadius: '50%' }}>{camOn ? '📷' : '🚫'}</button><button className="sc-btn" onClick={() => navigate('mDashboard')} style={{ background: '#a8442e', color: '#fff', padding: '0 22px', borderRadius: 999 }}>End session</button></div>
        </div>
        <aside className="session-chat" style={{ flex: 'none', width: 280, background: 'var(--color-bg)', borderRadius: 18, padding: 16 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, marginBottom: 8 }}>Student&apos;s question</div><div style={{ fontSize: 13, background: 'var(--color-accent-100)', borderRadius: 12, padding: 11, color: 'var(--color-accent-800)' }}>&quot;Should I pick CSE at a lower IIT or ECE at a top one? I&apos;m confused about long-term prospects.&quot;</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, margin: '14px 0 6px' }}>Their shortlist</div><div style={{ fontSize: 13, lineHeight: 1.8 }}>IIT Indore — CSE<br />IIT (BHU) — CSE<br />IIT Guwahati — CSE</div></aside>
      </div>
    </section>
  );
}

// ── Earnings & Payouts ────────────────────────────────────────────────────
export function MEarnings() {
  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Earnings &amp; payouts</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}><div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">Total</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>₹42,300</div></div><div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Pending</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>₹1,200</div></div><div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Paid out</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>₹41,100</div></div></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Per-session breakdown</div><Btn variant="pri" act="confirm" dialog="payout">Withdraw ₹1,200</Btn></div><table className="table"><thead><tr><th>Date</th><th>Student</th><th>Fee</th><th>Platform (20%)</th><th>You get</th></tr></thead><tbody><tr><td>Jul 8</td><td>Aditya</td><td>₹100</td><td>₹20</td><td>₹80</td></tr><tr><td>Jul 6</td><td>Riya</td><td>₹100</td><td>₹20</td><td>₹80</td></tr><tr><td>Jul 5</td><td>Dev</td><td>₹100</td><td>₹20</td><td>₹80</td></tr></tbody></table></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontSize: 14 }}>Payout method</div><div className="text-muted" style={{ fontSize: 13 }}>UPI · aarav@okhdfc</div></div><Btn variant="sec" act="toast" msg="Manage payout">Manage</Btn></div>
    </section>
  );
}

// ── Reviews & Ratings ─────────────────────────────────────────────────────
export function MReviews() {
  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 28 }}>Reviews &amp; ratings</h1>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontFamily: 'var(--font-heading)', fontSize: 40 }}>4.9</span><span className="text-muted">⭐ from 128 sessions</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {M_REVIEWS.map((r, i) => (
          <div key={i} className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div><div>{r.stars}</div></div><p style={{ fontSize: 13, margin: '4px 0 0' }}>{r.text}</p><div style={{ display: 'flex', gap: 8 }}><Btn variant="ghost" act="toast" msg="Reply sent">Reply</Btn><Btn variant="ghost" act="toast" msg="Flagged for review" style={{ color: '#a8442e' }}>Flag as unfair</Btn></div></div>
        ))}
      </div>
    </section>
  );
}

// ── Mentor Notifications ──────────────────────────────────────────────────
export function MNotifications() {
  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Notifications</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 10, borderLeft: '4px solid var(--color-accent)' }}><span>📅</span><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>New booking from Aditya</div><div className="text-muted" style={{ fontSize: 13 }}>Today 6:30 PM</div></div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 10 }}><span>₹</span><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>Payout processed</div><div className="text-muted" style={{ fontSize: 13 }}>₹4,000 sent to your UPI</div></div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 10 }}><span>⭐</span><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>New 5-star review</div><div className="text-muted" style={{ fontSize: 13 }}>&quot;Super honest!&quot; — Riya</div></div></div>
      </div>
    </section>
  );
}

// ── Mentor Settings ───────────────────────────────────────────────────────
export function MSettings() {
  const { runAct } = useApp();
  return (
    <section style={{ maxWidth: 600, margin: '0 auto', padding: '26px 24px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Settings</h1>
      <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Mentor mode</div><label className="radio"><input type="checkbox" defaultChecked /><span className="dot" />Accepting new bookings</label><label className="radio"><input type="checkbox" defaultChecked /><span className="dot" />Email me about new requests</label></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div className="card-kicker">Account</div><div className="sc-row" onClick={() => runAct({ act: 'toast', msg: 'Account' })} style={{ padding: '8px 4px', fontSize: 14, cursor: 'pointer' }}>Account &amp; email ›</div><div className="sc-row" onClick={() => runAct({ go: 'mEarnings' })} style={{ padding: '8px 4px', fontSize: 14, cursor: 'pointer' }}>Payout method ›</div></div>
      <Btn variant="ghost" act="toast" msg="Mentor mode deactivated" block style={{ color: '#a8442e', marginTop: 14 }}>Deactivate mentor mode</Btn>
    </section>
  );
}
