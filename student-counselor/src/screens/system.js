'use client';
// ══════════════════════════════════════════════════════════════════════════
// Shared & System screens / states (6 screens).
// ══════════════════════════════════════════════════════════════════════════
import { useApp } from '@/lib/store';
import { Btn } from '@/components/ui';
import { EMPTY_CARDS } from '@/lib/data';

// ── Empty States ──────────────────────────────────────────────────────────
export function EmptyStates() {
  return (
    <section style={{ maxWidth: 960, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 34, margin: '0 0 4px' }}>Empty states</h1>
      <p className="text-muted" style={{ fontSize: 15 }}>Every list explains what to do next — never a blank screen.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 18 }}>
        {EMPTY_CARDS.map((e) => (
          <div key={e.title} className="card elev-sm" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', padding: '32px 18px' }}><div style={{ fontSize: 38 }}>{e.icon}</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>{e.title}</div><p className="card-body" style={{ textAlign: 'center' }}>{e.body}</p><span className="sc-btn pri">{e.cta}</span></div>
        ))}
      </div>
    </section>
  );
}

// ── Loading / Skeleton States ─────────────────────────────────────────────
export function Loading() {
  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 34, margin: '0 0 4px' }}>Loading &amp; skeletons</h1>
      <p className="text-muted" style={{ fontSize: 15 }}>Keeps the app feeling fast on patchy networks.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
        {[1, 2, 3].map((s) => (
          <div key={s} className="card" style={{ background: 'var(--color-surface)' }}><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-neutral-200)', animation: 'pulse 1.4s infinite' }} /><div style={{ flex: 1 }}><div style={{ height: 14, width: '60%', background: 'var(--color-neutral-200)', borderRadius: 6, animation: 'pulse 1.4s infinite', marginBottom: 8 }} /><div style={{ height: 12, width: '40%', background: 'var(--color-neutral-200)', borderRadius: 6, animation: 'pulse 1.4s infinite' }} /></div></div></div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', padding: 14 }}><span style={{ width: 22, height: 22, border: '3px solid var(--color-neutral-300)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><span className="text-muted" style={{ fontSize: 14 }}>Loading your colleges…</span></div>
      </div>
    </section>
  );
}

// ── Error Pages ───────────────────────────────────────────────────────────
export function ErrorPages() {
  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 34, margin: '0 0 18px' }}>Error &amp; offline states</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', padding: 30 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 44, color: 'var(--color-accent)' }}>404</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Page not found</div><p className="card-body" style={{ textAlign: 'center' }}>This page took a wrong turn.</p><Btn variant="pri" go="dashboard">Go home</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', padding: 30 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 44, color: 'var(--color-accent)' }}>500</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>Something went wrong</div><p className="card-body" style={{ textAlign: 'center' }}>We&apos;re on it. Try again shortly.</p><Btn variant="sec" act="toast" msg="Retrying…">Retry</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', alignItems: 'center', textAlign: 'center', padding: 30 }}><div style={{ fontSize: 44 }}>📡</div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>You&apos;re offline</div><p className="card-body" style={{ textAlign: 'center' }}>Check your connection — we&apos;ll reload when you&apos;re back.</p></div>
      </div>
    </section>
  );
}

// ── Confirmation & Feedback ───────────────────────────────────────────────
export function Confirmations() {
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 34, margin: '0 0 4px' }}>Confirmation &amp; feedback</h1>
      <p className="text-muted" style={{ fontSize: 15 }}>Clear, reassuring feedback for every action.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        <Btn variant="sec" act="toast" msg="Choice list saved ✓" style={{ alignSelf: 'flex-start' }}>Trigger a toast</Btn>
        <Btn variant="sec" act="confirm" dialog="cancelSession" style={{ alignSelf: 'flex-start' }}>Trigger a destructive confirm modal</Btn>
        <Btn variant="sec" act="confirm" dialog="deleteList" style={{ alignSelf: 'flex-start' }}>Trigger a delete confirm modal</Btn>
        <div className="card" style={{ background: 'var(--color-accent-2-100)', flexDirection: 'row', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 22 }}>✅</span><div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Payment successful</div><div className="text-muted" style={{ fontSize: 13 }}>A success screen like this follows every payment &amp; booking.</div></div></div>
      </div>
    </section>
  );
}

// ── First-Run Coach Marks / Tooltips ──────────────────────────────────────
export function CoachMarks() {
  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 34, margin: '0 0 4px' }}>First-run coach marks</h1>
      <p className="text-muted" style={{ fontSize: 15 }}>Gently teach the two hardest ideas — dismissible and non-blocking.</p>
      <div style={{ position: 'relative', marginTop: 24 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)', opacity: .55 }}>
          <div style={{ display: 'flex', gap: 14 }}><div style={{ flex: 1, background: 'var(--color-accent-2-100)', borderRadius: 12, padding: 14, textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>12</div>Safe</div><div style={{ flex: 1, background: 'var(--color-accent-100)', borderRadius: 12, padding: 14, textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>3</div>Target</div><div style={{ flex: 1, background: '#f7e2db', borderRadius: 12, padding: 14, textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>3</div>Reach</div></div>
        </div>
        <div className="card elev-lg" style={{ background: 'var(--color-neutral-900)', color: '#fff', position: 'absolute', top: 70, left: 40, maxWidth: 280 }}><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>Safe, Target, Reach</div><p style={{ fontSize: 13, margin: 0, opacity: .85 }}>Green is very likely, amber is realistic, red is a stretch. This language stays consistent everywhere.</p><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn variant="" act="toast" msg="Skipped tour" style={{ color: '#fff' }}>Skip</Btn><Btn variant="pri" act="toast" msg="Next tip">Got it (1/2)</Btn></div></div>
      </div>
    </section>
  );
}

// ── Navigation Patterns ───────────────────────────────────────────────────
export function NavPatterns() {
  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '44px 24px 60px' }}>
      <h1 style={{ fontSize: 34, margin: '0 0 4px' }}>Navigation patterns</h1>
      <p className="text-muted" style={{ fontSize: 15 }}>Consistent movement across every role.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 18 }}>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">Student · bottom nav</div><div style={{ display: 'flex', justifyContent: 'space-around', background: 'var(--color-bg)', borderRadius: 14, padding: 10 }}><span style={{ textAlign: 'center', fontSize: 11 }}>🏠<br />Home</span><span style={{ textAlign: 'center', fontSize: 11 }}>🎯<br />Predict</span><span style={{ textAlign: 'center', fontSize: 11 }}>📋<br />List</span><span style={{ textAlign: 'center', fontSize: 11 }}>💬<br />Talk</span><span style={{ textAlign: 'center', fontSize: 11 }}>👤<br />Profile</span></div><Btn variant="ghost" go="dashboard" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>See live →</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">Mentor · sidebar</div><div style={{ background: 'var(--color-bg)', borderRadius: 14, padding: 10, fontSize: 13, lineHeight: 1.9 }}>▦ Dashboard<br />📅 Bookings<br />₹ Earnings</div><Btn variant="ghost" go="mDashboard" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>See live →</Btn></div>
        <div className="card elev-sm" style={{ background: 'var(--color-surface)' }}><div className="card-title">Admin · sidebar</div><div style={{ background: 'var(--color-bg)', borderRadius: 14, padding: 10, fontSize: 13, lineHeight: 1.9 }}>▦ Dashboard<br />✔ Verification<br />🏛 College Data</div><Btn variant="ghost" go="aDashboard" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>See live →</Btn></div>
      </div>
    </section>
  );
}
