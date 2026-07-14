'use client';
// ══════════════════════════════════════════════════════════════════════════
// Super Admin — the owner's control panel (14 screens).
// ══════════════════════════════════════════════════════════════════════════
import { useApp } from '@/lib/store';
import { Btn, Input, Field, Select, SegOpt } from '@/components/ui';
import { MENTORS, COLLEGES, VERIFY_QUEUE, FUNNEL } from '@/lib/data';
import { typeStyle } from '@/lib/logic';

const CRIT = { background: '#f7e2db', color: '#7a2d1a' };

// ── Admin Dashboard ─────────────────────────────────────────────────────────
export function ADashboard() {
  const { runAct } = useApp();
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}><h1 style={{ margin: 0, fontSize: 28 }}>Platform overview</h1><div className="seg"><SegOpt on>In-season</SegOpt><SegOpt>Off-season</SegOpt></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Students</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>41,208</div><div className="text-muted" style={{ fontSize: 11 }}>+2,140 today</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Mentors</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>1,204</div><div className="text-muted" style={{ fontSize: 11 }}>+18 today</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Sessions today</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>386</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">Revenue today</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>₹38,600</div></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Conversion</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>7.4%</div><div className="text-muted" style={{ fontSize: 11 }}>predict → paid</div></div>
      </div>
      <div className="dash-2col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Sessions &amp; revenue (14 days)</div><svg viewBox="0 0 520 180" style={{ width: '100%', height: 'auto' }}><polyline points="10,150 50,140 90,120 130,125 170,100 210,90 250,70 290,80 330,55 370,45 410,50 450,30 490,25 510,20" fill="none" stroke="var(--color-accent)" strokeWidth="3" /><polyline points="10,165 50,160 90,150 130,155 170,140 210,138 250,120 290,128 330,110 370,100 410,105 450,88 490,82 510,78" fill="none" stroke="var(--color-accent-2)" strokeWidth="3" strokeDasharray="4 4" /></svg><div style={{ display: 'flex', gap: 16, fontSize: 12 }}><span>▬ Revenue</span><span style={{ color: 'var(--color-accent-2-700)' }}>┄ Sessions</span></div></div>
        <div className="card elev-sm" style={{ background: '#f7e2db' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>⚠ Alerts</div><div className="sc-row" onClick={() => runAct({ go: 'aVerifyQueue' })} style={{ fontSize: 13, padding: 8, cursor: 'pointer' }}>🔴 24 mentor applications pending review</div><div className="sc-row" onClick={() => runAct({ go: 'aPayments' })} style={{ fontSize: 13, padding: 8, cursor: 'pointer' }}>🟠 3 failed payouts</div><div className="sc-row" onClick={() => runAct({ go: 'aModeration' })} style={{ fontSize: 13, padding: 8, cursor: 'pointer' }}>🟡 5 flagged sessions</div></div>
      </div>
    </section>
  );
}

// ── Student Management ────────────────────────────────────────────────────
export function AStudents() {
  const rows = [
    ['Aditya Verma', '850', 'Open', '3', 'Jul 1'],
    ['Riya Sen', '2,340', 'OBC-NCL', '1', 'Jul 2'],
    ['Dev Patel', '5,120', 'Open', '2', 'Jul 3'],
    ['Sana Khan', '1,090', 'EWS', '0', 'Jul 4'],
  ];
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Student management</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><Input placeholder="Search students…" style={{ maxWidth: 280 }} /><Btn variant="sec" act="toast" msg="Exported CSV">Export</Btn></div>
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 560 }}><thead><tr><th>Name</th><th>Rank (Adv)</th><th>Category</th><th>Sessions</th><th>Joined</th><th></th></tr></thead><tbody>
        {rows.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td><Btn variant="ghost" act="toast" msg="Viewing student">View</Btn></td></tr>)}
      </tbody></table></div>
    </section>
  );
}

// ── Mentor Management ─────────────────────────────────────────────────────
export function AMentors() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Mentor management</h1>
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 620 }}><thead><tr><th>Mentor</th><th>College</th><th>Status</th><th>Rating</th><th>Sessions</th><th>Earnings</th><th></th></tr></thead><tbody>
        {MENTORS.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.college}</td><td><span className="tag tag-accent-2">Active</span></td><td>⭐ {m.rating}</td><td>{m.sessions}</td><td>₹{m.earnTxt}</td><td><Btn variant="ghost" act="toast" msg="Featured mentor">Boost</Btn></td></tr>)}
      </tbody></table></div>
    </section>
  );
}

// ── Mentor Verification Queue [CRITICAL] ──────────────────────────────────
export function AVerifyQueue() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><h1 style={{ margin: 0, fontSize: 26 }}>Mentor verification queue</h1><span className="tag" style={CRIT}>CRITICAL · 24 pending</span></div>
      <p className="text-muted" style={{ fontSize: 14 }}>The trust gate for the whole marketplace. Review carefully.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 8 }}>
        {VERIFY_QUEUE.map((v) => (
          <div key={v.email} className="card elev-sm" style={{ background: 'var(--color-surface)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ width: 42, height: 42, borderRadius: '50%', background: v.color, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)' }}>{v.initials}</span><div><div style={{ fontWeight: 700 }}>{v.name}</div><div className="text-muted" style={{ fontSize: 12 }}>{v.college} · Y{v.year}</div></div></div>
            <div style={{ fontSize: 13 }}><div>📧 {v.email} <span className="tag tag-accent-2" style={{ padding: '1px 6px' }}>OTP ✓</span></div><div style={{ marginTop: 4 }}>🪪 Student ID <span className="tag tag-accent" style={{ padding: '1px 6px' }}>Uploaded</span></div></div>
            <div style={{ height: 80, borderRadius: 12, background: 'var(--color-neutral-200)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--color-neutral-600)' }}>🪪 ID card preview</div>
            <div style={{ display: 'flex', gap: 8 }}><Btn variant="pri" act="toast" msg="Mentor approved" style={{ flex: 1 }}>Approve</Btn><Btn variant="sec" act="toast" msg="Rejected with reason" style={{ flex: 1, color: '#a8442e' }}>Reject</Btn></div>
          </div>
        ))}
      </div>
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
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}><Btn variant="pri" act="toast" msg="Import wizard opened">⬆ Import 2026 cutoffs</Btn><Btn variant="sec" act="toast" msg="Running spot-check…">🔍 Spot-check predictions</Btn></div>
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 620 }}><thead><tr><th>College</th><th>Type</th><th>Branch</th><th>2025 close (Open)</th><th>Seats</th><th></th></tr></thead><tbody>
        {rows.map((c) => <tr key={c.id}><td>{c.college}</td><td><span className="tag" style={typeStyle(c.type)}>{c.type}</span></td><td>{c.branch}</td><td>{c.close}</td><td>{c.seats}</td><td><Btn variant="ghost" act="toast" msg="Editing entry">Edit</Btn></td></tr>)}
      </tbody></table></div>
    </section>
  );
}

// ── College Content Management ────────────────────────────────────────────
export function AContent() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>College content management</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">Descriptions &amp; media</div><p className="card-body">Edit overviews, placements, fees, photos and hostel info per college.</p><Btn variant="sec" act="toast" msg="Editing content">Edit content</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">Review moderation</div><p className="card-body">12 college reviews awaiting moderation.</p><Btn variant="sec" go="aModeration">Moderate</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">&quot;Things to know&quot;</div><p className="card-body">Curate honest pros &amp; cons shown on analysis pages.</p><Btn variant="sec" act="toast" msg="Editing pros/cons">Curate</Btn></div>
      </div>
    </section>
  );
}

// ── Sessions Monitoring ───────────────────────────────────────────────────
export function ASessions() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Sessions monitoring</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><span className="tag tag-accent" style={{ cursor: 'pointer' }}>All</span><span className="tag tag-neutral" style={{ cursor: 'pointer' }}>Live now</span><span className="tag tag-neutral" style={{ cursor: 'pointer' }}>Flagged</span><span className="tag tag-neutral" style={{ cursor: 'pointer' }}>No-shows</span></div>
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 600 }}><thead><tr><th>Session</th><th>Student</th><th>Mentor</th><th>Status</th><th></th></tr></thead><tbody>
        <tr><td>#48213</td><td>Aditya</td><td>Aarav Sharma</td><td><span className="tag tag-accent-2">Completed</span></td><td><Btn variant="ghost" act="toast" msg="Session details">View</Btn></td></tr>
        <tr><td>#48209</td><td>Riya</td><td>Priya Menon</td><td><span className="tag tag-accent">Live</span></td><td><Btn variant="ghost" act="toast" msg="Session details">View</Btn></td></tr>
        <tr><td>#48201</td><td>Dev</td><td>Rohan Gupta</td><td><span className="tag" style={CRIT}>Flagged</span></td><td><Btn variant="ghost" act="toast" msg="Refund triggered">Refund</Btn></td></tr>
      </tbody></table></div>
    </section>
  );
}

// ── Payments & Payouts ────────────────────────────────────────────────────
export function APayments() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Payments &amp; payouts</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}><div className="card elev-sm" style={{ background: 'var(--color-accent-100)' }}><div className="card-kicker">Revenue (month)</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 24 }}>₹4.8L</div></div><div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Payouts due</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 24 }}>₹1.9L</div></div><div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Platform fee</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 24 }}>₹96k</div></div></div>
      <div className="card" style={{ background: 'var(--color-surface)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Mentor payout queue</div><Btn variant="pri" act="toast" msg="Batch payout processed">Process all</Btn></div><table className="table"><thead><tr><th>Mentor</th><th>Amount</th><th>Method</th><th></th></tr></thead><tbody><tr><td>Aarav Sharma</td><td>₹1,200</td><td>UPI</td><td><Btn variant="ghost" act="toast" msg="Paid">Pay</Btn></td></tr><tr><td>Priya Menon</td><td>₹960</td><td>UPI</td><td><Btn variant="ghost" act="toast" msg="Paid">Pay</Btn></td></tr></tbody></table></div>
    </section>
  );
}

// ── Reviews & Moderation (Trust & Safety) ─────────────────────────────────
export function AModeration() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 2px', fontSize: 26 }}>Trust &amp; safety</h1>
      <p className="text-muted" style={{ fontSize: 14 }}>Extra care — many students are minors.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 12, alignItems: 'center' }}><span style={{ fontSize: 22 }}>🚩</span><div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>Reported review on IIT Delhi CSE</div><div className="text-muted" style={{ fontSize: 13 }}>&quot;Contains contact details&quot; — flagged by 2 users</div></div><Btn variant="sec" act="toast" msg="Review removed">Remove</Btn><Btn variant="ghost" act="toast" msg="Kept">Keep</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', flexDirection: 'row', gap: 12, alignItems: 'center' }}><span style={{ fontSize: 22 }}>⚠️</span><div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>Session #48201 reported</div><div className="text-muted" style={{ fontSize: 13 }}>Student reported &quot;inappropriate behaviour&quot;</div></div><Btn variant="sec" act="toast" msg="Mentor warned">Warn</Btn><Btn variant="ghost" act="toast" msg="Mentor blocked" style={{ color: '#a8442e' }}>Block</Btn></div>
      </div>
    </section>
  );
}

// ── Support / Tickets ─────────────────────────────────────────────────────
export function ASupport() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Support tickets</h1>
      <div className="card" style={{ background: 'var(--color-surface)', overflowX: 'auto' }}><table className="table" style={{ minWidth: 560 }}><thead><tr><th>#</th><th>User</th><th>Subject</th><th>Status</th><th></th></tr></thead><tbody>
        <tr><td>#912</td><td>Aditya</td><td>Payment not reflecting</td><td><span className="tag tag-accent">Open</span></td><td><Btn variant="ghost" act="toast" msg="Assigned to you">Assign</Btn></td></tr>
        <tr><td>#908</td><td>Riya</td><td>Mentor didn&apos;t join</td><td><span className="tag" style={CRIT}>Urgent</span></td><td><Btn variant="ghost" act="toast" msg="Replied">Reply</Btn></td></tr>
        <tr><td>#901</td><td>Dev</td><td>Can&apos;t edit rank</td><td><span className="tag tag-accent-2">Resolved</span></td><td><Btn variant="ghost" act="toast" msg="Reopened">Reopen</Btn></td></tr>
      </tbody></table></div>
    </section>
  );
}

// ── Content / CMS ─────────────────────────────────────────────────────────
export function ACms() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h1 style={{ margin: 0, fontSize: 26 }}>Content / CMS</h1><Btn variant="pri" act="toast" msg="New article">+ New article</Btn></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><table className="table"><thead><tr><th>Title</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody><tr><td>How JoSAA counselling works in 2026</td><td>Guide</td><td><span className="tag tag-accent-2">Published</span></td><td><Btn variant="ghost" act="toast" msg="Editing">Edit</Btn></td></tr><tr><td>CSE vs ECE: which to pick</td><td>Branch guide</td><td><span className="tag tag-accent">Draft</span></td><td><Btn variant="ghost" act="toast" msg="Editing">Edit</Btn></td></tr><tr><td>NIT cutoff trends 2020–2025</td><td>Cutoffs</td><td><span className="tag tag-neutral">Scheduled</span></td><td><Btn variant="ghost" act="toast" msg="Editing">Edit</Btn></td></tr></tbody></table></div>
    </section>
  );
}

// ── Broadcast / Announcements ─────────────────────────────────────────────
export function ABroadcast() {
  return (
    <section style={{ padding: '26px 28px 40px', maxWidth: 640 }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Broadcast / announcements</h1>
      <div className="card" style={{ background: 'var(--color-surface)' }}><Field label="Message"><textarea className="input" defaultValue="Round 2 results are out — review your allotment and decide Freeze / Float / Slide." /></Field><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Field label="Channel" style={{ flex: 1 }}><Select><option>In-app + Push</option><option>Email</option><option>All channels</option></Select></Field><Field label="Segment" style={{ flex: 1 }}><Select><option>All students</option><option>By state</option><option>By round</option></Select></Field></div><div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Templates</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tag tag-outline" style={{ cursor: 'pointer' }}>Round X results out</span><span className="tag tag-outline" style={{ cursor: 'pointer' }}>Deadline reminder</span></div><div style={{ display: 'flex', gap: 8 }}><Btn variant="pri" act="toast" msg="Broadcast sent">Send now</Btn><Btn variant="sec" act="toast" msg="Scheduled">Schedule</Btn></div></div>
    </section>
  );
}

// ── Analytics & Reports ───────────────────────────────────────────────────
export function AAnalytics() {
  return (
    <section style={{ padding: '26px 28px 40px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Analytics &amp; reports</h1>
      <div className="card" style={{ background: 'var(--color-surface)' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Conversion funnel</div>
        {FUNNEL.map((f) => (
          <div key={f.label} style={{ margin: '6px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{f.label}</span><span>{f.n}</span></div><div style={{ height: 22, borderRadius: 8, background: 'var(--color-neutral-200)', overflow: 'hidden' }}><div style={{ height: '100%', background: 'var(--color-accent)', width: f.w }} /></div></div>
        ))}
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
      <div className="card" style={{ background: 'var(--color-surface)' }}><div className="card-kicker">Pricing</div><div style={{ display: 'flex', gap: 10 }}><Field label="Session price (₹)" style={{ flex: 1 }}><Input defaultValue="100" /></Field><Field label="Platform fee (%)" style={{ flex: 1 }}><Input defaultValue="20" /></Field></div></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div className="card-kicker">Counselling dates</div><Field label="Current round"><Select defaultValue="Round 2"><option>Round 1</option><option>Round 2</option><option>Round 3</option></Select></Field></div>
      <div className="card" style={{ background: 'var(--color-surface)', marginTop: 12 }}><div className="card-kicker">Feature flags</div><label className="radio"><input type="checkbox" defaultChecked /><span className="dot" />Mentor marketplace live</label><label className="radio"><input type="checkbox" defaultChecked /><span className="dot" />Auto-approve .ac.in emails</label><label className="radio"><input type="checkbox" /><span className="dot" />Premium bundles</label></div>
      <Btn variant="pri" act="toast" msg="Settings saved" style={{ marginTop: 14 }}>Save config</Btn>
    </section>
  );
}
