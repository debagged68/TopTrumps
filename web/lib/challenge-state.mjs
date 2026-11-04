// Pure state transitions for asynchronous human challenges (docs/ASYNC_CHALLENGES.md §6).
// No I/O: the service loads a record, applies one transition and saves it with a
// version check. A transition returns the SAME object when the action was already
// applied, so retries and double taps are no-ops rather than errors.
import { randomBytes } from "node:crypto";
import { GameError, RULES_VERSION, drawHand } from "./game.mjs";
import { resolve } from "./challenge-rules.mjs";

const LIVE = new Set(["draft", "open", "accepted"]);

export function newChallengeId() {
  return randomBytes(16).toString("base64url"); // 128-bit unpredictable public id
}

export function unavailable() {
  return new GameError("This challenge is unavailable.", 404, "unavailable");
}

function next(record, changes) {
  return { ...record, ...changes, version: record.version + 1 };
}

export function roleOf(record, guestId) {
  if (!guestId) return null;
  if (record.senderId === guestId) return "sender";
  if (record.recipientId === guestId) return "recipient";
  return null;
}

// Deadlines are enforced here, never by waiting for DynamoDB TTL to delete a row.
export function effectiveState(record, now) {
  if (LIVE.has(record.state) && now >= record.deadline) return "expired";
  return record.state;
}

// When the row should be physically removed (TTL attribute).
export function purgeAt(record, config) {
  if (record.state === "responded")
    return record.respondedAt + config.resultRetentionSeconds;
  if (LIVE.has(record.state))
    return record.deadline + config.terminalGraceSeconds;
  return (record.endedAt ?? record.deadline) + config.terminalGraceSeconds;
}

// Past its retention window a record is treated as if it no longer exists.
export function isGone(record, now, config) {
  return now >= purgeAt(record, config);
}

function requireRole(record, guestId, role) {
  if (roleOf(record, guestId) !== role) throw unavailable();
}

function requireLive(record, now) {
  const state = effectiveState(record, now);
  if (state === "expired")
    throw new GameError("This challenge has expired.", 410, "expired");
  if (state === "cancelled")
    throw new GameError("This challenge was cancelled.", 410, "cancelled");
  if (state === "declined")
    throw new GameError("This challenge was declined.", 410, "declined");
}

// `recipient` seats a known opponent up front for an asynchronous rematch.
export function createDraft({
  dataset,
  senderId,
  senderName,
  invitedName = null,
  recipient = null,
  now,
  config,
  random,
  parentId = null,
  packs,
  deferDeal = false,
  recent = [],
}) {
  const senderCards = deferDeal
    ? []
    : drawHand(dataset, packs, random, [], recent);
  const senderCard = senderCards[0] ?? null;
  const recipientCard = null;
  return {
    id: newChallengeId(),
    version: 1,
    state: "draft",
    rulesVersion: RULES_VERSION,
    contentVersion: dataset.deck.document_version,
    categories: dataset.categories.map((c) => c.name),
    senderId,
    senderName,
    invitedName,
    recipientId: recipient?.id ?? null,
    recipientName: recipient?.name ?? null,
    handVersion: 2,
    senderCards,
    recipientCards: [],
    senderCard,
    recipientCard,
    chosen: null,
    hints: null,
    inviteGeneration: 1,
    parentId,
    createdAt: now,
    lockedAt: null,
    deadline: now + config.draftSeconds,
    acceptedAt: null,
    respondedAt: null,
    endedAt: null,
    result: null,
    senderRevealedAt: null,
    recipientRevealedAt: null,
  };
}

export function lock(record, guestId, category, now, config, cardId) {
  requireRole(record, guestId, "sender");
  if (record.state !== "draft") {
    if (
      record.chosen === category &&
      (!cardId || record.senderCard.id === cardId)
    )
      return record;
    throw new GameError("This challenge is already locked.", 409, "locked");
  }
  requireLive(record, now);
  const senderCard = (record.senderCards ?? [record.senderCard]).find(
    (c) => c?.id === (cardId ?? record.senderCard?.id),
  );
  if (!senderCard) throw new GameError("Choose your dealt card.");
  if (!record.categories.includes(category))
    throw new GameError("Choose a valid sin.");
  const hints = null;
  // A pre-seated opponent (asynchronous rematch) needs no invitation: locking goes straight to Accepted.
  const seated = Boolean(record.recipientId);
  return next(record, {
    state: seated ? "accepted" : "open",
    senderCard,
    chosen: category,
    hints,
    lockedAt: now,
    acceptedAt: seated ? now : null,
    deadline: now + config.inviteSeconds,
  });
}

// The invitation capability is checked by the service before this runs.
export function accept(record, guestId, nickname, now) {
  if (record.senderId === guestId) {
    throw new GameError(
      "This is your own challenge. Share it with a friend.",
      409,
      "own_challenge",
    );
  }
  if (record.recipientId === guestId) return record;
  if (record.state === "draft") throw unavailable();
  requireLive(record, now);
  if (record.recipientId || record.state !== "open") {
    throw new GameError(
      "Someone has already accepted this challenge.",
      409,
      "already_accepted",
    );
  }
  return next(record, {
    state: "accepted",
    recipientId: guestId,
    recipientName: nickname,
    acceptedAt: now,
  });
}

// The recipient selects one of their pinned cards; the sender's locked sin decides.
export function respond(record, guestId, cardId, now) {
  requireRole(record, guestId, "recipient");
  if (record.state === "responded") return record;
  requireLive(record, now);
  if (record.state !== "accepted") throw unavailable();
  const recipientCard = (record.recipientCards ?? [record.recipientCard]).find(
    (c) => c?.id === cardId,
  );
  if (!recipientCard) throw new GameError("Choose your dealt card.");
  const result = resolve(record.senderCard, recipientCard, record.chosen);
  return next(record, {
    state: "responded",
    recipientCard,
    respondedAt: now,
    result,
  });
}

// Per-viewer reveal controls disclosure and celebration; the result is already fixed.
export function reveal(record, guestId, now) {
  const role = roleOf(record, guestId);
  if (!role) throw unavailable();
  if (record.state !== "responded") {
    requireLive(record, now);
    throw new GameError("The result is not ready yet.", 409, "not_ready");
  }
  const field = role === "sender" ? "senderRevealedAt" : "recipientRevealedAt";
  if (record[field]) return record;
  return next(record, { [field]: now });
}

// Allowed before a response, including after acceptance. The terminal state blocks all
// further play, while the old invitation still proves enough to show "Cancelled".
export function cancel(record, guestId, now) {
  requireRole(record, guestId, "sender");
  if (record.state === "cancelled") return record;
  if (record.state === "responded") {
    throw new GameError(
      "Your friend has already played this challenge.",
      409,
      "responded",
    );
  }
  requireLive(record, now);
  return next(record, { state: "cancelled", endedAt: now });
}

export function decline(record, guestId, now) {
  requireRole(record, guestId, "recipient");
  if (record.state === "declined") return record;
  if (record.state === "responded") {
    throw new GameError(
      "You have already played this challenge.",
      409,
      "responded",
    );
  }
  requireLive(record, now);
  return next(record, { state: "declined", endedAt: now });
}

// Each participant chooses packs once; refresh/retries never produce another hand.
export function dealHand(
  record,
  guestId,
  dataset,
  packs,
  now,
  random,
  recent = [],
) {
  const role = roleOf(record, guestId);
  if (!role) throw unavailable();
  requireLive(record, now);
  if (
    (role === "sender" && record.state !== "draft") ||
    (role === "recipient" && record.state !== "accepted")
  )
    throw new GameError("Your hand is already locked.", 409);
  const field = role === "sender" ? "senderCards" : "recipientCards";
  if (record[field]?.length || !record.handVersion) return record;
  const cards = drawHand(
    dataset,
    packs,
    random,
    role === "recipient"
      ? (record.senderCards ?? [record.senderCard])
          .filter(Boolean)
          .map((card) => card.id)
      : [],
    recent,
  );
  return next(record, {
    [field]: cards,
    [role === "sender" ? "senderCard" : "recipientCard"]: cards[0],
  });
}
