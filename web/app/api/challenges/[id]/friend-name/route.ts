import { withId } from "../../../../../lib/challenge-http";
import { nameFriend } from "../../../../../lib/challenge-service.mjs";
export const runtime = "nodejs";
export const POST = withId(
  (id) =>
    async ({ ctx, credential, input }) => ({
      body: await nameFriend(ctx, credential, id, input),
    }),
  { mutate: true },
);
