import { handle } from '../../../../lib/challenge-http';
import * as svc from '../../../../lib/challenge-service.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = handle(async ({ ctx, input }) => {
  const { issuedCredential } = await svc.recover(ctx, input);
  return { body: { recovered: true }, issuedCredential };
}, { mutate: true, limit: 'recover' });
