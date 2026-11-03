import { handle } from '../../../../lib/challenge-http';
import * as svc from '../../../../lib/challenge-service.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = handle(async ({ ctx, credential, input }) => {
  const { view, issuedCredential } = await svc.createDraft(ctx, credential, input);
  return { body: view, issuedCredential };
}, { mutate: true, limit: 'create' });
