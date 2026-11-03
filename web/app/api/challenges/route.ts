import { handle } from '../../../lib/challenge-http';
import * as svc from '../../../lib/challenge-service.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handle(async ({ ctx, credential }) => ({ body: await svc.list(ctx, credential) }));
