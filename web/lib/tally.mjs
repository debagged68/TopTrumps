export function emptyTally(){return {wins:0,losses:0,draws:0,counted:[]};}
export function parseTally(raw){
 try{
  const value=JSON.parse(raw);
  if(!value||!['wins','losses','draws'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0)||!Array.isArray(value.counted)||!value.counted.every(id=>typeof id==='string'))return emptyTally();
  return {wins:value.wins,losses:value.losses,draws:value.draws,counted:value.counted};
 }catch{return emptyTally();}
}
export function recordResult(tally,roundId,outcome){
 const field={'You win':'wins','Computer wins':'losses','Draw':'draws'}[outcome];
 if(!field||!roundId||tally.counted.includes(roundId))return tally;
 return {...tally,[field]:tally[field]+1,counted:[...tally.counted,roundId]};
}
