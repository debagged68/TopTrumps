import { deal,commit,reveal,view,GameError } from './game.mjs';
const DAY=86400;
export async function transact(store,dataset,id,input,now=Math.floor(Date.now()/1000)){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new GameError('Invalid request.');
 if(!['deal','play','reveal','cancel'].includes(input.action))throw new GameError('Unknown game action.');
 for(let attempt=0;attempt<4;attempt++){
  const current=await store.read(id);const active=current&&current.expiresAt>now?current:null;
  if(input.action==='cancel'){
   if(!active)return null;
   // Expire the saved round atomically so Cancel also survives a reload.
   // Use the current time, not 0: DynamoDB TTL ignores timestamps older than about five years, so the item would never be deleted.
   if(await store.compareAndSet({...current,version:current.version+1,expiresAt:now},current.version))return null;
   continue;
  }
  if(input.action!=='deal'&&!active)throw new GameError('This round has expired. Start a new deal.');
  let round;
  if(input.action==='deal'){
   if(active&&active.round.stage!=='revealed')return view(active.round);
   // Retries/double taps after replay return the already-created active round.
   round=deal(dataset,input.mode,undefined,input.playerCardCount===1?1:2);
  }else if(input.action==='play')round=commit(active.round,input.card,input.category);
  else round=reveal(active.round);
  if(active&&round===active.round)return view(round);
  // A new deal gets a fresh 24h window; play and reveal keep the round's original expiry.
  const next={id,version:(current?.version||0)+1,round,expiresAt:input.action==='deal'?now+DAY:active.expiresAt};
  if(await store.compareAndSet(next,current?.version??null))return view(round);
 }
 throw new GameError('The round changed in another request. Refresh and try again.',409);
}

