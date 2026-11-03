import { withId } from '../../../../../lib/challenge-http';
import * as svc from '../../../../../lib/challenge-service.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = withId(id => async ({ ctx, credential, input }) => {
  const { view, issuedCredential } = await svc.accept(ctx, credential, id, input);
  return { body: view, issuedCredential };
}, { mutate: true, limit: 'accept' });
