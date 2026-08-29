'use client';
// ══════════════════════════════════════════════════════════════════════════
// Layout chrome — top nav (marketing/student), sidebar (mentor/admin),
// student bottom nav, floating "All screens" button, toast, and dialog.
// Which chrome shows is derived from the current screen's role context.
// ══════════════════════════════════════════════════════════════════════════
import { useApp } from '@/lib/store';
import { Btn } from './ui';
import Logo from './Logo';
import { ADMIN_LINKS, MENTOR_LINKS, BOTTOM_NAV, DIALOGS } from '@/lib/data';

const MKT_LINKS = [
  ['howItWorks', 'How it works'], ['features', 'Features'], ['pricing', 'Pricing'], ['becomeMentor', 'Become a mentor'], ['guides', 'Guides'],
];

// The signed-in landing screen for each role (used by role-aware nav links).
const HOME_FOR = { student: 'dashboard', mentor: 'mDashboard', admin: 'aDashboard', superadmin: 'aDashboard' };
const homeFor = (role) => HOME_FOR[role] || 'dashboard';

// First initial for the avatar chip (falls back to 'A' pre-hydration).
const initialOf = (name) => (String(name || '').trim().charAt(0) || 'A').toUpperCase();

function Brand({ size = 19, title }) {
  const { navigate, loggedIn, role } = useApp();
  return (
    <div
      onClick={() => navigate(loggedIn ? (HOME_FOR[role] || 'dashboard') : 'landing')}
      style={{ fontFamily: 'var(--font-heading)', fontSize: size, display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      <Logo size={26} />
      {title || <>Student<span style={{ color: 'var(--color-accent-700)' }}>-Counselor</span></>}
    </div>
  );
}

function TopNav() {
  const { ctx, screen, navigate, profile, loggedIn, role, unreadCount, isMentor } = useApp();
  const marketing = ctx === 'marketing';
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: 18, padding: '12px 22px', background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--color-divider)' }}>
      <Brand />
      {marketing ? (
        <>
          <nav className="mktnav" style={{ gap: 4, marginLeft: 8 }}>
            {MKT_LINKS.map(([id, label]) => (
              <span key={id} className={['sc-navlink', screen === id ? 'on' : ''].filter(Boolean).join(' ')} onClick={() => navigate(id)}>{label}</span>
            ))}
          </nav>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {loggedIn ? (
              <>
                <span className="sc-btn ghost" onClick={() => navigate('notifications')} style={{ position: 'relative' }}>
                  🔔{unreadCount > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 4px', background: 'var(--color-accent)', color: 'var(--color-bg)', borderRadius: 999, fontSize: 10, lineHeight: '15px', textAlign: 'center', fontFamily: 'var(--font-body)' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </span>
                <Btn variant="sec" go={homeFor(role)}>Dashboard</Btn>
                <Btn variant="pri" act="logout">Log out</Btn>
              </>
            ) : (
              <>
                <Btn variant="sec" go="login">Log in</Btn>
                <Btn variant="pri" go="predictor">Predict my colleges</Btn>
              </>
            )}
          </div>
        </>
      ) : (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {(role === 'admin' || role === 'superadmin') && <Btn variant="sec" go="aDashboard" style={{ fontSize: 13 }} title="Open the admin console">🛠 Admin</Btn>}
          {isMentor && <Btn variant="sec" go="mDashboard" style={{ fontSize: 13 }} title="Switch to your mentor dashboard">🧑‍🏫 Mentor</Btn>}
          <span style={{ fontSize: 13 }} className="text-muted">Rank <strong style={{ color: 'var(--color-text)' }}>{profile.advRank || profile.mainRank || '—'}</strong> · {profile.category}</span>
          <span className="sc-btn ghost" onClick={() => navigate('notifications')} style={{ position: 'relative' }} title={unreadCount > 0 ? `${unreadCount} unread` : 'Notifications'}>
            🔔{unreadCount > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 4px', background: 'var(--color-accent)', color: 'var(--color-bg)', borderRadius: 999, fontSize: 10, lineHeight: '15px', textAlign: 'center', fontFamily: 'var(--font-body)' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </span>
          <span onClick={() => navigate('profile')} title={profile.name || 'Profile'} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: 'var(--color-bg)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', cursor: 'pointer' }}>{initialOf(profile.name)}</span>
          <Btn variant="ghost" act="logout" title="Log out" style={{ fontSize: 13 }}>Log out</Btn>
        </div>
      )}
    </header>
  );
}

function Sidebar() {
  const { ctx, screen, navigate, can, isSuperadmin } = useApp();
  // Admin links are gated by permission scope (superadmin sees all + the Admins page).
  const links = ctx === 'admin'
    ? ADMIN_LINKS.filter(([, , , scope]) => !scope || (scope === 'super' ? isSuperadmin : can(scope)))
    : MENTOR_LINKS;
  return (
    <aside style={{ width: 232, flex: 'none', background: 'var(--color-surface)', borderRight: '1px solid var(--color-divider)', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
      <div onClick={() => navigate(HOME_FOR[ctx] || 'dashboard')} style={{ fontFamily: 'var(--font-heading)', fontSize: 17, padding: '6px 8px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <Logo size={24} />
        {ctx === 'admin' ? 'Admin' : 'Mentor'}
      </div>
      {links.map(([id, label, icon]) => (
        <span key={id} className={['sc-navlink', id === screen ? 'on' : ''].filter(Boolean).join(' ')} onClick={() => navigate(id)}>
          {icon} {label}
        </span>
      ))}
      {/* A mentor is also a student — let them jump back to the student app. */}
      {ctx === 'mentor' && <span className="sc-navlink" onClick={() => navigate('dashboard')} style={{ marginTop: 'auto' }}>🎓 Student view</span>}
      <Btn variant="ghost" act="logout" style={{ marginTop: ctx === 'mentor' ? 8 : 'auto' }}>Log out</Btn>
    </aside>
  );
}

function BottomNav() {
  const { screen, navigate } = useApp();
  return (
    <nav style={{ position: 'sticky', bottom: 0, zIndex: 40, display: 'flex', justifyContent: 'space-around', padding: '8px 6px calc(8px + env(safe-area-inset-bottom))', background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderTop: '1px solid var(--color-divider)' }}>
      {BOTTOM_NAV.map(([id, label, icon]) => (
        <span key={id} className="sc-tile" onClick={() => navigate(id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 12px', borderRadius: 14, cursor: 'pointer', color: screen === id ? 'var(--color-accent-700)' : 'var(--color-neutral-600)' }}>
          <span style={{ fontSize: 19 }}>{icon}</span>
          <span style={{ fontSize: 11 }}>{label}</span>
        </span>
      ))}
    </nav>
  );
}

function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div style={{ position: 'fixed', bottom: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'var(--color-neutral-900)', color: '#fff', padding: '11px 20px', borderRadius: 999, fontSize: 14, boxShadow: 'var(--shadow-lg)', animation: 'toastin .22s ease' }}>
      {toast}
    </div>
  );
}

function Dialog() {
  const { dialog, runAct, navigate } = useApp();
  if (!dialog) return null;
  const d = DIALOGS[dialog];
  if (!d) return null;
  return (
    <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={() => runAct({ act: 'closeDialog' })}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 32 }}>{d.icon}</div>
        <div className="dialog-title">{d.title}</div>
        <div className="dialog-body">{d.body}</div>
        <div className="dialog-actions">
          <Btn variant="sec" onClick={() => runAct({ act: 'closeDialog' })}>{d.cancel}</Btn>
          <Btn variant="pri" onClick={() => navigate(d.go)}>{d.confirm}</Btn>
        </div>
      </div>
    </div>
  );
}

// Phase 11: the API authorises on the JWT; when the server-side role/permissions changed (e.g.
// the owner was just promoted to superadmin, or an admin's scopes were edited) and the token
// could not be renewed silently, ask for a fresh sign-in. UX only — the API enforces anyway.
function RoleStaleBanner() {
  const { roleStale, runAct } = useApp();
  if (!roleStale) return null;
  return (
    <div style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', padding: '9px 16px', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      <span>🔑 Your permissions changed. Sign in again to activate them.</span>
      <Btn variant="pri" onClick={() => runAct({ act: 'logout' })} style={{ fontSize: 12, padding: '5px 12px' }}>Sign in again</Btn>
    </div>
  );
}

export default function Chrome({ children }) {
  const { ctx } = useApp();
  const topNav = ctx === 'marketing' || ctx === 'student';
  const sidebar = ctx === 'admin' || ctx === 'mentor';
  const bottomNav = ctx === 'student';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)', color: 'var(--color-text)', background: 'var(--color-bg)' }}>
      <RoleStaleBanner />
      {topNav && <TopNav />}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {sidebar && <Sidebar />}
        <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>{children}</main>
      </div>
      {bottomNav && <BottomNav />}
      <Dialog />
      <Toast />
    </div>
  );
}
