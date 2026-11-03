// Pure state transitions for asynchronous human challenges (docs/ASYNC_CHALLENGES.md §6).
// No I/O: the service loads a record, applies one transition and saves it with a
// version check. A transition returns the SAME object when the action was already
// applied, so retries and double taps are no-ops rather than errors.
import { randomBytes } from 'node:crypto';
import { GameError, RULES_VERSION } from './game.mjs';
import { drawPair, pickHints, resolve } from './challenge-rules.mjs';

const LIVE = new Set(['draft', 'open', 'accepted']);

export function newChallengeId() {
  return randomBytes(16).toString('base64url'); // 128-bit unpredictable public id
}

export function unavailable() {
  return new GameError('This challenge is unavailable.', 404, 'unavailable');
}

function next(record, changes) {
  return { ...record, ...changes, version: record.version + 1 };
}

export function roleOf(record, guestId) {
  if (!guestId) return null;
  if (record.senderId === guestId) return 'sender';
  if (record.recipientId === guestId) return 'recipient';
  return null;
}

// Deadlines are enforced here, never by waiting for DynamoDB TTL to delete a row.
export function effectiveState(record, now) {
  if (LIVE.has(record.state) && now >= record.deadline) return 'expired';
  return record.state;
}

// When the row should be physically removed (TTL attribute).
export function purgeAt(record, config) {
  if (record.state === 'responded') return record.respondedAt + config.resultRetentionSeconds;
  if (LIVE.has(record.state)) return record.deadline + config.terminalGraceSeconds;
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
  if (state === 'expired') throw new GameError('This challenge has expired.', 410, 'expired');
  if (state === 'cancelled') throw new GameError('This challenge was cancelled.', 410, 'cancelled');
  if (state === 'declined') throw new GameError('This challenge was declined.', 410, 'declined');
}

// `recipient` seats a known opponent up front (a live rematch); otherwise the seat opens at lock.
export function createDraft({ dataset, senderId, senderName, recipient = null, now, config, random, parentId = null }) {
  const { senderCard, recipientCard } = drawPair(dataset, random);
  return {
    id: newChallengeId(),
    version: 1,
    state: 'draft',
    rulesVersion: RULES_VERSION,
    contentVersion: dataset.deck.document_version,
    categories: dataset.categories.map(c => c.name),
    senderId,
    senderName,
    recipientId: recipient?.id ?? null,
    recipientName: recipient?.name ?? null,
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

export function lock(record, guestId, category, now, config) {
  requireRole(record, guestId, 'sender');
  if (record.state !== 'draft') {
    if (record.chosen === category) return record;
    throw new GameError('This challenge is already locked.', 409, 'locked');
  }
  requireLive(record, now);
  const hints = pickHints(record.senderCard, category, record.categories);
  // A pre-seated opponent (live rematch) needs no invitation: locking goes straight to Accepted.
  const seated = Boolean(record.recipientId);
  return next(record, {
    state: seated ? 'accepted' : 'open', chosen: category, hints, lockedAt: now,
    acceptedAt: seated ? now : null, deadline: now + config.inviteSeconds,
  });
}

// The invitation capability is checked by the service before this runs.
export function accept(record, guestId, nickname, now) {
  if (record.senderId === guestId) {
    throw new GameError('This is your own challenge. Share it with a friend.', 409, 'own_challenge');
  }
  if (record.recipientId === guestId) return record;
  if (record.state === 'draft') throw unavailable();
  requireLive(record, now);
  if (record.recipientId || record.state !== 'open') {
    throw new GameError('Someone has already accepted this challenge.', 409, 'already_accepted');
  }
  return next(record, { state: 'accepted', recipientId: guestId, recipientName: nickname, acceptedAt: now });
}

// The recipient only chooses whether to play their reserved card; the sender's locked
// sin decides. No category is accepted from the client.
export function respond(record, guestId, cardId, now) {
  requireRole(record, guestId, 'recipient');
  if (record.state === 'responded') return record;
  requireLive(record, now);
  if (record.state !== 'accepted') throw unavailable();
  if (cardId !== record.recipientCard.id) throw new GameError('Choose your dealt card.');
  const result = resolve(record.senderCard, record.recipientCard, record.chosen);
  return next(record, { state: 'responded', respondedAt: now, result });
}

// Per-viewer reveal controls disclosure and celebration; the result is already fixed.
export function reveal(record, guestId, now) {
  const role = roleOf(record, guestId);
  if (!role) throw unavailable();
  if (record.state !== 'responded') {
    requireLive(record, now);
    throw new GameError('The result is not ready yet.', 409, 'not_ready');
  }
  const field = role === 'sender' ? 'senderRevealedAt' : 'recipientRevealedAt';
  if (record[field]) return record;
  return next(record, { [field]: now });
}

// Allowed before a response, including after acceptance. The terminal state blocks all
// further play, while the old invitation still proves enough to show "Cancelled".
export function cancel(record, guestId, now) {
  requireRole(record, guestId, 'sender');
  if (record.state === 'cancelled') return record;
  if (record.state === 'responded') {
    throw new GameError('Your friend has already played this challenge.', 409, 'responded');
  }
  requireLive(record, now);
  return next(record, { state: 'cancelled', endedAt: now });
}

export function decline(record, guestId, now) {
  requireRole(record, guestId, 'recipient');
  if (record.state === 'declined') return record;
  if (record.state === 'responded') {
    throw new GameError('You have already played this challenge.', 409, 'responded');
  }
  requireLive(record, now);
  return next(record, { state: 'declined', endedAt: now });
}
