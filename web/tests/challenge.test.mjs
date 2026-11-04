import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameError, drawHand } from '../lib/game.mjs';
import { CHALLENGE_DEFAULTS, challengeConfig } from '../lib/challenge-config.mjs';
import { resolve, outcomeFor } from '../lib/challenge-rules.mjs';
import * as S from '../lib/challenge-state.mjs';
import { projectChallenge, summarizeChallenge } from '../lib/challenge-view.mjs';

const dataset = JSON.parse(readFileSync(new URL('../data/donald.json', import.meta.url)));
const config = CHALLENGE_DEFAULTS;
const T0 = 1_000_000;
const draft = (now = T0) => S.createDraft({ dataset, senderId: 'A', senderName: 'Ann', now, config });
const opened = (cat = 'Wrath') => S.lock(draft(), 'A', cat, T0 + 1, config);
const accepted = () => S.dealHand(S.accept(opened(), 'B', 'Bob', T0 + 2), 'B', dataset, ['donald','donald'], T0 + 2);
const responded = () => { const a = accepted(); return S.respond(a, 'B', a.recipientCard.id, T0 + 3); };
const code = fn => { try { fn(); } catch (e) { return e.code; } return null; };

test('config defaults and overrides', () => {
  assert.equal(challengeConfig({}).inviteSeconds, 7 * 86400);
  assert.equal(challengeConfig({ TOPTRUMPS_CHALLENGE_INVITE_DAYS: '3' }).inviteSeconds, 3 * 86400);
  assert.throws(() => challengeConfig({ TOPTRUMPS_CHALLENGE_INVITE_DAYS: '0' }));
  assert.throws(() => challengeConfig({ TOPTRUMPS_CHALLENGE_RESULT_DAYS: 'abc' }));
});

test('two-card hands are distinct, eligible and cannot draw from locked packs',()=>{
 for(let i=0;i<50;i++){
  const cards=drawHand(dataset,['donald','donald']);
  assert.equal(new Set(cards.map(c=>c.id)).size,2);
  assert(cards.every(c=>dataset.cards.find(x=>x.id===c.id).status==='candidate'));
 }
 assert.throws(()=>drawHand({...dataset,cards:dataset.cards.slice(0,1)},['donald','donald']));
 assert.throws(()=>drawHand(dataset,['donald','westminster']));
});
test('a dealer can choose a low-ranked sin but no hints are returned',()=>{
 const d=draft(),o=S.lock(d,'A','Stupidity',T0+1,config,d.senderCards[1].id);
 assert.equal(o.senderCard.id,d.senderCards[1].id);
 assert.equal(o.chosen,'Stupidity');assert.equal(o.hints,null);
 assert.throws(()=>S.lock(d,'A','Nope',T0+1,config,d.senderCards[0].id));
});

test('resolve is viewer-neutral and outcomes are role-aware, including draws', () => {
  const a = { scores: { Pride: 70 } }, b = { scores: { Pride: 40 } };
  const r = resolve(a, b, 'Pride');
  assert.deepEqual(r, { category: 'Pride', senderScore: 70, recipientScore: 40, winnerRole: 'sender' });
  assert.equal(outcomeFor(r, 'sender'), 'win');
  assert.equal(outcomeFor(r, 'recipient'), 'loss');
  const d = resolve(a, a, 'Pride');
  assert.equal(outcomeFor(d, 'sender'), 'draw');
  assert.equal(outcomeFor(d, 'recipient'), 'draw');
});

test('happy path draft -> lock -> accept -> respond -> reveals', () => {
  const d = draft();
  assert.equal(d.state, 'draft');
  const o = S.lock(d, 'A', 'Wrath', T0 + 1, config);
  assert.equal(o.state, 'open');
  assert.equal(o.deadline, T0 + 1 + config.inviteSeconds);
  assert.equal(o.hints,null);
  assert.equal(o.senderCards.length,2);
  const a = S.dealHand(S.accept(o, 'B', 'Bob', T0 + 2), 'B', dataset, ['donald','donald'], T0 + 2);
  assert.equal(a.state, 'accepted');
  const r = S.respond(a, 'B', a.recipientCard.id, T0 + 3);
  assert.equal(r.state, 'responded');
  assert.equal(r.result.category, 'Wrath');
  const rs = S.reveal(r, 'A', T0 + 4);
  assert(rs.senderRevealedAt && !rs.recipientRevealedAt);
  assert.equal(S.reveal(rs, 'A', T0 + 9), rs); // idempotent
});

test('transitions are idempotent and race losers get clear errors', () => {
  const o = opened();
  assert.equal(S.lock(o, 'A', 'Wrath', T0 + 2, config), o);
  assert.equal(code(() => S.lock(o, 'A', 'Pride', T0 + 2, config)), 'locked');
  const a = S.accept(o, 'B', 'Bob', T0 + 2);
  assert.equal(S.accept(a, 'B', 'Bob', T0 + 3), a);
  assert.equal(code(() => S.accept(a, 'C', 'Cy', T0 + 3)), 'already_accepted');
  assert.equal(code(() => S.accept(o, 'A', 'Ann', T0 + 3)), 'own_challenge');
  assert.equal(code(() => S.accept(draft(), 'B', 'Bob', T0 + 1)), 'unavailable');
});

test('respond requires the recipient, the dealt card and a live challenge', () => {
  const a = accepted();
  assert.equal(code(() => S.respond(a, 'A', a.recipientCard.id, T0 + 3)), 'unavailable');
  assert.equal(code(() => S.respond(a, 'C', a.recipientCard.id, T0 + 3)), 'unavailable');
  assert.equal(code(() => S.respond(a, 'B', a.senderCard.id, T0 + 3)), 'invalid');
  assert.equal(code(() => S.respond(opened(), 'B', 'x', T0 + 3)), 'unavailable');
  assert.equal(code(() => S.respond(a, 'B', a.recipientCard.id, a.deadline)), 'expired');
  const r = S.respond(a, 'B', a.recipientCard.id, T0 + 3);
  assert.equal(S.respond(r, 'B', a.recipientCard.id, T0 + 4), r);
});

test('cancel, decline and expiry never overwrite a responded result', () => {
  const r = responded();
  assert.equal(code(() => S.cancel(r, 'A', T0 + 5)), 'responded');
  assert.equal(code(() => S.decline(r, 'B', T0 + 5)), 'responded');
  assert.equal(S.effectiveState(r, r.deadline + 10 * 86400), 'responded');
  assert(S.purgeAt(r, config) === r.respondedAt + config.resultRetentionSeconds);
});

test('cancel and decline are terminal and block later play', () => {
  const o = opened();
  const c = S.cancel(o, 'A', T0 + 2);
  assert.equal(c.state, 'cancelled');
  assert.equal(S.cancel(c, 'A', T0 + 3), c);
  assert.equal(code(() => S.accept(c, 'B', 'Bob', T0 + 3)), 'cancelled');
  const a = accepted();
  assert.equal(S.cancel(a, 'A', T0 + 4).state, 'cancelled');
  assert.equal(code(() => S.respond(S.cancel(a, 'A', T0 + 4), 'B', a.recipientCard.id, T0 + 5)), 'cancelled');
  const dec = S.decline(a, 'B', T0 + 4);
  assert.equal(dec.state, 'declined');
  assert.equal(code(() => S.cancel(dec, 'A', T0 + 5)), 'declined');
  assert.equal(code(() => S.cancel(o, 'B', T0 + 2)), 'unavailable');
});

test('deadlines are enforced in code', () => {
  const d = draft();
  assert.equal(S.effectiveState(d, d.deadline), 'expired');
  assert.equal(code(() => S.lock(d, 'A', 'Wrath', d.deadline, config)), 'expired');
  const o = opened();
  assert.equal(code(() => S.accept(o, 'B', 'Bob', o.deadline)), 'expired');
  assert(S.isGone(o, S.purgeAt(o, config), config));
});

test('reveal needs a participant and a response', () => {
  assert.equal(code(() => S.reveal(responded(), 'C', T0 + 9)), 'unavailable');
  assert.equal(code(() => S.reveal(accepted(), 'B', T0 + 9)), 'not_ready');
});

const SECRET_KEYS = ['chosen', 'senderCard', 'recipientCard', 'result', 'scores'];
const flat = v => JSON.stringify(v);

test('disclosure matrix: sender before acceptance sees own card and sin only', () => {
  const o = opened('Wrath');
  const v = projectChallenge(o, 'sender', T0 + 2);
  assert.equal(v.chosen, 'Wrath');
  assert.equal(v.card.id, o.senderCard.id);
  assert(!('recipientCards' in v));
  assert.equal(o.recipientCard,null);
  assert(!('opponent' in v) && !('opponentFront' in v) && !('result' in v));
  const dv = projectChallenge(draft(), 'sender', T0 + 1);
  assert(!('chosen' in dv) && !('hints' in dv));
});

test('disclosure matrix: accepted recipient sees two own cards and opponent quote without any sin hint', () => {
  const a = accepted();
  const v = projectChallenge(a, 'recipient', T0 + 3);
  assert.equal(v.card.id, a.recipientCard.id);
  assert(!('chosen' in v));
  assert(!('hints' in v));
  assert.equal(v.cards.length,2);
  assert.equal(v.opponentFront.front,a.senderCard.front);
  assert(!('scores' in v.opponentFront));
  assert.equal(v.status, 'your_turn');
  assert.equal(projectChallenge(a, 'sender', T0 + 3).status, 'accepted');
});

test('disclosure matrix: after response, before reveal, only the other card front is shown', () => {
  const r = responded();
  for (const role of ['sender', 'recipient']) {
    const v = projectChallenge(r, role, T0 + 4);
    const other = role === 'sender' ? r.recipientCard : r.senderCard;
    assert.deepEqual(Object.keys(v.opponentFront).sort(), ['front', 'id', 'label', 'speaker']);
    assert.equal(v.opponentFront.front, other.front);
    assert(!('result' in v) && !('opponent' in v));
    assert(!v.cards.some(c=>c.id===other.id));
    assert(!('scores' in v.opponentFront));
    assert.equal(v.status, 'result_ready');
  }
  assert('chosen' in projectChallenge(r, 'sender', T0 + 4) && !('chosen' in projectChallenge(r, 'recipient', T0 + 4)));
});

test('disclosure matrix: reveal is per viewer and results are role-aware', () => {
  let r = responded();
  r = S.reveal(r, 'B', T0 + 5);
  const rv = projectChallenge(r, 'recipient', T0 + 6);
  assert(rv.opponent.scores && rv.result);
  assert.equal(rv.result.outcome, outcomeFor(r.result, 'recipient'));
  assert.equal(rv.result.yours, r.result.recipientScore);
  const sv = projectChallenge(r, 'sender', T0 + 6);
  assert(!('result' in sv) && !('opponent' in sv)); // sender has not revealed yet
  r = S.reveal(r, 'A', T0 + 7);
  const sv2 = projectChallenge(r, 'sender', T0 + 8);
  assert.equal(sv2.result.yours, r.result.senderScore);
  assert.equal(sv2.chosen, r.chosen);
  assert.equal(sv2.status, 'completed');
  const opposite = { win: 'loss', loss: 'win', draw: 'draw' };
  assert.equal(rv.result.outcome, opposite[sv2.result.outcome]);
});

test('views never leak raw records or the other participant id', () => {
  const r = S.reveal(responded(), 'A', T0 + 5);
  for (const role of ['sender', 'recipient']) {
    const text = flat(projectChallenge(r, role, T0 + 6));
    for (const key of ['senderId', 'recipientId', 'inviteGeneration', 'senderCard', 'recipientCard']) {
      assert(!text.includes(`"${key}"`), key);
    }
  }
  assert.throws(() => projectChallenge(r, 'stranger', T0));
});

test('summaries hide the outcome until the viewer reveals', () => {
  const r = responded();
  assert(!('outcome' in summarizeChallenge(r, 'sender', T0 + 4)));
  const done = S.reveal(r, 'A', T0 + 5);
  assert.equal(summarizeChallenge(done, 'sender', T0 + 6).outcome, outcomeFor(done.result, 'sender'));
  assert.equal(summarizeChallenge(opened(), 'sender', T0 + 2).status, 'awaiting_reply');
  const o = opened();
  assert.equal(summarizeChallenge(o, 'sender', o.deadline).status, 'expired');
});

test('legacy one-card challenges can still respond and reveal without a redraw',()=>{
 const a=accepted();const old={...a};delete old.handVersion;delete old.senderCards;delete old.recipientCards;
 const original=old.recipientCard.id;
 assert.equal(S.dealHand(old,'B',dataset,['donald','donald'],T0+3),old);
 const r=S.respond(old,'B',original,T0+4);
 const v=projectChallenge(S.reveal(r,'B',T0+5),'recipient',T0+5);
 assert.equal(v.card.id,original);assert.equal(v.cards.length,1);assert(v.result);
});
