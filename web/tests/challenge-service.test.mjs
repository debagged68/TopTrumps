import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHALLENGE_DEFAULTS } from '../lib/challenge-config.mjs';
import { memoryStore } from '../lib/challenge-store.mjs';
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
  const cardId = acc.view.card.id;
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
  assert(!('card' in insp));
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
  await svc.respond(w.ctx, acc.issuedCredential, d.id, { card: acc.view.card.id });
  return { id: d.id, ann: d.sender, bob: acc.issuedCredential };
}

test('challenge back needs both players present and seats the accepter without a link', async () => {
  const w = world();
  const f = await finished(w);
  // Bob is not on the page: a request is refused.
  assert.equal(await reason(() => svc.requestRematch(w.ctx, f.ann, f.id)), 'opponent_left');
  await svc.livePing(w.ctx, f.bob, f.id);
  const asked = await svc.requestRematch(w.ctx, f.ann, f.id);
  assert.deepEqual(asked.rematch, { from: 'you', state: 'pending' });
  const bobSees = await svc.livePing(w.ctx, f.bob, f.id);
  assert.deepEqual(bobSees.rematch, { from: 'them', state: 'pending' });
  const done = await svc.answerRematch(w.ctx, f.bob, f.id, { accept: true });
  assert.equal(done.rematch.state, 'accepted');
  const next = done.rematch.challengeId;
  // Ann is the sender of the new challenge; Bob is already seated and waits for her lock.
  const annView = await svc.getChallenge(w.ctx, f.ann, next);
  assert.equal(annView.role, 'sender'); assert.equal(annView.status, 'draft'); assert.equal(annView.opponentName, 'Bob');
  const bobView = await svc.getChallenge(w.ctx, f.bob, next);
  assert.equal(bobView.role, 'recipient'); assert.equal(bobView.status, 'waiting_for_sender');
  assert(!('chosen' in bobView));
  // Locking goes straight to Bob's turn: no invitation, no accept step.
  await svc.lock(w.ctx, f.ann, next, { category: 'Pride' });
  const turn = await svc.getChallenge(w.ctx, f.bob, next);
  assert.equal(turn.status, 'your_turn'); assert.equal(turn.hints.length, 2); assert(!('chosen' in turn));
  assert.equal(await reason(() => svc.invitation(w.ctx, f.ann, next)), 'not_shareable');
  // Both players' lists include it, and only one rematch can be made.
  assert((await svc.list(w.ctx, f.bob)).challenges.some(c => c.id === next));
  assert.equal((await svc.answerRematch(w.ctx, f.bob, f.id, { accept: true })).rematch.challengeId, next);
});

test('a request lapses when either player leaves, and can be declined', async () => {
  const w = world();
  const f = await finished(w);
  await svc.livePing(w.ctx, f.bob, f.id);
  await svc.requestRematch(w.ctx, f.ann, f.id);
  // Bob stops sending heartbeats (closed the page); Ann keeps hers.
  const later = w.at(T0 + svc.LIVE.presentSeconds + 1);
  await svc.livePing(later, f.ann, f.id);
  assert.equal((await svc.livePing(later, f.ann, f.id)).rematch.state, 'lapsed');
  assert.equal(await reason(() => svc.answerRematch(later, f.bob, f.id, { accept: true })), 'lapsed');
  // Both back on the page: a fresh request works and Bob can say no.
  await svc.livePing(later, f.bob, f.id);
  await svc.requestRematch(later, f.ann, f.id);
  const no = await svc.answerRematch(later, f.bob, f.id, { accept: false });
  assert.equal(no.rematch.state, 'declined');
  assert.equal((await svc.livePing(later, f.ann, f.id)).rematch.state, 'declined');
  // Ann may ask again after a refusal.
  assert.equal((await svc.requestRematch(later, f.ann, f.id)).rematch.state, 'pending');
});

test('if both press challenge back, the second joins the first instead of making two', async () => {
  const w = world();
  const f = await finished(w);
  await svc.livePing(w.ctx, f.ann, f.id);
  await svc.livePing(w.ctx, f.bob, f.id);
  await svc.requestRematch(w.ctx, f.ann, f.id);
  const bob = await svc.requestRematch(w.ctx, f.bob, f.id);
  assert.equal(bob.rematch.state, 'accepted');
  const lists = (await svc.list(w.ctx, f.ann)).challenges.filter(c => c.id !== f.id);
  assert.equal(lists.length, 1);
  assert.equal(await reason(() => svc.answerRematch(w.ctx, f.ann, f.id, { accept: true })), 'no_request');
});

test('challenge back is only for the two players and only after the result', async () => {
  const w = world();
  const d = await startDraft(w);
  assert.equal(await reason(() => svc.livePing(w.ctx, d.sender, d.id)), 'not_ready');
  const f = await finished(w);
  const stranger = (await startDraft(w, 'Eve', 'eve')).sender;
  assert.equal(await reason(() => svc.livePing(w.ctx, stranger, f.id)), 'unavailable');
  assert.equal(await reason(() => svc.requestRematch(w.ctx, null, f.id)), 'unavailable');
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
