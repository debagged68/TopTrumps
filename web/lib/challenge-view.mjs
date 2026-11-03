// Role-aware projections implementing the disclosure matrix in docs/ASYNC_CHALLENGES.md §5.
// Every response is built from an explicit allowlist; never spread a stored record.
import { playerView } from './game.mjs';
import { effectiveState, roleOf } from './challenge-state.mjs';
import { outcomeFor } from './challenge-rules.mjs';

function quoteFront(card) {
  return { id: card.id, label: card.label, front: card.front, speaker: card.speaker };
}

function fullCard(card) {
  return { ...playerView(card), links: card.links.map(link => [...link]) };
}

function revealedAt(record, role) {
  return role === 'sender' ? record.senderRevealedAt : record.recipientRevealedAt;
}

// Status labels for the challenge page and My challenges.
export function statusFor(record, role, now) {
  const state = effectiveState(record, now);
  if (state === 'draft') return role === 'recipient' ? 'waiting_for_sender' : 'draft';
  if (state === 'open') return 'awaiting_reply';
  if (state === 'accepted') return role === 'sender' ? 'accepted' : 'your_turn';
  if (state === 'responded') return revealedAt(record, role) ? 'completed' : 'result_ready';
  return state; // cancelled | declined | expired
}

export function projectChallenge(record, role, now) {
  if (role !== 'sender' && role !== 'recipient') throw Error('A participant role is required.');
  const state = effectiveState(record, now);
  const own = role === 'sender' ? record.senderCard : record.recipientCard;
  const other = role === 'sender' ? record.recipientCard : record.senderCard;
  const view = {
    id: record.id,
    version: record.version,
    role,
    state,
    status: statusFor(record, role, now),
    yourName: role === 'sender' ? record.senderName : record.recipientName,
    opponentName: role === 'sender' ? record.recipientName : record.senderName,
    categories: [...record.categories],
    contentVersion: record.contentVersion,
    rulesVersion: record.rulesVersion,
    createdAt: record.createdAt,
    deadline: ['draft', 'open', 'accepted'].includes(state) ? record.deadline : null,
    card: playerView(own),
  };
  // The sender knows the sin they chose; the recipient only ever sees the two possibilities.
  if (role === 'sender' && record.chosen) view.chosen = record.chosen;
  if (record.hints) view.hints = [...record.hints];
  if (state === 'responded') {
    view.opponentFront = quoteFront(other);
    if (revealedAt(record, role)) {
      const yours = role === 'sender' ? record.result.senderScore : record.result.recipientScore;
      const theirs = role === 'sender' ? record.result.recipientScore : record.result.senderScore;
      view.card = fullCard(own);
      view.opponent = fullCard(other);
      view.result = { category: record.result.category, yours, theirs, outcome: outcomeFor(record.result, role) };
    }
  }
  return view;
}

// Compact entry for My challenges. Result-ready entries conceal the outcome until the
// viewer reveals it.
export function summarizeChallenge(record, role, now) {
  const status = statusFor(record, role, now);
  const summary = {
    id: record.id,
    role,
    status,
    opponentName: role === 'sender' ? record.recipientName : record.senderName,
    createdAt: record.createdAt,
    deadline: ['draft', 'waiting_for_sender', 'awaiting_reply', 'accepted', 'your_turn'].includes(status) ? record.deadline : null,
  };
  if (status === 'completed') {
    summary.category = record.result.category;
    summary.outcome = outcomeFor(record.result, role);
  }
  return summary;
}

export function viewerRole(record, guestId) {
  return roleOf(record, guestId);
}
