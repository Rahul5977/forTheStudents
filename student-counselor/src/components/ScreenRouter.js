'use client';
// Client-side screen resolver. The (server) catch-all page passes the URL slug in;
// we look up the screen component and render it. Kept separate from the page so the
// page can stay a Server Component (needed for generateStaticParams in static export).
import { SCREENS } from '@/screens';
import { slugToId } from '@/lib/routes';
import { Btn } from '@/components/ui';

function NotFound() {
  return (
    <section style={{ maxWidth: 520, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 64, color: 'var(--color-accent)' }}>404</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, marginTop: 8 }}>Page not found</div>
      <p className="text-muted" style={{ fontSize: 14 }}>This page took a wrong turn.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <Btn variant="pri" go="gallery">All screens</Btn>
        <Btn variant="sec" go="landing">Home</Btn>
      </div>
    </section>
  );
}

export default function ScreenRouter({ slug }) {
  const id = slugToId(slug || '');
  const Screen = SCREENS[id] || NotFound;
  return <Screen />;
}
