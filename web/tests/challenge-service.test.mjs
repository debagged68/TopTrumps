import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHALLENGE_DEFAULTS } from '../lib/challenge-config.mjs';
import { memoryStore, key } from '../lib/challenge-store.mjs';
import * as svc from '../lib/challenge-service.mjs';
import { sign, signCompact } from '../lib/capability.mjs';
import { hashCredential } from '../lib/guest.mjs';

const dataset = JSON.parse(readFileSync(new URL('../data/donald.json', import.meta.url)));
const SECRET = 'k'.repeat(48);
const T0 = 2_000_000;

function world(now = T0) {
  const store = memoryStore();
  const ctx = { store, dataset, config: CHALLENGE_DEFAULTS, secret: async () => SECRET, now };
  return { store, ctx, at: t => ({ ...ctx, now: t }) };
}
const reason = fn => fn().then(() => null, e => e.code ?? e.name);

async function startDraft(w, nickname = 'Ann', key = 'k1') {
  const { view, issuedCredential } = await svc.createDraft(w.ctx, null, { nickname, idempotencyKey: key });
  return { id: view.id, sender: issuedCredential, view };
}

async function sendInvite(w, sender, id) {
  await svc.lock(w.ctx, sender, id, { category: 'Wrath' });
  return (await svc.invitation(w.ctx, sender, id)).path;
}

const tokenOf = path => path.split('#')[1];
const idOf = path => path.split('/')[2].split('#')[0];

test('full flow: draft, lock, invite, accept, respond, reveal both sides with one award each', async () => {
  const w = world();
  const d = await startDraft(w);
  const path = await sendInvite(w, d.sender, d.id);
  assert.equal(idOf(path), d.id);
  const acc = await svc.accept(w.ctx, null, d.id, { invite: tokenOf(path), nickname: 'Bob' });
  assert(acc.issuedCredential, 'a new guest is issued a credential');
  assert.equal(acc.view.role, 'recipient');
  assert.equal(acc.view.card,null);
  assert.deepEqual(acc.view.cards,[]);
  const hand = await svc.dealHand(w.ctx,acc.issuedCredential,d.id,{packs:['donald','donald']});
  const cardId = hand.cards[1].id;
  const resp = await svc.respond(w.ctx, acc.issuedCredential, d.id, { card: cardId });
  assert.equal(resp.status, 'result_ready');
  assert(!('result' in resp));
  const senderView = await svc.reveal(w.ctx, d.sender, d.id);
  assert.equal(senderView.status, 'completed');
  const recipientView = await svc.reveal(w.ctx, acc.issuedCredential, d.id);
  assert.equal(recipientView.result.outcome, senderView.result.outcome === 'draw' ? 'draw' : senderView.result.outcome === 'win' ? 'loss' : 'win');
  await svc.reveal(w.ctx, d.sender, d.id); // repeat reveal
  const senderGuest = await svc.authenticate(w.ctx, d.sender);
  const awards = await w.store.query(`CHAL#${d.id}`, 'AWARD#');
  assert.equal(awards.length, 2);
  const totals = (await svc.list(w.ctx, d.sender)).totals;
  assert.equal(totals.wins + totals.losses + totals.draws, 1);
  assert(senderGuest);
});

test('a GET or inspection never claims a seat; accepting twice returns the same seat', async () => {
  const w = world();
  const d = await startDraft(w);
  const path = await sendInvite(w, d.sender, d.id);
  const insp = await svc.inspectInvitation(w.ctx, null, d.id, { invite: tokenOf(path) });
  assert.equal(insp.availability, 'available');
  assert.equal(insp.senderName, 'Ann');
  assert.equal(typeof insp.card.front,'string');
  assert(!('scores' in insp.card));
  assert.equal((await svc.getChallenge(w.ctx, null, d.id).catch(e => e.code)), 'unavailable');
  const first = await svc.accept(w.ctx, null, d.id, { invite: tokenOf(path), nickname: 'Bob' });
  const again = await svc.accept(w.ctx, first.issuedCredential, d.id, { invite: tokenOf(path), nickname: 'Bob' });
  assert.equal(again.view.id, d.id);
  assert.equal(again.issuedCredential, undefined);
});

test('only the first successful accept wins a race; the loser gets already_accepted', async () => {
  const w = world();
  const d = await startDraft(w);
  const path = await sendInvite(w, d.sender, d.id);
  const results = await Promise.allSettled([
    svc.accept(w.ctx, null, d.id, { invite: tokenOf(path), nickname: 'Bob' }),
    svc.accept(w.ctx, null, d.id, { invite: tokenOf(path), nickname: 'Cy' }),
  ]);
  const wins = results.filter(r => r.status === 'fulfilled');
  const losses = results.filter(r => r.status === 'rejected').map(r => r.reason.code);
  assert.equal(wins.length, 1);
  assert.deepEqual(losses, ['already_accepted']);
});

test('an invitation proof is required, and forged or wrong-purpose tokens fail generically', async () => {
  const w = world();
  const d = await startDraft(w);
  const path = await sendInvite(w, d.sender, d.id);
  const bogus = sign({ secret: SECRET, purpose: 'guest-recovery', subject: d.id, generation: 1, expiresAt: T0 + 1000 });
  for (const invite of [undefined, '', 'nope', bogus]) {
    assert.equal(await reason(() => svc.accept(w.ctx, null, d.id, { invite, nickname: 'Bob' })), 'unavailable');
    assert.equal(await reason(() => svc.inspectInvitation(w.ctx, null, d.id, { invite })), 'unavailable');
  }
  assert.equal(await reason(() => svc.accept(w.ctx, null, 'missing-id', { invite: tokenOf(path), nickname: 'B' })), 'unavailable');
});

test('a sender cannot accept their own invitation', async () => {
  const w = world();
  const d = await startDraft(w);
  const path = await sendInvite(w, d.sender, d.id);
  assert.equal(await reason(() => svc.accept(w.ctx, d.sender, d.id, { invite: tokenOf(path), nickname: 'Ann' })), 'own_challenge');
});

test('cancel blocks acceptance and old links report the cancellation', async () => {
  const w = world();
  const d = await startDraft(w);
  const path = await sendInvite(w, d.sender, d.id);
  await svc.cancel(w.ctx, d.sender, d.id);
  assert.equal(await reason(() => svc.accept(w.ctx, null, d.id, { invite: tokenOf(path), nickname: 'Bob' })), 'cancelled');
  assert.equal((await svc.inspectInvitation(w.ctx, null, d.id, { invite: tokenOf(path) })).availability, 'cancelled');
});

test('the create endpoint is idempotent per key and does not double-create drafts', async () => {
  const w = world();
  const a = await startDraft(w, 'Ann', 'same');
  const b = await svc.createDraft(w.ctx, a.sender, { nickname: 'Ann', idempotencyKey: 'same' });
  assert.equal(b.view.id, a.id);
  assert.equal(b.issuedCredential, undefined);
  assert.equal((await svc.list(w.ctx, a.sender)).challenges.length, 1);
});

test('expired invitations and drafts are refused and reported as expired', async () => {
  const w = world();
  const d = await startDraft(w);
  const later = w.at(T0 + CHALLENGE_DEFAULTS.draftSeconds);
  assert.equal(await reason(() => svc.lock(later, d.sender, d.id, { category: 'Wrath' })), 'expired');
});

test('recover issues a new credential only for a valid, unrevoked recovery proof', async () => {
  const w = world();
  const d = await startDraft(w);
  const link = await svc.recoveryLink(w.ctx, d.sender);
  const access = link.path.split('#access=')[1];
  const recovered = await svc.recover(w.ctx, { access });
  assert(recovered.issuedCredential);
  assert.equal((await svc.list(w.ctx, recovered.issuedCredential)).challenges.length, 1);
  assert.equal(await reason(() => svc.recover(w.ctx, { access: access.replace(/.$/, 'x') })), 'unavailable');
  assert.equal(await reason(() => svc.recover(w.ctx, { access: 'nope' })), 'unavailable');
});

test('a guest who has been inactive past the retention window is no longer authenticated', async () => {
  const w = world();
  const d = await startDraft(w);
  const far = w.at(T0 + CHALLENGE_DEFAULTS.guestInactivitySeconds + 1);
  assert.equal(await svc.authenticate(far, d.sender), null);
});

test('lists never expose other participants and never include foreign challenges', async () => {
  const w = world();
  const d = await startDraft(w);
  const other = await startDraft(w, 'Eve', 'other');
  const { challenges } = await svc.list(w.ctx, d.sender);
  assert.deepEqual(challenges.map(c => c.id), [d.id]);
  assert(!JSON.stringify(challenges).includes(other.id));
  assert(!JSON.stringify(challenges).includes('"senderId"'));
});

test('stored hashes, not credentials, appear in the table', async () => {
  const w = world();
  const d = await startDraft(w);
  const dump = JSON.stringify(await w.store.query(`AUTH#${hashCredential(d.sender)}`, '')) + JSON.stringify(await w.store.query(`GUEST#${(await svc.authenticate(w.ctx, d.sender)).guestId}`, ''));
  assert(dump.includes(hashCredential(d.sender)));
  assert(!dump.includes(d.sender));
  assert(hashCredential(d.sender).length === 64);
});

// ---------- live challenge back ----------

async function finished(w) {
  const d = await startDraft(w);
  const path = await sendInvite(w, d.sender, d.id);
  const acc = await svc.accept(w.ctx, null, d.id, { invite: tokenOf(path), nickname: 'Bob' });
  const hand=await svc.dealHand(w.ctx,acc.issuedCredential,d.id,{packs:['donald','donald']});
  await svc.respond(w.ctx, acc.issuedCredential, d.id, { card: hand.cards[1].id });
  return { id: d.id, ann: d.sender, bob: acc.issuedCredential };
}

test('first request reserves next deal with the opponent offline; both can resume it later',async()=>{
 const w=world(),f=await finished(w);
 const asked=await svc.requestRematch(w.ctx,f.ann,f.id);
 assert.equal(asked.rematch.state,'accepted');
 const id=asked.rematch.challengeId;
 const ann=await svc.getChallenge(w.ctx,f.ann,id),bob=await svc.getChallenge(w.ctx,f.bob,id);
 assert.equal(ann.status,'draft');assert.equal(bob.status,'waiting_for_sender');
 assert.deepEqual(ann.cards,[]);assert.deepEqual(bob.cards,[]);
 const hand=await svc.dealHand(w.ctx,f.ann,id,{packs:['donald','donald']});
 assert.equal(hand.cards.length,2);
 await svc.lock(w.ctx,f.ann,id,{category:'Pride',card:hand.cards[1].id});
 const turn=await svc.getChallenge(w.ctx,f.bob,id);
 assert.equal(turn.status,'your_turn');assert(!('hints' in turn));assert(!('chosen' in turn));
 const later=w.at(T0+3600);
 assert.equal((await svc.requestRematch(later,f.bob,f.id)).rematch.challengeId,id);
 assert.equal((await svc.livePing(later,f.bob,f.id)).rematch.from,'them');
 assert.equal(await reason(()=>svc.invitation(w.ctx,f.ann,id)),'not_shareable');
});
test('simultaneous Take the deal requests create one rematch, with one dealer',async()=>{
 const w=world(),f=await finished(w);
 const [a,b]=await Promise.all([svc.requestRematch(w.ctx,f.ann,f.id),svc.requestRematch(w.ctx,f.bob,f.id)]);
 assert.equal(a.rematch.challengeId,b.rematch.challengeId);
 assert.notEqual(a.rematch.from,b.rematch.from);
 assert.equal((await svc.list(w.ctx,f.ann)).challenges.filter(c=>c.id!==f.id).length,1);
});
test('rematches require a finished challenge and participant credentials',async()=>{
 const w=world(),d=await startDraft(w);
 assert.notEqual(await reason(()=>svc.requestRematch(w.ctx,d.sender,d.id)),null);
 const f=await finished(w),stranger=(await startDraft(w,'Eve','eve')).sender;
 assert.equal(await reason(()=>svc.requestRematch(w.ctx,stranger,f.id)),'unavailable');
 assert.equal(await reason(()=>svc.livePing(w.ctx,null,f.id)),'unavailable');
});

test('invite links are short: /c/<id>#<22-char key>, and older long links still work', async () => {
  const w = world();
  const d = await startDraft(w);
  const path = await sendInvite(w, d.sender, d.id);
  assert.match(path, /^\/c\/[A-Za-z0-9_-]{22}#[A-Za-z0-9_-]{22}$/);
  assert.ok(path.length <= 49, path);
  const legacy = sign({ secret: SECRET, purpose: 'invite', subject: d.id, generation: 1, expiresAt: T0 + 3600 });
  assert.equal((await svc.inspectInvitation(w.ctx, null, d.id, { invite: legacy })).availability, 'available');
  const acc = await svc.accept(w.ctx, null, d.id, { invite: tokenOf(path), nickname: 'Bob' });
  assert.equal(acc.view.status, 'your_turn');
});

test('short keys are bound to one challenge and expire with it', async () => {
  const w = world();
  const a = await startDraft(w, 'Ann', 'k1');
  const b = await startDraft(w, 'Ann', 'k2');
  const pathA = await sendInvite(w, a.sender, a.id);
  await sendInvite(w, b.sender, b.id);
  assert.equal(await reason(() => svc.accept(w.ctx, null, b.id, { invite: tokenOf(pathA), nickname: 'Bob' })), 'unavailable');
  const wrongSecret = signCompact({ secret: 'z'.repeat(48), purpose: 'invite', subject: a.id, generation: 1 });
  assert.equal(await reason(() => svc.accept(w.ctx, null, a.id, { invite: wrongSecret, nickname: 'Bob' })), 'unavailable');
  const late = w.at(T0 + CHALLENGE_DEFAULTS.inviteSeconds + 10);
  assert.notEqual(await reason(() => svc.accept(late, null, a.id, { invite: tokenOf(pathA), nickname: 'Bob' })), null);
  assert.notEqual((await svc.inspectInvitation(late, null, a.id, { invite: tokenOf(pathA) }).catch(() => ({ availability: 'gone' }))).availability, 'available');
});

test('hand draws and card locks are pinned across concurrent requests and refresh',async()=>{
 const w=world(),d=await startDraft(w),path=await sendInvite(w,d.sender,d.id);
 const acc=await svc.accept(w.ctx,null,d.id,{invite:tokenOf(path),nickname:'Bob'});
 const hands=await Promise.all(Array.from({length:4},()=>svc.dealHand(w.ctx,acc.issuedCredential,d.id,{packs:['donald','donald']})));
 for(const h of hands)assert.deepEqual(h.cards,hands[0].cards);
 assert.equal(new Set(hands[0].cards.map(c=>c.id)).size,2);
 assert(hands[0].cards.every(c=>c.id!==hands[0].opponentFront.id));
 const replies=await Promise.all(hands[0].cards.map(c=>svc.respond(w.ctx,acc.issuedCredential,d.id,{card:c.id,category:'Greed'})));
 assert.deepEqual(replies[0],replies[1]);
 const result=await svc.reveal(w.ctx,acc.issuedCredential,d.id);
 assert.equal(result.result.category,'Wrath');
});
test('public card preview contains only the locked quote front and cannot claim a seat',async()=>{
 const w=world(),d=await startDraft(w);
 assert.equal(await reason(()=>svc.publicCard(w.ctx,d.id)),'unavailable');
 await svc.lock(w.ctx,d.sender,d.id,{card:d.view.cards[1].id,category:'Pride'});
 const front=await svc.publicCard(w.ctx,d.id);
 assert.equal(front.id,d.view.cards[1].id);
 assert.deepEqual(Object.keys(front).sort(),['front','id','label','speaker']);
 assert.equal((await svc.getChallenge(w.ctx,d.sender,d.id)).status,'awaiting_reply');
 await svc.cancel(w.ctx,d.sender,d.id);
 assert.equal(await reason(()=>svc.publicCard(w.ctx,d.id)),'unavailable');
});
test('unowned pack requests are rejected on the server',async()=>{
 const w=world();
 assert.equal(await reason(()=>svc.createDraft(w.ctx,null,{nickname:'Ann',idempotencyKey:'packs',packs:['donald','westminster']})),'invalid');
});

test('friend recency history is per guest, private and idempotent across draft and hand retries',async()=>{
 const w=world(),d=await startDraft(w),ann=await svc.authenticate(w.ctx,d.sender);
 const h1=await w.store.get(key.recent(ann.guestId));assert.equal(h1.ids.length,2);
 await svc.createDraft(w.ctx,d.sender,{nickname:'Ann',idempotencyKey:'k1'});
 assert.deepEqual(await w.store.get(key.recent(ann.guestId)),h1);
 const path=await sendInvite(w,d.sender,d.id),acc=await svc.accept(w.ctx,null,d.id,{invite:tokenOf(path),nickname:'Bob'});
 const bob=await svc.authenticate(w.ctx,acc.issuedCredential);
 const hands=await Promise.all([svc.dealHand(w.ctx,acc.issuedCredential,d.id,{packs:['donald','donald']}),svc.dealHand(w.ctx,acc.issuedCredential,d.id,{packs:['donald','donald']})]);
 assert.deepEqual(hands[0].cards,hands[1].cards);
 const hb=await w.store.get(key.recent(bob.guestId));assert.equal(hb.ids.length,3);
 assert(hb.ids.includes(hands[0].opponentFront.id));
 assert.deepEqual(await w.store.get(key.recent(ann.guestId)),h1);
 assert(!JSON.stringify(hands[0]).includes('RECENT'));assert(!('recentCards' in hands[0]));
 await svc.respond(w.ctx,acc.issuedCredential,d.id,{card:hands[0].cards[0].id});
 await svc.reveal(w.ctx,d.sender,d.id);
 const revealed=await w.store.get(key.recent(ann.guestId));assert(revealed.ids.includes(hands[0].cards[0].id));
 await svc.reveal(w.ctx,d.sender,d.id);assert.deepEqual(await w.store.get(key.recent(ann.guestId)),revealed);
});
test('competing friend drafts cannot overwrite each other’s recent history',async()=>{
 const w=world(),first=await startDraft(w);
 const inputs=['second','third'].map(idempotencyKey=>({nickname:'Ann',idempotencyKey}));
 const results=await Promise.allSettled(inputs.map(input=>svc.createDraft(w.ctx,first.sender,input)));
 const dealt=[first.view];
 for(let i=0;i<results.length;i++){
  if(results[i].status==='fulfilled')dealt.push(results[i].value.view);
  else {assert.equal(results[i].reason.code,'conflict');dealt.push((await svc.createDraft(w.ctx,first.sender,inputs[i])).view);}
 }
 const guest=await svc.authenticate(w.ctx,first.sender);
 const ids=(await w.store.get(key.recent(guest.guestId))).ids;
 assert(dealt.every(view=>view.cards.every(c=>ids.includes(c.id))));
 await svc.cancel(w.ctx,first.sender,first.id);
 assert.deepEqual((await w.store.get(key.recent(guest.guestId))).ids,ids);
});
test('a new friend hand uses stored recency weights rather than uniform card indexes',async()=>{
 const w=world(),first=await startDraft(w),guest=await svc.authenticate(w.ctx,first.sender);
 const eligible=dataset.cards.filter(c=>c.status==='candidate');
 await w.store.touch(key.recent(guest.guestId),{ids:eligible.slice(0,8).map(c=>c.id)});
 const next=await svc.createDraft({...w.ctx,random:()=>32},first.sender,{nickname:'Ann',idempotencyKey:'weighted'});
 assert.deepEqual(next.view.cards.map(c=>c.id),[eligible[8].id,eligible[9].id]);
});
