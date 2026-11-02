import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deal,commit,reveal,view } from '../lib/game.mjs';
import { transact } from '../lib/service.mjs';
const dataset=JSON.parse(readFileSync(new URL('../data/donald.json',import.meta.url)));
function memory(){const records=new Map();return {async read(id){return structuredClone(records.get(id)||null)},async compareAndSet(record,version){if((records.get(record.id)?.version??null)!==version)return false;records.set(record.id,structuredClone(record));return true;}}}
test('both modes pin distinct eligible cards, own scores visible, house data absent until reveal',()=>{
for(const mode of ['first','second'])for(let i=0;i<100;i++){
 const r=deal(dataset,mode),v=view(r);assert.equal(new Set([...r.cards.map(c=>c.id),r.opponent.id]).size,3);assert(r.cards.every(c=>dataset.cards.find(x=>x.id===c.id).status==='candidate'));
 assert(!('opponent'in v));assert(!('result'in v));assert(!('lockedCategory'in v));assert(v.cards.every(c=>Object.keys(c.scores).length===6));
 if(mode==='second')assert(v.hints.includes(r.lockedCategory));
 const committed=commit(r,r.cards[0].id,'Pride');assert.equal(committed.result.category,mode==='second'?r.lockedCategory:'Pride');assert(!('opponent'in view(committed)));assert(!('result'in view(committed)));assert.equal(view(committed).committed,true);
 const result=view(reveal(committed));assert(result.done);assert(result.opponent);assert.equal(result.result.outcome,result.result.yours>result.result.theirs?'You win':result.result.yours<result.result.theirs?'Computer wins':'Draw');
 assert.deepEqual(commit(committed,r.cards[1].id,'Wrath'),committed);
}});
test('invalid choices and early reveal are rejected',()=>{const r=deal(dataset,'first');assert.throws(()=>commit(r,r.opponent.id,'Pride'));assert.throws(()=>commit(r,r.cards[0].id,'Unknown'));assert.throws(()=>reveal(r));assert.throws(()=>deal(dataset,'bad'));});
test('equal scores draw, tied top-two ordering follows categories',()=>{const d=structuredClone(dataset);d.cards=d.cards.slice(0,3).map(c=>({...c,status:'candidate',scores:Object.fromEntries(d.categories.map(x=>[x.name,50]))}));const r=deal(d,'second',()=>0);assert.deepEqual(r.hints,['Pride','Greed']);assert.equal(commit(r,r.cards[0].id,'Wrath').result.outcome,'Draw');});
test('snapshot scores survive later editorial mutations',()=>{const d=structuredClone(dataset),r=deal(d,'first',()=>0),score=r.cards[0].scores.Pride;d.cards.forEach(c=>c.scores.Pride=1);assert.equal(commit(r,r.cards[0].id,'Pride').result.yours,score);});
test('concurrent initial deals, plays and reveal are idempotent',async()=>{const store=memory(),id='session',now=1000;const deals=await Promise.all(Array.from({length:10},()=>transact(store,dataset,id,{action:'deal',mode:'first'},now)));for(const d of deals)assert.deepEqual(d,deals[0]);const plays=await Promise.all([transact(store,dataset,id,{action:'play',card:deals[0].cards[0].id,category:'Pride'},now),transact(store,dataset,id,{action:'play',card:deals[0].cards[1].id,category:'Wrath'},now)]);assert.deepEqual(plays[0],plays[1]);const revealed=await Promise.all([transact(store,dataset,id,{action:'reveal'},now),transact(store,dataset,id,{action:'reveal'},now)]);assert.deepEqual(revealed[0],revealed[1]);});
test('expired rounds cannot be committed; new deal replaces expired record',async()=>{const store=memory();const d=await transact(store,dataset,'expiry',{action:'deal',mode:'first'},1000);await assert.rejects(transact(store,dataset,'expiry',{action:'play',card:d.cards[0].id,category:'Pride'},1000+86401),/expired/);const next=await transact(store,dataset,'expiry',{action:'deal',mode:'second'},1000+86401);assert.equal(next.mode,'second');});
test('unknown actions do not resolve a round',async()=>{await assert.rejects(transact(memory(),dataset,'id',{action:'oops'}),/Unknown/);});
