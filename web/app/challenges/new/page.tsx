import NewChallenge from './NewChallenge';
import { notFound } from 'next/navigation';
import { challengesEnabled } from '../../../lib/challenge-flag';

export const dynamic = 'force-dynamic';
export default function Page() {
  if (!challengesEnabled()) notFound();
  return <NewChallenge />;
}
