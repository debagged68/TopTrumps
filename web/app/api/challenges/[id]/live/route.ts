import { withId } from '../../../../../lib/challenge-http';
import * as svc from '../../../../../lib/challenge-service.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Live challenge back. body.action: 'ping' (heartbeat) | 'request' | 'accept' | 'decline'.
export const POST = withId(id => async ({ ctx, credential, input }) => {
  const action = input.action;
  if (action === 'request') return { body: await svc.requestRematch(ctx, credential, id) };
  if (action === 'accept' || action === 'decline') return { body: await svc.answerRematch(ctx, credential, id, { accept: action === 'accept' }) };
  return { body: await svc.livePing(ctx, credential, id) };
}, { mutate: true });
