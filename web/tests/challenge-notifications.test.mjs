import {test} from 'node:test';
import assert from 'node:assert/strict';
import {challengeUpdateMessage} from '../lib/challenge-notifications.mjs';
test('accepted and played updates identify the friend, including a fast response',()=>{
 const before={status:'awaiting_reply'};
 assert.equal(challengeUpdateMessage(before,{role:'sender',status:'accepted',opponentName:'Bob'}),'Bob accepted your challenge.');
 assert.equal(challengeUpdateMessage(before,{role:'sender',status:'result_ready',opponentName:'Bob'}),'Bob has played. Your result is ready.');
});
test('initial loads, unchanged states and own moves never announce friend acceptance',()=>{
 assert.equal(challengeUpdateMessage(null,{role:'sender',status:'accepted'}),null);
 assert.equal(challengeUpdateMessage({status:'accepted'},{role:'sender',status:'accepted'}),null);
 assert.equal(challengeUpdateMessage({status:'draft'},{role:'sender',status:'awaiting_reply'}),null);
 assert.equal(challengeUpdateMessage({status:'your_turn'},{role:'recipient',status:'result_ready'}),null);
});
test('a rematch turn update identifies the dealer',()=>{
 assert.equal(challengeUpdateMessage({status:'waiting_for_sender'},{role:'recipient',status:'your_turn',opponentName:'Ann'}),'Ann has dealt. It’s your turn.');
});
