import HomeGame from './HomeGame';
import { challengesEnabled } from '../lib/challenge-flag';

// Read the feature flag per request so it is not frozen into a static build.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <HomeGame challenges={challengesEnabled()} />;
}
