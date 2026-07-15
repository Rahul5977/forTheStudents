'use client';
// ══════════════════════════════════════════════════════════════════════════
// Layout chrome — top nav (marketing/student), sidebar (mentor/admin),
// student bottom nav, floating "All screens" button, toast, and dialog.
// Which chrome shows is derived from the current screen's role context.
// ══════════════════════════════════════════════════════════════════════════
import { useApp } from '@/lib/store';
import { Btn } from './ui';
import { ADMIN_LINKS, MENTOR_LINKS, BOTTOM_NAV, DIALOGS } from '@/lib/data';

const MKT_LINKS = [
  ['howItWorks', 'How it works'], ['features', 'Features'], ['pricing', 'Pricing'], ['becomeMentor', 'Become a mentor'], ['guides', 'Guides'],
];

// The signed-in landing screen for each role (used by role-aware nav links).
const HOME_FOR = { student: 'dashboard', mentor: 'mDashboard', admin: 'aDashboard' };
const homeFor = (role) => HOME_FOR[role] || 'dashboard';

// First initial for the avatar chip (falls back to 'A' pre-hydration).
const initialOf = (name) => (String(name || '').trim().charAt(0) || 'A').toUpperCase();

function Brand({ size = 19, title }) {
  const { navigate } = useApp();
  return (
    <div
      onClick={() => navigate('gallery')}
      style={{ fontFamily: 'var(--font-heading)', fontSize: size, display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-grid', placeItems: 'center', color: 'var(--color-bg)', fontSize: 14 }}>S</span>
      {title || <>Student<span style={{ color: 'var(--color-accent-700)' }}>-Counselor</span></>}
    </div>
  );
}

function TopNav() {
  const { ctx, screen, navigate, profile, loggedIn, role, unreadCount } = useApp();
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13 }} className="text-muted">Rank <strong style={{ color: 'var(--color-text)' }}>{profile.advRank}</strong> · {profile.category}</span>
          <span className="sc-btn ghost" onClick={() => navigate('notifications')} style={{ position: 'relative' }} title={unreadCount > 0 ? `${unreadCount} unread` : 'Notifications'}>
            🔔{unreadCount > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 4px', background: 'var(--color-accent)', color: 'var(--color-bg)', borderRadius: 999, fontSize: 10, lineHeight: '15px', textAlign: 'center', fontFamily: 'var(--font-body)' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </span>
          <span onClick={() => navigate('profile')} title={profile.name || 'Profile'} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-accent-2-500)', color: 'var(--color-bg)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', cursor: 'pointer' }}>{initialOf(profile.name)}</span>
        </div>
      )}
    </header>
  );
}

function Sidebar() {
  const { ctx, screen, navigate } = useApp();
  const links = ctx === 'admin' ? ADMIN_LINKS : MENTOR_LINKS;
  return (
    <aside style={{ width: 232, flex: 'none', background: 'var(--color-surface)', borderRight: '1px solid var(--color-divider)', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
      <div onClick={() => navigate('gallery')} style={{ fontFamily: 'var(--font-heading)', fontSize: 17, padding: '6px 8px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-grid', placeItems: 'center', color: 'var(--color-bg)', fontSize: 13 }}>S</span>
        {ctx === 'admin' ? 'Admin' : 'Mentor'}
      </div>
      {links.map(([id, label, icon]) => (
        <span key={id} className={['sc-navlink', id === screen ? 'on' : ''].filter(Boolean).join(' ')} onClick={() => navigate(id)}>
          {icon} {label}
        </span>
      ))}
      <Btn variant="sec" go="gallery" style={{ marginTop: 'auto' }}>← All screens</Btn>
      <Btn variant="ghost" act="logout">Log out</Btn>
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

export default function Chrome({ children }) {
  const { ctx, screen, navigate } = useApp();
  const topNav = ctx === 'marketing' || ctx === 'student';
  const sidebar = ctx === 'admin' || ctx === 'mentor';
  const bottomNav = ctx === 'student';
  const notGallery = screen !== 'gallery' && !sidebar;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)', color: 'var(--color-text)', background: 'var(--color-bg)' }}>
      {topNav && <TopNav />}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {sidebar && <Sidebar />}
        <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>{children}</main>
      </div>
      {bottomNav && <BottomNav />}
      {notGallery && (
        <button className="sc-btn" onClick={() => navigate('gallery')} style={{ position: 'fixed', left: 16, bottom: 80, zIndex: 70, background: 'var(--color-neutral-900)', color: '#fff', boxShadow: 'var(--shadow-lg)', padding: '10px 16px' }}>
          ⊞ All screens
        </button>
      )}
      <Dialog />
      <Toast />
    </div>
  );
}
