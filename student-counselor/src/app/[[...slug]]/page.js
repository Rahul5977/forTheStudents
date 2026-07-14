'use client';
// Optional catch-all route — resolves the URL slug to a screen id and renders it.
// Every screen lives at its own URL (e.g. /predictor, /choice-builder) while the
// shared app state persists in the root-level AppProvider.
import { useParams } from 'next/navigation';
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

export default function Page() {
  const params = useParams();
  const raw = params?.slug;
  const slug = Array.isArray(raw) ? raw[0] : raw || '';
  const id = slugToId(slug);
  const Screen = SCREENS[id] || NotFound;
  return <Screen />;
}
