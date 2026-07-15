// Server Component. For a static export we must tell Next EVERY URL to pre-build,
// via generateStaticParams — one entry per screen (plus the root). Each becomes its
// own out/<slug>/index.html. The actual rendering happens client-side in ScreenRouter.
import ScreenRouter from '@/components/ScreenRouter';
import { ALL_SCREENS, idToSlug } from '@/lib/routes';

export function generateStaticParams() {
  // gallery === the root path (empty slug); every other screen === one path segment.
  return [
    { slug: [] },
    ...ALL_SCREENS.filter((s) => s !== 'gallery').map((id) => ({ slug: [idToSlug(id)] })),
  ];
}

// Only the paths above exist as static files; anything else falls to the 404.
export const dynamicParams = false;

export default function Page({ params }) {
  const raw = params?.slug;
  const slug = Array.isArray(raw) ? raw[0] : '';
  return <ScreenRouter slug={slug} />;
}
