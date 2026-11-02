import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyTally,parseTally,recordResult} from '../lib/tally.mjs';
import {deal,commit,reveal,view} from '../lib/game.mjs';
import {readFileSync} from 'node:fs';
const dataset=JSON.parse(readFileSync(new URL('../data/donald.json',import.meta.url)));
test('a result is counted once across storage restore, repeated reveal and page refresh',()=>{
 const first=recordResult(emptyTally(),'round-1','You win');
 const restored=parseTally(JSON.stringify(first));
 assert.strictEqual(recordResult(restored,'round-1','You win'),restored);
 assert.equal(restored.wins,1);
 const next=recordResult(recordResult(restored,'round-2','Computer wins'),'round-3','Draw');
 assert.deepEqual([next.wins,next.losses,next.draws],[1,1,1]);
 assert.strictEqual(recordResult(next,'round-4','invalid'),next);
});
test('corrupt or invalid stored totals recover to a clean tally',()=>{
 for(const raw of ['broken','null','{}','{"wins":-1,"losses":0,"draws":0,"counted":[]}'])assert.deepEqual(parseTally(raw),emptyTally());
});
test('identical dealt cards in different rounds still get distinct stable tally identities',()=>{
 const first=deal(dataset,'first',()=>0),second=deal(dataset,'first',()=>0);
 assert.notEqual(first.roundId,second.roundId);
 const result=view(reveal(commit(first,first.cards[0].id,'Pride')));
 assert.equal(view(first).roundId,result.roundId);
 assert.equal(view(commit(first,first.cards[0].id,'Pride')).roundId,result.roundId);
 const legacy={...first};delete legacy.roundId;assert.equal(view(legacy).roundId,null);
});
