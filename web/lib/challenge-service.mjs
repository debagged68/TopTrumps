// Application layer for asynchronous challenges: authenticates the guest, loads a record,
// applies one pure transition from challenge-state.mjs and saves it atomically with any
// side records (list entries, tally awards). All times are epoch seconds.
//
// ctx = { store, dataset, config, secret: async () => string, now, random? }
// Functions that may mint a guest return { ..., issuedCredential } for the route to set
// as the tt_guest cookie; it is undefined when the caller already had a valid guest.
import { GameError } from './game.mjs';
import { newGuest, hashCredential, validNickname } from './guest.mjs';
import { sign, verify } from './capability.mjs';
import { key, op, isId, unwrap } from './challenge-store.mjs';
import * as S from './challenge-state.mjs';
import { projectChallenge, summarizeChallenge } from './challenge-view.mjs';
import { outcomeFor } from './challenge-rules.mjs';

const unavailable = S.unavailable;
const STAT_FIELD = { win: 'wins', loss: 'losses', draw: 'draws' };
const LIST_LIMIT = 50;

// ---------- guests ----------

function guestPurgeAt(ctx, from = ctx.now) {
  return from + ctx.config.guestInactivitySeconds;
}

function newGuestRecords(ctx) {
  const { guestId, credential } = newGuest();
  const hash = hashCredential(credential);
  const purgeAt = guestPurgeAt(ctx);
  const guest = {
    ...key.guest(guestId), guestId, createdAt: ctx.now, lastSeenAt: ctx.now, generation: 1,
    stats: { wins: 0, losses: 0, draws: 0 }, purgeAt,
  };
  const auth = { ...key.auth(hash), guestId, createdAt: ctx.now, purgeAt };
  return { guestId, credential, ops: [op.create(guest), op.create(auth)] };
}

// Returns the guest for a valid, active credential, otherwise null. Never creates one.
export async function authenticate(ctx, credential) {
  if (!credential) return null;
  const hash = hashCredential(credential);
  const auth = await ctx.store.get(key.auth(hash));
  if (!auth) return null;
  const guest = await ctx.store.get(key.guest(auth.guestId));
  if (!guest || ctx.now >= guest.lastSeenAt + ctx.config.guestInactivitySeconds) return null;
  if (ctx.now - guest.lastSeenAt >= ctx.config.guestTouchSeconds) {
    const purgeAt = guestPurgeAt(ctx);
    await ctx.store.touch(key.guest(guest.guestId), { lastSeenAt: ctx.now, purgeAt });
    await ctx.store.touch(key.auth(hash), { purgeAt });
  }
  return guest;
}

async function requireGuest(ctx, credential) {
  const guest = await authenticate(ctx, credential);
  if (!guest) throw unavailable();
  return guest;
}

// An existing guest, or the records needed to create one in the caller's transaction.
async function guestOrNew(ctx, credential) {
  const guest = await authenticate(ctx, credential);
  if (guest) return { guestId: guest.guestId, ops: [], issuedCredential: undefined };
  const fresh = newGuestRecords(ctx);
  return { guestId: fresh.guestId, ops: fresh.ops, issuedCredential: fresh.credential };
}

function cleanName(value) {
  const name = validNickname(value);
  if (!name) throw new GameError('Choose a nickname of up to 24 letters or numbers.', 400, 'nickname');
  return name;
}

// ---------- records ----------

async function loadRecord(ctx, id) {
  if (!isId(id)) throw unavailable();
  const record = unwrap(await ctx.store.get(key.challenge(id)));
  if (!record || S.isGone(record, ctx.now, ctx.config)) throw unavailable();
  return record;
}

function challengeItem(ctx, record) {
  return { ...key.challenge(record.id), ...record, purgeAt: S.purgeAt(record, ctx.config) };
}

function entryItem(ctx, guestId, record, role) {
  const longest = ctx.config.draftSeconds + ctx.config.inviteSeconds + ctx.config.resultRetentionSeconds + ctx.config.terminalGraceSeconds;
  return { ...key.entry(guestId, record.createdAt, record.id), challengeId: record.id, role, purgeAt: record.createdAt + longest };
}

// Load, transition, save with a version check. A lost race re-reads and re-applies so the
// loser gets the accurate error (for example already_accepted), never a silent overwrite.
async function mutate(ctx, id, apply) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const record = await loadRecord(ctx, id);
    const { record: updated, extra = [] } = apply(record);
    if (updated === record) return record;
    if (await ctx.store.commit([op.replace(challengeItem(ctx, updated), record.version), ...extra])) return updated;
  }
  throw new GameError('Please try again.', 409, 'conflict');
}

function viewFor(ctx, record, guestId) {
  const role = S.roleOf(record, guestId);
  if (!role) throw unavailable();
  return projectChallenge(record, role, ctx.now);
}

// ---------- sender ----------

export async function createDraft(ctx, credential, input) {
  const name = cleanName(input?.nickname);
  const idem = input?.idempotencyKey;
  if (!isId(idem)) throw new GameError('A request key is required.', 400, 'invalid');
  const who = await guestOrNew(ctx, credential);
  const opKey = key.op(who.guestId, `draft-${idem}`);
  const existing = await ctx.store.get(opKey);
  if (existing) return { view: viewFor(ctx, await loadRecord(ctx, existing.challengeId), who.guestId), issuedCredential: who.issuedCredential };
  if (input.parentId !== undefined) await requireParticipant(ctx, input.parentId, who.guestId);
  const record = S.createDraft({
    dataset: ctx.dataset, senderId: who.guestId, senderName: name, now: ctx.now, config: ctx.config,
    random: ctx.random, parentId: input.parentId ?? null,
  });
  const saved = await ctx.store.commit([
    ...who.ops,
    op.create(challengeItem(ctx, record)),
    op.create(entryItem(ctx, who.guestId, record, 'sender')),
    op.create({ ...opKey, challengeId: record.id, purgeAt: guestPurgeAt(ctx) }),
  ]);
  if (!saved) {
    // Lost to a concurrent request with the same key: return that request's draft.
    const winner = await ctx.store.get(opKey);
    if (!winner) throw new GameError('Please try again.', 409, 'conflict');
    return { view: viewFor(ctx, await loadRecord(ctx, winner.challengeId), who.guestId), issuedCredential: who.issuedCredential };
  }
  return { view: projectChallenge(record, 'sender', ctx.now), issuedCredential: who.issuedCredential };
}

async function requireParticipant(ctx, id, guestId) {
  const parent = await loadRecord(ctx, id);
  if (!S.roleOf(parent, guestId) || parent.state !== 'responded') throw unavailable();
}

export async function lock(ctx, credential, id, input) {
  const guest = await requireGuest(ctx, credential);
  const record = await mutate(ctx, id, r => ({ record: S.lock(r, guest.guestId, input?.category, ctx.now, ctx.config) }));
  return viewFor(ctx, record, guest.guestId);
}

export async function invitation(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  const record = await loadRecord(ctx, id);
  if (S.roleOf(record, guest.guestId) !== 'sender') throw unavailable();
  if (S.effectiveState(record, ctx.now) !== 'open') {
    throw new GameError('Lock your challenge before sharing it.', 409, 'not_shareable');
  }
  const token = sign({
    secret: await ctx.secret(), purpose: 'invite', subject: record.id,
    generation: record.inviteGeneration, expiresAt: record.deadline,
  });
  return { path: `/challenge/${record.id}#invite=${token}`, expiresAt: record.deadline, senderName: record.senderName };
}

export async function cancel(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  return viewFor(ctx, await mutate(ctx, id, r => ({ record: S.cancel(r, guest.guestId, ctx.now) })), guest.guestId);
}

// ---------- recipient ----------

// Generic public metadata. It never touches storage, so it cannot reveal whether an id exists.
export function preview() {
  return { title: 'A Top Trumps challenge', description: 'Someone sent you a political quote card challenge. Open the link to play.' };
}

async function inviteIsValid(ctx, record, token) {
  return verify({
    secret: await ctx.secret(), purpose: 'invite', subject: record.id,
    generation: record.inviteGeneration, token, now: ctx.now,
  });
}

// Read-only. An invalid proof is indistinguishable from a missing challenge.
export async function inspectInvitation(ctx, credential, id, input) {
  const record = await loadRecord(ctx, id);
  if (!(await inviteIsValid(ctx, record, input?.invite))) throw unavailable();
  const guest = await authenticate(ctx, credential);
  const role = guest ? S.roleOf(record, guest.guestId) : null;
  const state = S.effectiveState(record, ctx.now);
  let availability = 'available';
  if (role) availability = role === 'sender' ? 'yours' : 'resumable';
  else if (state === 'accepted' || state === 'responded') availability = 'already_accepted';
  else if (state !== 'open') availability = state;
  return { availability, senderName: record.senderName, deadline: record.deadline };
}

export async function accept(ctx, credential, id, input) {
  const probe = await loadRecord(ctx, id);
  if (!(await inviteIsValid(ctx, probe, input?.invite))) throw unavailable();
  const name = cleanName(input?.nickname);
  const who = await guestOrNew(ctx, credential);
  const record = await mutate(ctx, id, r => {
    const updated = S.accept(r, who.guestId, name, ctx.now);
    return { record: updated, extra: updated === r ? [] : [...who.ops, op.create(entryItem(ctx, who.guestId, r, 'recipient'))] };
  });
  return { view: viewFor(ctx, record, who.guestId), issuedCredential: who.issuedCredential };
}

export async function respond(ctx, credential, id, input) {
  const guest = await requireGuest(ctx, credential);
  const record = await mutate(ctx, id, r => ({ record: S.respond(r, guest.guestId, input?.card, ctx.now) }));
  return viewFor(ctx, record, guest.guestId);
}

export async function decline(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  return viewFor(ctx, await mutate(ctx, id, r => ({ record: S.decline(r, guest.guestId, ctx.now) })), guest.guestId);
}

// ---------- both participants ----------

export async function getChallenge(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  return viewFor(ctx, await loadRecord(ctx, id), guest.guestId);
}

// The first reveal by each participant creates exactly one tally award, in the same
// transaction as the reveal timestamp, so retries and double taps cannot double count.
export async function reveal(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  const record = await mutate(ctx, id, r => {
    const updated = S.reveal(r, guest.guestId, ctx.now);
    if (updated === r) return { record: r };
    const role = S.roleOf(r, guest.guestId);
    const outcome = outcomeFor(r.result, role);
    const award = { ...key.award(r.id, guest.guestId), role, outcome, awardedAt: ctx.now, purgeAt: S.purgeAt(updated, ctx.config) };
    return { record: updated, extra: [op.create(award), op.increment(key.guest(guest.guestId), STAT_FIELD[outcome])] };
  });
  return viewFor(ctx, record, guest.guestId);
}

export async function list(ctx, credential) {
  const guest = await requireGuest(ctx, credential);
  const entries = await ctx.store.query(`GUEST#${guest.guestId}`, 'CH#', LIST_LIMIT);
  const found = await Promise.all(entries.map(e => ctx.store.get(key.challenge(e.challengeId))));
  const challenges = [];
  for (const [index, item] of found.entries()) {
    const record = unwrap(item);
    if (!record || S.isGone(record, ctx.now, ctx.config)) continue;
    const role = S.roleOf(record, guest.guestId);
    if (role) challenges.push(summarizeChallenge(record, role, ctx.now));
  }
  return { challenges, totals: { ...guest.stats } };
}

// ---------- live challenge back ----------
//
// Challenge back only works while both players are on the finished challenge at the same
// time. Each open result page sends a heartbeat; a request needs the opponent present,
// pops up on their screen and lapses as soon as either person leaves. Accepting creates a
// fresh challenge with the requester as sender and the accepter already seated, so no
// invitation link is needed. One accepted rematch per finished challenge.

export const LIVE = Object.freeze({ presentSeconds: 15, requestSeconds: 60 });

async function readLive(ctx, id) {
  const items = await ctx.store.query(`CHAL#${id}`, 'LIVE#', 5);
  return Object.fromEntries(items.map(item => [item.sk.slice('LIVE#'.length), item]));
}

// Authorises a participant, checks the result is in, and records their heartbeat. A pending
// request is judged on the heartbeats as they were BEFORE this one, and a lapse is saved, so
// someone who left and came back cannot revive an old request.
async function liveParticipant(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  const record = await loadRecord(ctx, id);
  const role = S.roleOf(record, guest.guestId);
  if (!role) throw unavailable();
  if (S.effectiveState(record, ctx.now) !== 'responded') {
    throw new GameError('Challenge back opens once the result is in.', 409, 'not_ready');
  }
  const before = await readLive(ctx, id);
  const ops = [op.put({ ...key.live(id, role), at: ctx.now, purgeAt: S.purgeAt(record, ctx.config) })];
  const request = before.rematch;
  if (request?.state === 'pending' && rematchState(ctx, before) === 'lapsed') {
    ops.push(op.replace({ ...request, state: 'lapsed', version: request.version + 1 }, request.version));
  }
  if (!(await ctx.store.commit(ops))) {
    await ctx.store.commit(ops.slice(0, 1)); // someone else changed the request first; keep the heartbeat
  }
  return { record, role, live: await readLive(ctx, id) };
}

const otherOf = role => (role === 'sender' ? 'recipient' : 'sender');

function rematchState(ctx, live) {
  const request = live.rematch;
  if (!request) return null;
  if (request.state !== 'pending') return request.state; // accepted | declined | lapsed
  const here = role => live[role] && ctx.now - live[role].at <= LIVE.presentSeconds;
  const fresh = ctx.now - request.requestedAt <= LIVE.requestSeconds;
  return fresh && here('sender') && here('recipient') ? 'pending' : 'lapsed';
}

function liveView(ctx, role, live) {
  const opponent = live[otherOf(role)];
  const state = rematchState(ctx, live);
  const view = { opponentHere: Boolean(opponent && ctx.now - opponent.at <= LIVE.presentSeconds), rematch: null };
  if (state) {
    view.rematch = { from: live.rematch.fromRole === role ? 'you' : 'them', state };
    if (state === 'accepted') view.rematch.challengeId = live.rematch.challengeId;
  }
  return view;
}

export async function livePing(ctx, credential, id) {
  const { role, live } = await liveParticipant(ctx, credential, id);
  return liveView(ctx, role, live);
}

export async function requestRematch(ctx, credential, id) {
  const { record, role, live: first } = await liveParticipant(ctx, credential, id);
  const opponentName = role === 'sender' ? record.recipientName : record.senderName;
  for (let attempt = 0; attempt < 4; attempt++) {
    const live = attempt === 0 ? first : await readLive(ctx, id);
    const view = liveView(ctx, role, live);
    const state = view.rematch?.state;
    if (state === 'accepted') return view;
    if (state === 'pending') {
      if (view.rematch.from === 'you') return view;
      return answerRematch(ctx, credential, id, { accept: true }); // both pressed: join theirs
    }
    if (!view.opponentHere) {
      throw new GameError(`${opponentName} has left. Challenge back only works while you are both here.`, 409, 'opponent_left');
    }
    const previous = live.rematch;
    const request = {
      ...key.live(id, 'rematch'), fromRole: role, requestedAt: ctx.now, state: 'pending', challengeId: null,
      version: (previous?.version ?? 0) + 1, purgeAt: S.purgeAt(record, ctx.config),
    };
    if (await ctx.store.commit([previous ? op.replace(request, previous.version) : op.create(request)])) {
      return liveView(ctx, role, { ...live, rematch: request });
    }
  }
  throw new GameError('Please try again.', 409, 'conflict');
}

export async function answerRematch(ctx, credential, id, input) {
  const { record, role, live } = await liveParticipant(ctx, credential, id);
  const request = live.rematch;
  const state = rematchState(ctx, live);
  if (!request || request.fromRole === role || state === 'declined') {
    throw new GameError('There is no challenge back to answer.', 409, 'no_request');
  }
  if (state === 'accepted') return liveView(ctx, role, live);
  if (state === 'lapsed') {
    const name = request.fromRole === 'sender' ? record.senderName : record.recipientName;
    throw new GameError(`${name} has left, so the challenge back has lapsed.`, 409, 'lapsed');
  }
  if (!input?.accept) {
    const declined = { ...request, state: 'declined', version: request.version + 1 };
    if (!(await ctx.store.commit([op.replace(declined, request.version)]))) throw new GameError('Please try again.', 409, 'conflict');
    return liveView(ctx, role, { ...live, rematch: declined });
  }
  const asker = request.fromRole === 'sender'
    ? { id: record.senderId, name: record.senderName }
    : { id: record.recipientId, name: record.recipientName };
  const me = role === 'sender'
    ? { id: record.senderId, name: record.senderName }
    : { id: record.recipientId, name: record.recipientName };
  const draft = S.createDraft({
    dataset: ctx.dataset, senderId: asker.id, senderName: asker.name, recipient: me,
    now: ctx.now, config: ctx.config, random: ctx.random, parentId: record.id,
  });
  const accepted = { ...request, state: 'accepted', challengeId: draft.id, version: request.version + 1 };
  const saved = await ctx.store.commit([
    op.replace(accepted, request.version),
    op.create(challengeItem(ctx, draft)),
    op.create(entryItem(ctx, asker.id, draft, 'sender')),
    op.create(entryItem(ctx, me.id, draft, 'recipient')),
  ]);
  if (saved) return liveView(ctx, role, { ...live, rematch: accepted });
  const now = await readLive(ctx, id); // lost a race: report whatever won
  if (rematchState(ctx, now) === 'accepted') return liveView(ctx, role, now);
  throw new GameError('Please try again.', 409, 'conflict');
}

// ---------- recovery ----------

export async function recoveryLink(ctx, credential) {
  const guest = await requireGuest(ctx, credential);
  const expiresAt = guestPurgeAt(ctx);
  const token = sign({ secret: await ctx.secret(), purpose: 'guest-recovery', subject: guest.guestId, generation: guest.generation, expiresAt });
  return { path: `/challenges#access=${guest.guestId}.${token}`, expiresAt };
}

// Exchanges a private recovery proof for a new credential on this browser. Any failure is
// the same generic error so the endpoint cannot be used to probe guest ids.
export async function recover(ctx, input) {
  const [guestId, ...rest] = String(input?.access ?? '').split('.');
  const token = rest.join('.');
  const guest = isId(guestId) ? await ctx.store.get(key.guest(guestId)) : null;
  const valid = guest && ctx.now < guest.lastSeenAt + ctx.config.guestInactivitySeconds
    && verify({ secret: await ctx.secret(), purpose: 'guest-recovery', subject: guestId, generation: guest.generation, token, now: ctx.now });
  if (!valid) throw new GameError('This recovery link is not valid.', 404, 'unavailable');
  const { credential } = newGuest();
  const purgeAt = guestPurgeAt(ctx);
  const saved = await ctx.store.commit([op.create({ ...key.auth(hashCredential(credential)), guestId, createdAt: ctx.now, purgeAt })]);
  if (!saved) throw new GameError('Please try again.', 409, 'conflict');
  await ctx.store.touch(key.guest(guestId), { lastSeenAt: ctx.now, purgeAt });
  return { issuedCredential: credential };
}
