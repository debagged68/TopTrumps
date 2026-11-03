import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { challengesEnabled } from '../../../lib/challenge-flag';
import Landing from './Landing';

// Generic metadata only: no nickname, card, score or result ever appears in a preview.
export const metadata: Metadata = {
  title: 'A Top Trumps challenge',
  description: 'Someone sent you a political quote card challenge. Open the link to play.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!challengesEnabled()) notFound();
  return <Landing id={(await params).id} />;
}
