import { randomInt } from 'node:crypto';
export const RULES_VERSION='2.3';
export function snapshot(card){return {id:card.id,label:card.label,front:card.front,speaker:card.speaker,scores:{...card.scores},rationale:{...card.rationale},links:card.links.map(x=>[...x])};}
export function deal(dataset,mode,random=randomInt,playerCardCount=2){
 if(!['first','second'].includes(mode))throw Error('Choose Deal first or Deal second.');
 const cards=dataset.cards.filter(c=>c.status==='candidate');if(![1,2].includes(playerCardCount))throw Error('Choose a valid player card count.');if(cards.length<playerCardCount+1)throw Error('At least three eligible cards are required.');
 const categories=dataset.categories.map(c=>c.name),remaining=[...cards];const draw=()=>snapshot(remaining.splice(random(remaining.length),1)[0]);
 const opponent=draw();const ordered=categories.map((category,index)=>({category,index,score:opponent.scores[category]})).sort((a,b)=>b.score-a.score||a.index-b.index);
 const top=ordered.slice(0,2).map(x=>x.category);
 return {rulesVersion:RULES_VERSION,contentVersion:dataset.deck.document_version,categories,mode,cards:Array.from({length:playerCardCount},()=>draw()),opponent,lockedCategory:top[random(2)],hints:categories.filter(c=>top.includes(c)),stage:'dealt',result:null};
}
export function commit(round,cardId,category){
 if(round.stage!=='dealt')return round;
 const card=round.cards.find(c=>c.id===cardId);if(!card)throw Error('Choose your dealt card.');
 const sin=round.mode==='second'?round.lockedCategory:category;if(!round.categories.includes(sin))throw Error('Choose a valid sin.');
 const yours=card.scores[sin],theirs=round.opponent.scores[sin];
 return {...round,stage:'committed',result:{card:card.id,category:sin,yours,theirs,outcome:yours>theirs?'You win':yours<theirs?'Computer wins':'Draw'}};
}
export function reveal(round){if(round.stage==='dealt')throw Error('Play a card before turning the computer’s card.');return {...round,stage:'revealed'};}
function playerView(c){return {id:c.id,label:c.label,front:c.front,speaker:c.speaker,scores:c.scores};}
export function view(round){
 const committed=round.stage!=='dealt';
 const response={mode:round.mode,cards:round.cards.map(playerView),categories:round.categories,committed,done:round.stage==='revealed',contentVersion:round.contentVersion,rulesVersion:round.rulesVersion};
 if(round.mode==='second')response.hints=round.hints;
 if(committed){response.opponentFront={id:round.opponent.id,label:round.opponent.label,front:round.opponent.front,speaker:round.opponent.speaker};response.playedCardId=round.result.card;response.played=playerView(round.cards.find(c=>c.id===round.result.card));}
 if(round.stage==='revealed'){response.result=round.result;response.opponent=round.opponent;response.played=round.cards.find(c=>c.id===round.result.card);}
 return response;
}
