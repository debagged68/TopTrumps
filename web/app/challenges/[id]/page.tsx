import ChallengeRoom from '../ChallengeRoom';
import { notFound } from 'next/navigation';
import { challengesEnabled } from '../../../lib/challenge-flag';

export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!challengesEnabled()) notFound();
  return <ChallengeRoom id={(await params).id} />;
}
