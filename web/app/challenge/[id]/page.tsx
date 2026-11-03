import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { challengesEnabled } from '../../../lib/challenge-flag';
import Landing from './Landing';

// Generic metadata only: no nickname, card, score or result ever appears in a preview. The
// preview image has to be an absolute URL, so it is built from the host that served this page.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  const title = 'A Top Trumps challenge';
  const description = 'Someone sent you a political quote card challenge. Open the link to play.';
  const image = host ? [{ url: `${proto}://${host}/og.jpg`, width: 1200, height: 630, alt: 'Top Trumps' }] : undefined;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
    openGraph: { title, description, siteName: 'Top Trumps', type: 'website', images: image },
    twitter: { card: 'summary_large_image', title, description, images: image?.map(i => i.url) },
  };
}
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!challengesEnabled()) notFound();
  return <Landing id={(await params).id} />;
}
