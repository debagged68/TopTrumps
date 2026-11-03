// Human-challenge rules. Card drawing and score comparison come from game.mjs so the
// computer and human paths share one implementation.
import { compareScores, drawDistinct, eligibleCards, GameError } from './game.mjs';
import { randomInt } from 'node:crypto';

// Two distinct eligible cards: the sender's and the reserved recipient card.
export function drawPair(dataset, random = randomInt) {
  const eligible = eligibleCards(dataset);
  if (eligible.length < 2) {
    throw new GameError('Challenges are unavailable right now.', 503, 'unavailable');
  }
  const [senderCard, recipientCard] = drawDistinct(eligible, 2, random);
  return { senderCard, recipientCard };
}

// Hints are the chosen sin plus one decoy: the strongest OTHER sin on the sender's card,
// ties broken by canonical deck order. Returned in canonical order so neither rank nor
// choice order identifies the real one.
export function pickHints(senderCard, chosen, categories) {
  if (!categories.includes(chosen)) throw new GameError('Choose a valid sin.');
  const decoy = categories
    .map((category, index) => ({ category, index, score: senderCard.scores[category] }))
    .filter(entry => entry.category !== chosen)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0].category;
  return categories.filter(category => category === chosen || category === decoy);
}

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
