import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deal,commit,reveal,view,GameError } from '../lib/game.mjs';
import { transact } from '../lib/service.mjs';
const dataset=JSON.parse(readFileSync(new URL('../data/donald.json',import.meta.url)));
function memory(){const records=new Map();return {async read(id){return structuredClone(records.get(id)||null)},async compareAndSet(record,version){if((records.get(record.id)?.version??null)!==version)return false;records.set(record.id,structuredClone(record));return true;}}}
test('both modes pin distinct eligible cards, own scores visible, house data absent until reveal',()=>{
for(const mode of ['first','second'])for(let i=0;i<100;i++){
 const r=deal(dataset,mode),v=view(r);assert.equal(new Set([...r.cards.map(c=>c.id),r.opponent.id]).size,3);assert(r.cards.every(c=>dataset.cards.find(x=>x.id===c.id).status==='candidate'));
 assert(!('opponent'in v));assert(!('opponentFront'in v));assert(!('result'in v));assert(!('lockedCategory'in v));assert(v.cards.every(c=>Object.keys(c.scores).length===6));
 if(mode==='second')assert(v.hints.includes(r.lockedCategory));
 const committed=commit(r,r.cards[0].id,'Pride');assert.equal(committed.result.category,mode==='second'?r.lockedCategory:'Pride');assert(!('opponent'in view(committed)));assert(!('result'in view(committed)));assert.equal(view(committed).opponentFront.front,r.opponent.front);assert(!('scores' in view(committed).opponentFront));assert(!('lockedCategory' in view(committed)));assert.equal(view(committed).committed,true);
 const result=view(reveal(committed));assert(result.done);assert(result.opponent);assert.equal(result.result.outcome,result.result.yours>result.result.theirs?'You win':result.result.yours<result.result.theirs?'Computer wins':'Draw');
 assert.deepEqual(commit(committed,r.cards[1].id,'Wrath'),committed);
}});
test('invalid choices and early reveal are rejected',()=>{const r=deal(dataset,'first');assert.throws(()=>commit(r,r.opponent.id,'Pride'));assert.throws(()=>commit(r,r.cards[0].id,'Unknown'));assert.throws(()=>reveal(r));assert.throws(()=>deal(dataset,'bad'));});
test('equal scores draw, tied top-two ordering follows categories',()=>{const d=structuredClone(dataset);d.cards=d.cards.slice(0,3).map(c=>({...c,status:'candidate',scores:Object.fromEntries(d.categories.map(x=>[x.name,50]))}));const r=deal(d,'second',()=>0);assert.deepEqual(r.hints,['Pride','Greed']);assert.equal(commit(r,r.cards[0].id,'Wrath').result.outcome,'Draw');});
test('snapshot scores survive later editorial mutations',()=>{const d=structuredClone(dataset),r=deal(d,'first',()=>0),score=r.cards[0].scores.Pride;d.cards.forEach(c=>c.scores.Pride=1);assert.equal(commit(r,r.cards[0].id,'Pride').result.yours,score);});
test('concurrent initial deals, plays and reveal are idempotent',async()=>{const store=memory(),id='session',now=1000;const deals=await Promise.all(Array.from({length:10},()=>transact(store,dataset,id,{action:'deal',mode:'first'},now)));for(const d of deals)assert.deepEqual(d,deals[0]);const plays=await Promise.all([transact(store,dataset,id,{action:'play',card:deals[0].cards[0].id,category:'Pride'},now),transact(store,dataset,id,{action:'play',card:deals[0].cards[1].id,category:'Wrath'},now)]);assert.deepEqual(plays[0],plays[1]);const revealed=await Promise.all([transact(store,dataset,id,{action:'reveal'},now),transact(store,dataset,id,{action:'reveal'},now)]);assert.deepEqual(revealed[0],revealed[1]);});
test('expired rounds cannot be committed; new deal replaces expired record',async()=>{const store=memory();const d=await transact(store,dataset,'expiry',{action:'deal',mode:'first'},1000);await assert.rejects(transact(store,dataset,'expiry',{action:'play',card:d.cards[0].id,category:'Pride'},1000+86401),/expired/);const next=await transact(store,dataset,'expiry',{action:'deal',mode:'second'},1000+86401);assert.equal(next.mode,'second');});
test('unknown actions do not resolve a round',async()=>{await assert.rejects(transact(memory(),dataset,'id',{action:'oops'}),/Unknown/);});

test('cancel expires a saved round, is idempotent and permits a different new deal',async()=>{
 const store=memory(),id='cancel';
 await transact(store,dataset,id,{action:'deal',mode:'first',playerCardCount:1},1000);
 const results=await Promise.all([transact(store,dataset,id,{action:'cancel'},1001),transact(store,dataset,id,{action:'cancel'},1001)]);
 assert.deepEqual(results,[null,null]);assert.equal((await store.read(id)).expiresAt,1001);
 await assert.rejects(transact(store,dataset,id,{action:'play',card:'ignored',category:'Pride'},1002),/expired/);
 const next=await transact(store,dataset,id,{action:'deal',mode:'second',playerCardCount:1},1003);
 assert.equal(next.mode,'second');assert.equal(next.cards.length,1);
});

test('Deal second keeps its locked sin across restore, misleading client category and manual reveal',async()=>{const store=memory();const initial=await transact(store,dataset,'second-lock',{action:'deal',mode:'second'},1000);const saved=await store.read('second-lock');const locked=saved.round.lockedCategory;assert(initial.hints.includes(locked));const other=initial.hints.find(x=>x!==locked);const committed=await transact(store,dataset,'second-lock',{action:'play',card:initial.cards[1].id,category:other},1000);assert(!('result'in committed));const restored=view((await store.read('second-lock')).round);assert.deepEqual(restored.hints,initial.hints);const result=await transact(store,dataset,'second-lock',{action:'reveal'},1000);assert.equal(result.result.category,locked);assert(initial.hints.includes(result.result.category));});

test('mobile gets exactly one player card and keeps both deal modes and manual reveal',async()=>{for(const mode of ['first','second']){const store=memory(),id='mobile-'+mode;const dealt=await transact(store,dataset,id,{action:'deal',mode,playerCardCount:1},1000);assert.equal(dealt.cards.length,1);const record=await store.read(id);assert.notEqual(record.round.opponent.id,dealt.cards[0].id);const played=await transact(store,dataset,id,{action:'play',card:dealt.cards[0].id,category:'Pride'},1000);assert(played.committed);assert.equal(played.cards.length,1);assert(!('result'in played));const result=await transact(store,dataset,id,{action:'reveal'},1000);assert(result.done);assert.equal(result.result.category,mode==='first'?'Pride':record.round.lockedCategory);}});


test('a replayed round gets a fresh 24h window, not the previous expiry',async()=>{
 const store=memory(),id='fresh';const d=await transact(store,dataset,id,{action:'deal',mode:'first'},1000);
 await transact(store,dataset,id,{action:'play',card:d.cards[0].id,category:'Pride'},1000);await transact(store,dataset,id,{action:'reveal'},1000);
 const late=1000+86399;await transact(store,dataset,id,{action:'deal',mode:'first'},late);
 assert.equal((await store.read(id)).expiresAt,late+86400);
 const again=await transact(store,dataset,id,{action:'play',card:(await store.read(id)).round.cards[0].id,category:'Pride'},late+60);
 assert(again.committed);
});
test('invalid bodies and rule violations raise GameError, not server faults',async()=>{
 for(const bad of [null,'x',[],42])await assert.rejects(transact(memory(),dataset,'id',bad),e=>e instanceof GameError&&e.status===400);
 await assert.rejects(transact(memory(),dataset,'id',{action:'deal',mode:'bad'}),e=>e instanceof GameError);
});
