import { withId } from "../../../../../lib/challenge-http";
import { dealHand } from "../../../../../lib/challenge-service.mjs";
export const runtime = "nodejs";
export const POST = withId(
  (id) =>
    async ({ ctx, credential, input }) => ({
      body: await dealHand(ctx, credential, id, input),
    }),
  { mutate: true },
);
