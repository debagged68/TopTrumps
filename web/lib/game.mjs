import { randomInt,randomUUID } from 'node:crypto';
export const RULES_VERSION='2.4';
// Player-facing rule violations. Anything else thrown is treated as a server fault.
export class GameError extends Error{constructor(message,status=400,code='invalid'){super(message);this.name='GameError';this.status=status;this.code=code;}}
export function snapshot(card){return {id:card.id,label:card.label,front:card.front,speaker:card.speaker,scores:{...card.scores},rationale:{...card.rationale},links:card.links.map(x=>[...x])};}
// Shared primitives: computer rounds and human challenges must use these, never a copy.
export function eligibleCards(dataset){return dataset.cards.filter(c=>c.status==='candidate');}
// Draw `count` distinct cards without replacement. random(n) returns an integer in [0, n).
export function drawDistinct(cards,count,random=randomInt){
 const remaining=[...cards];
 return Array.from({length:count},()=>snapshot(remaining.splice(random(remaining.length),1)[0]));
}
// The one place a score comparison happens. 'win' means `first` beats `second`.
export function compareScores(first,second){return first>second?'win':first<second?'loss':'draw';}
const COMPUTER_OUTCOME={win:'You win',loss:'Computer wins',draw:'Draw'};
// Every player on every screen size is dealt exactly one card against the computer's.
export function deal(dataset,mode,random=randomInt){
 if(!['first','second'].includes(mode))throw new GameError('Choose Deal first or Deal second.');
 const cards=eligibleCards(dataset);if(cards.length<2)throw Error('At least two eligible cards are required.');
 const categories=dataset.categories.map(c=>c.name);
 const [opponent,...dealt]=drawDistinct(cards,2,random);const ordered=categories.map((category,index)=>({category,index,score:opponent.scores[category]})).sort((a,b)=>b.score-a.score||a.index-b.index);
 const top=ordered.slice(0,2).map(x=>x.category);
 return {roundId:randomUUID(),rulesVersion:RULES_VERSION,contentVersion:dataset.deck.document_version,categories,mode,cards:dealt,opponent,lockedCategory:top[random(2)],hints:categories.filter(c=>top.includes(c)),stage:'dealt',result:null};
}
export function commit(round,cardId,category){
 if(round.stage!=='dealt')return round;
 const card=round.cards.find(c=>c.id===cardId);if(!card)throw new GameError('Choose your dealt card.');
 const sin=round.mode==='second'?round.lockedCategory:category;if(!round.categories.includes(sin))throw new GameError('Choose a valid sin.');
 const yours=card.scores[sin],theirs=round.opponent.scores[sin];
 return {...round,stage:'committed',result:{card:card.id,category:sin,yours,theirs,outcome:COMPUTER_OUTCOME[compareScores(yours,theirs)]}};
}
export function reveal(round){if(round.stage==='dealt')throw new GameError('Play a card before turning the computer’s card.');return {...round,stage:'revealed'};}
export function playerView(c){return {id:c.id,label:c.label,front:c.front,speaker:c.speaker,scores:c.scores};}
export function view(round){
 const committed=round.stage!=='dealt';
 const response={roundId:round.roundId||null,mode:round.mode,cards:round.cards.map(playerView),categories:round.categories,committed,done:round.stage==='revealed',contentVersion:round.contentVersion,rulesVersion:round.rulesVersion};
 if(round.mode==='second')response.hints=round.hints;
 if(committed){response.opponentFront={id:round.opponent.id,label:round.opponent.label,front:round.opponent.front,speaker:round.opponent.speaker};response.playedCardId=round.result.card;response.played=playerView(round.cards.find(c=>c.id===round.result.card));}
 if(round.stage==='revealed'){response.result=round.result;response.opponent=round.opponent;response.played=round.cards.find(c=>c.id===round.result.card);}
 return response;
}

