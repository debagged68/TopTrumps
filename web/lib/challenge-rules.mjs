// Human challenges reuse the same score comparison as computer play.
import { compareScores } from './game.mjs';

// Canonical, viewer-neutral result. Wording such as "You win" is never stored.
export function resolve(senderCard, recipientCard, category) {
  const senderScore = senderCard.scores[category];
  const recipientScore = recipientCard.scores[category];
  const comparison = compareScores(senderScore, recipientScore);
  const winnerRole = comparison === 'win' ? 'sender' : comparison === 'loss' ? 'recipient' : null;
  return { category, senderScore, recipientScore, winnerRole };
}

export function outcomeFor(result, role) {
  if (result.winnerRole === null) return 'draw';
  return result.winnerRole === role ? 'win' : 'loss';
}

export function otherRole(role) {
  return role === 'sender' ? 'recipient' : 'sender';
}
