import { randomInt, randomUUID } from "node:crypto";
import { PACKS } from "./packs.mjs";
export const RULES_VERSION = "3.1";
// Player-facing rule violations. Anything else thrown is treated as a server fault.
export class GameError extends Error {
  constructor(message, status = 400, code = "invalid") {
    super(message);
    this.name = "GameError";
    this.status = status;
    this.code = code;
  }
}
export function snapshot(card) {
  return {
    id: card.id,
    label: card.label,
    front: card.front,
    speaker: card.speaker,
    scores: { ...card.scores },
    rationale: { ...card.rationale },
    links: card.links.map((x) => [...x]),
  };
}
// Shared primitives: computer rounds and human challenges must use these, never a copy.
export function eligibleCards(dataset) {
  return dataset.cards.filter((c) => c.status === "candidate");
}
// Draw `count` distinct cards without replacement. random(n) returns an integer in [0, n).
export function drawDistinct(cards, count, random = randomInt) {
  const remaining = [...cards];
  return Array.from({ length: count }, () =>
    snapshot(remaining.splice(random(remaining.length), 1)[0]),
  );
}
// The one place a score comparison happens. 'win' means `first` beats `second`.
export function compareScores(first, second) {
  return first > second ? "win" : first < second ? "loss" : "draw";
}
// Ownership is server controlled. Only published, included content can be dealt today.
// Extend this catalogue with verified entitlements when checkout is connected.
export function validatePacks(packs = ["donald", "donald"]) {
  if (
    !Array.isArray(packs) ||
    packs.length !== 2 ||
    packs.some(
      (id) =>
        !PACKS.some((pack) => pack.id === id && pack.owned && pack.available),
    )
  )
    throw new GameError("Choose two available packs.");
  return [...packs];
}
// Newest first, bounded and unique. All weights stay positive: recent cards are
// discouraged rather than banned, so small packs can never become undealable.
export const RECENT_CARD_LIMIT = 24;
export function rememberCards(recent = [], ids = []) {
  return [
    ...new Set([...ids, ...recent].filter((id) => typeof id === "string")),
  ].slice(0, RECENT_CARD_LIMIT);
}
export function selectWeighted(cards, recent = [], random = randomInt) {
  const weights = cards.map((card) => {
    const index = recent.indexOf(card.id);
    return index < 0 ? 32 : index < 8 ? 1 : index < 16 ? 4 : 8;
  });
  let ticket = random(weights.reduce((sum, weight) => sum + weight, 0));
  for (let i = 0; i < cards.length; i++) {
    ticket -= weights[i];
    if (ticket < 0) return cards[i];
  }
  throw new Error("Invalid random ticket.");
}
export function drawHand(
  dataset,
  packs,
  random = randomInt,
  excluded = [],
  recent = [],
) {
  const nominated = validatePacks(packs);
  const remaining = eligibleCards(dataset).filter(
    (c) => !excluded.includes(c.id),
  );
  return nominated.map((pack) => {
    const eligible = remaining.filter((c) => (c.packId || "donald") === pack);
    if (!eligible.length)
      throw new GameError("Not enough cards in this pack.", 503);
    const selected = selectWeighted(eligible, recent, random);
    remaining.splice(
      remaining.findIndex((c) => c.id === selected.id),
      1,
    );
    return snapshot(selected);
  });
}
const COMPUTER_OUTCOME = {
  win: "You win",
  loss: "Computer wins",
  draw: "Draw",
};
export function deal(dataset, mode, random = randomInt, packs, recent = []) {
  if (!["first", "second"].includes(mode))
    throw new GameError("Choose who takes the deal.");
  const cards = drawHand(dataset, packs, random, [], recent);
  const computerCards = drawHand(
    dataset,
    packs,
    random,
    cards.map((c) => c.id),
    recent,
  );
  const categories = dataset.categories.map((c) => c.name);
  // A responding computer chooses without access to the player's eventual hidden sin.
  const opponent = computerCards[random(computerCards.length)];
  const ordered = categories
    .map((category, index) => ({
      category,
      index,
      score: opponent.scores[category],
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return {
    roundId: randomUUID(),
    rulesVersion: RULES_VERSION,
    contentVersion: dataset.deck.document_version,
    categories,
    mode,
    cards,
    opponent,
    lockedCategory: ordered[0].category,
    stage: "dealt",
    result: null,
  };
}
export function commit(round, cardId, category) {
  if (round.stage !== "dealt") return round;
  const card = round.cards.find((c) => c.id === cardId);
  if (!card) throw new GameError("Choose your dealt card.");
  const sin = round.mode === "second" ? round.lockedCategory : category;
  if (!round.categories.includes(sin))
    throw new GameError("Choose a valid sin.");
  const yours = card.scores[sin],
    theirs = round.opponent.scores[sin];
  return {
    ...round,
    stage: "committed",
    result: {
      card: card.id,
      category: sin,
      yours,
      theirs,
      outcome: COMPUTER_OUTCOME[compareScores(yours, theirs)],
    },
  };
}
export function reveal(round) {
  if (round.stage === "dealt")
    throw new GameError("Play a card before turning the computer’s card.");
  return { ...round, stage: "revealed" };
}
export function playerView(c) {
  return {
    id: c.id,
    label: c.label,
    front: c.front,
    speaker: c.speaker,
    scores: c.scores,
  };
}
export function view(round) {
  const committed = round.stage !== "dealt";
  const response = {
    roundId: round.roundId || null,
    mode: round.mode,
    cards: round.cards.map(playerView),
    categories: round.categories,
    committed,
    done: round.stage === "revealed",
    contentVersion: round.contentVersion,
    rulesVersion: round.rulesVersion,
  };
  if (round.mode === "second")
    response.opponentFront = {
      id: round.opponent.id,
      label: round.opponent.label,
      front: round.opponent.front,
      speaker: round.opponent.speaker,
    };
  if (committed) {
    response.opponentFront = {
      id: round.opponent.id,
      label: round.opponent.label,
      front: round.opponent.front,
      speaker: round.opponent.speaker,
    };
    response.playedCardId = round.result.card;
    response.played = playerView(
      round.cards.find((c) => c.id === round.result.card),
    );
  }
  if (round.stage === "revealed") {
    response.result = round.result;
    response.opponent = round.opponent;
    response.played = round.cards.find((c) => c.id === round.result.card);
  }
  return response;
}
