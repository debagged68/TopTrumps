import { withId } from '../../../../lib/challenge-http';
import * as svc from '../../../../lib/challenge-service.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withId(id => async ({ ctx, credential }) => ({ body: await svc.getChallenge(ctx, credential, id) }));
