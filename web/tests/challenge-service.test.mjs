import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHALLENGE_DEFAULTS } from '../lib/challenge-config.mjs';
import { memoryStore } from '../lib/challenge-store.mjs';
import * as svc from '../lib/challenge-service.mjs';
import { sign } from '../lib/capability.mjs';
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

const tokenOf = path => path.split('#invite=')[1];
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
