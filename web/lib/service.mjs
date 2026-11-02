import { deal,commit,reveal,view } from './game.mjs';
const DAY=86400;
export async function transact(store,dataset,id,input,now=Math.floor(Date.now()/1000)){
 if(!['deal','play','reveal','cancel'].includes(input.action))throw Error('Unknown game action.');
 for(let attempt=0;attempt<4;attempt++){
  const current=await store.read(id);const active=current&&current.expiresAt>now?current:null;
  if(input.action==='cancel'){
   if(!active)return null;
   // Expire the saved round atomically so Cancel also survives a reload.
   if(await store.compareAndSet({...current,version:current.version+1,expiresAt:0},current.version))return null;
   continue;
  }
  if(input.action!=='deal'&&!active)throw Error('This round has expired. Start a new deal.');
  let round;
  if(input.action==='deal'){
   if(active&&active.round.stage!=='revealed')return view(active.round);
   // Retries/double taps after replay return the already-created active round.
   round=deal(dataset,input.mode,undefined,input.playerCardCount===1?1:2);
  }else if(input.action==='play')round=commit(active.round,input.card,input.category);
  else round=reveal(active.round);
  if(active&&round===active.round)return view(round);
  const next={id,version:(current?.version||0)+1,round,expiresAt:active?.expiresAt||now+DAY};
  if(await store.compareAndSet(next,current?.version??null))return view(round);
 }
 throw Error('The round changed in another request. Refresh and try again.');
}

