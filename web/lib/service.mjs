import {
  deal,
  commit,
  reveal,
  view,
  GameError,
  rememberCards,
} from "./game.mjs";
const DAY = 86400;
export function hasActiveRound(record, now) {
  return !!record && (record.roundExpiresAt ?? record.expiresAt) > now;
}
export async function transact(
  store,
  dataset,
  id,
  input,
  now = Math.floor(Date.now() / 1000),
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new GameError("Invalid request.");
  if (!["deal", "play", "reveal", "cancel"].includes(input.action))
    throw new GameError("Unknown game action.");
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await store.read(id);
    const active = hasActiveRound(current, now) ? current : null;
    if (input.action === "cancel") {
      if (!active) return null;
      // End the round immediately but retain recency history until TTL cleanup.
      if (
        await store.compareAndSet(
          {
            ...current,
            version: current.version + 1,
            roundExpiresAt: now,
            expiresAt: now + DAY,
          },
          current.version,
        )
      )
        return null;
      continue;
    }
    if (input.action !== "deal" && !active)
      throw new GameError("This round has expired. Start a new deal.");
    let round;
    if (input.action === "deal") {
      if (active && active.round.stage !== "revealed")
        return view(active.round);
      // Retries/double taps after replay return the already-created active round.
      round = deal(
        dataset,
        input.mode,
        undefined,
        input.packs,
        current?.recentCards ?? [],
      );
    } else if (input.action === "play")
      round = commit(active.round, input.card, input.category);
    else round = reveal(active.round);
    if (active && round === active.round) return view(round);
    // A new deal gets a fresh 24h window; play and reveal keep the round's original expiry.
    const recentCards =
      input.action === "deal"
        ? rememberCards(current?.recentCards ?? [], [
            ...round.cards.map((c) => c.id),
            round.opponent.id,
          ])
        : (current?.recentCards ?? []);
    const next = {
      id,
      recentCards,
      version: (current?.version || 0) + 1,
      round,
      roundExpiresAt:
        input.action === "deal"
          ? now + DAY
          : (active.roundExpiresAt ?? active.expiresAt),
      expiresAt: input.action === "deal" ? now + DAY : active.expiresAt,
    };
    if (await store.compareAndSet(next, current?.version ?? null))
      return view(round);
  }
  throw new GameError(
    "The round changed in another request. Refresh and try again.",
    409,
  );
}
