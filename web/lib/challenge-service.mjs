// Application layer for asynchronous challenges: authenticates the guest, loads a record,
// applies one pure transition from challenge-state.mjs and saves it atomically with any
// side records (list entries, tally awards). All times are epoch seconds.
//
// ctx = { store, dataset, config, secret: async () => string, now, random? }
// Functions that may mint a guest return { ..., issuedCredential } for the route to set
// as the tt_guest cookie; it is undefined when the caller already had a valid guest.
import { GameError, rememberCards } from "./game.mjs";
import { newGuest, hashCredential, validNickname } from "./guest.mjs";
import { sign, verify, signCompact, verifyCompact } from "./capability.mjs";
import { key, op, isId, unwrap } from "./challenge-store.mjs";
import * as S from "./challenge-state.mjs";
import { projectChallenge, summarizeChallenge } from "./challenge-view.mjs";
import { outcomeFor } from "./challenge-rules.mjs";

const unavailable = S.unavailable;
const STAT_FIELD = { win: "wins", loss: "losses", draw: "draws" };
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
    ...key.guest(guestId),
    guestId,
    createdAt: ctx.now,
    lastSeenAt: ctx.now,
    generation: 1,
    stats: { wins: 0, losses: 0, draws: 0 },
    purgeAt,
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
  if (!guest || ctx.now >= guest.lastSeenAt + ctx.config.guestInactivitySeconds)
    return null;
  if (ctx.now - guest.lastSeenAt >= ctx.config.guestTouchSeconds) {
    const purgeAt = guestPurgeAt(ctx);
    await ctx.store.touch(key.guest(guest.guestId), {
      lastSeenAt: ctx.now,
      purgeAt,
    });
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
  if (guest)
    return { guestId: guest.guestId, ops: [], issuedCredential: undefined };
  const fresh = newGuestRecords(ctx);
  return {
    guestId: fresh.guestId,
    ops: fresh.ops,
    issuedCredential: fresh.credential,
  };
}

function cleanName(value) {
  const name = validNickname(value);
  if (!name)
    throw new GameError(
      "Choose a nickname of up to 24 letters or numbers.",
      400,
      "nickname",
    );
  return name;
}

function optionalFriendName(value) {
  return value === undefined || (typeof value === "string" && !value.trim())
    ? null
    : cleanName(value);
}
// The sender's private label never claims a recipient seat or changes their nickname.
export async function nameFriend(ctx, credential, id, input) {
  if (typeof input?.friendName !== "string")
    throw new GameError("Enter a friend name or an empty label.");
  const guest = await requireGuest(ctx, credential);
  const label = optionalFriendName(input?.friendName);
  const record = await mutate(ctx, id, (r) => {
    if (S.roleOf(r, guest.guestId) !== "sender") throw unavailable();
    return {
      record:
        r.invitedName === label
          ? r
          : { ...r, invitedName: label, version: r.version + 1 },
    };
  });
  return summarizeChallenge(record, "sender", ctx.now);
}

// ---------- records ----------

async function loadRecord(ctx, id) {
  if (!isId(id)) throw unavailable();
  const record = unwrap(await ctx.store.get(key.challenge(id)));
  if (!record || S.isGone(record, ctx.now, ctx.config)) throw unavailable();
  return record;
}

function challengeItem(ctx, record) {
  return {
    ...key.challenge(record.id),
    ...record,
    purgeAt: S.purgeAt(record, ctx.config),
  };
}

function entryItem(ctx, guestId, record, role) {
  const longest =
    ctx.config.draftSeconds +
    ctx.config.inviteSeconds +
    ctx.config.resultRetentionSeconds +
    ctx.config.terminalGraceSeconds;
  return {
    ...key.entry(guestId, record.createdAt, record.id),
    challengeId: record.id,
    role,
    purgeAt: record.createdAt + longest,
  };
}

// Load, transition, save with a version check. A lost race re-reads and re-applies so the
// loser gets the accurate error (for example already_accepted), never a silent overwrite.
async function mutate(ctx, id, apply) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const record = await loadRecord(ctx, id);
    const { record: updated, extra = [] } = await apply(record);
    if (updated === record) return record;
    if (
      await ctx.store.commit([
        op.replace(challengeItem(ctx, updated), record.version),
        ...extra,
      ])
    )
      return updated;
  }
  throw new GameError("Please try again.", 409, "conflict");
}

function viewFor(ctx, record, guestId) {
  const role = S.roleOf(record, guestId);
  if (!role) throw unavailable();
  return projectChallenge(record, role, ctx.now);
}

// A versioned per-guest recency record is saved in the same transaction as the deal.
// Concurrent challenges cannot overwrite history, and retries do not count a deal twice.
async function recentHistory(ctx, guestId) {
  const item = await ctx.store.get(key.recent(guestId));
  return { item, ids: item && ctx.now < item.purgeAt ? (item.ids ?? []) : [] };
}
function historyOp(ctx, guestId, history, ids) {
  const item = {
    ...key.recent(guestId),
    ids: rememberCards(history.ids, ids),
    version: (history.item?.version ?? 0) + 1,
    purgeAt: guestPurgeAt(ctx),
  };
  return history.item
    ? op.replace(item, history.item.version)
    : op.create(item);
}

// ---------- sender ----------

export async function createDraft(ctx, credential, input) {
  const name = cleanName(input?.nickname);
  const idem = input?.idempotencyKey;
  if (!isId(idem))
    throw new GameError("A request key is required.", 400, "invalid");
  const who = await guestOrNew(ctx, credential);
  const opKey = key.op(who.guestId, `draft-${idem}`);
  const existing = await ctx.store.get(opKey);
  if (existing)
    return {
      view: viewFor(
        ctx,
        await loadRecord(ctx, existing.challengeId),
        who.guestId,
      ),
      issuedCredential: who.issuedCredential,
    };
  if (input.parentId !== undefined)
    await requireParticipant(ctx, input.parentId, who.guestId);
  const history = await recentHistory(ctx, who.guestId);
  const record = S.createDraft({
    dataset: ctx.dataset,
    senderId: who.guestId,
    senderName: name,
    invitedName: optionalFriendName(input?.friendName),
    now: ctx.now,
    config: ctx.config,
    random: ctx.random,
    parentId: input.parentId ?? null,
    packs: input.packs,
    recent: history.ids,
  });
  const saved = await ctx.store.commit([
    ...who.ops,
    historyOp(
      ctx,
      who.guestId,
      history,
      record.senderCards.map((card) => card.id),
    ),
    op.create(challengeItem(ctx, record)),
    op.create(entryItem(ctx, who.guestId, record, "sender")),
    op.create({ ...opKey, challengeId: record.id, purgeAt: guestPurgeAt(ctx) }),
  ]);
  if (!saved) {
    // Lost to a concurrent request with the same key: return that request's draft.
    const winner = await ctx.store.get(opKey);
    if (!winner) throw new GameError("Please try again.", 409, "conflict");
    return {
      view: viewFor(
        ctx,
        await loadRecord(ctx, winner.challengeId),
        who.guestId,
      ),
      issuedCredential: who.issuedCredential,
    };
  }
  return {
    view: projectChallenge(record, "sender", ctx.now),
    issuedCredential: who.issuedCredential,
  };
}

async function requireParticipant(ctx, id, guestId) {
  const parent = await loadRecord(ctx, id);
  if (!S.roleOf(parent, guestId) || parent.state !== "responded")
    throw unavailable();
}

export async function lock(ctx, credential, id, input) {
  const guest = await requireGuest(ctx, credential);
  const record = await mutate(ctx, id, (r) => ({
    record: S.lock(
      r,
      guest.guestId,
      input?.category,
      ctx.now,
      ctx.config,
      input?.card,
    ),
  }));
  return viewFor(ctx, record, guest.guestId);
}

export async function invitation(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  const record = await loadRecord(ctx, id);
  if (S.roleOf(record, guest.guestId) !== "sender") throw unavailable();
  if (S.effectiveState(record, ctx.now) !== "open") {
    throw new GameError(
      "Lock your challenge before sharing it.",
      409,
      "not_shareable",
    );
  }
  // Short link: the key stays in the fragment, so it never reaches the server or its logs.
  const token = signCompact({
    secret: await ctx.secret(),
    purpose: "invite",
    subject: record.id,
    generation: record.inviteGeneration,
  });
  return {
    path: `/c/${record.id}#${token}`,
    expiresAt: record.deadline,
    senderName: record.senderName,
    front: record.senderCard.front,
  };
}

export async function cancel(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  return viewFor(
    ctx,
    await mutate(ctx, id, (r) => ({
      record: S.cancel(r, guest.guestId, ctx.now),
    })),
    guest.guestId,
  );
}

// ---------- recipient ----------

// Generic public metadata. It never touches storage, so it cannot reveal whether an id exists.
export function preview() {
  return {
    title: "A Top Trumps challenge",
    description:
      "Someone sent you a political quote card challenge. Open the link to play.",
  };
}

// Accepts the short key from /c/ links and the long v1 token from links sent earlier.
// Expiry of a short key is the record's deadline, checked by the state machine on accept.
async function inviteIsValid(ctx, record, token) {
  const proof = {
    secret: await ctx.secret(),
    purpose: "invite",
    subject: record.id,
    generation: record.inviteGeneration,
    token,
  };
  if (typeof token === "string" && token.startsWith("v1."))
    return verify({ ...proof, now: ctx.now });
  return verifyCompact(proof);
}

// Read-only. An invalid proof is indistinguishable from a missing challenge.
export async function inspectInvitation(ctx, credential, id, input) {
  const record = await loadRecord(ctx, id);
  if (!(await inviteIsValid(ctx, record, input?.invite))) throw unavailable();
  const guest = await authenticate(ctx, credential);
  const role = guest ? S.roleOf(record, guest.guestId) : null;
  const state = S.effectiveState(record, ctx.now);
  let availability = "available";
  if (role) availability = role === "sender" ? "yours" : "resumable";
  else if (state === "accepted" || state === "responded")
    availability = "already_accepted";
  else if (state !== "open") availability = state;
  return {
    availability,
    senderName: record.senderName,
    deadline: record.deadline,
    card: {
      front: record.senderCard.front,
      speaker: record.senderCard.speaker,
    },
  };
}

export async function accept(ctx, credential, id, input) {
  const probe = await loadRecord(ctx, id);
  if (!(await inviteIsValid(ctx, probe, input?.invite))) throw unavailable();
  const name = cleanName(input?.nickname);
  const who = await guestOrNew(ctx, credential);
  const record = await mutate(ctx, id, (r) => {
    const updated = S.accept(r, who.guestId, name, ctx.now);
    return {
      record: updated,
      extra:
        updated === r
          ? []
          : [
              ...who.ops,
              op.create(entryItem(ctx, who.guestId, r, "recipient")),
            ],
    };
  });
  return {
    view: viewFor(ctx, record, who.guestId),
    issuedCredential: who.issuedCredential,
  };
}

export async function respond(ctx, credential, id, input) {
  const guest = await requireGuest(ctx, credential);
  const record = await mutate(ctx, id, (r) => ({
    record: S.respond(r, guest.guestId, input?.card, ctx.now),
  }));
  return viewFor(ctx, record, guest.guestId);
}

export async function decline(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  return viewFor(
    ctx,
    await mutate(ctx, id, (r) => ({
      record: S.decline(r, guest.guestId, ctx.now),
    })),
    guest.guestId,
  );
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
  const record = await mutate(ctx, id, async (r) => {
    const updated = S.reveal(r, guest.guestId, ctx.now);
    if (updated === r) return { record: r };
    const role = S.roleOf(r, guest.guestId);
    const outcome = outcomeFor(r.result, role);
    const history = await recentHistory(ctx, guest.guestId);
    const other = role === "sender" ? r.recipientCard : r.senderCard;
    const award = {
      ...key.award(r.id, guest.guestId),
      role,
      outcome,
      awardedAt: ctx.now,
      purgeAt: S.purgeAt(updated, ctx.config),
    };
    return {
      record: updated,
      extra: [
        historyOp(ctx, guest.guestId, history, [other.id]),
        op.create(award),
        op.increment(key.guest(guest.guestId), STAT_FIELD[outcome]),
      ],
    };
  });
  return viewFor(ctx, record, guest.guestId);
}

export async function list(ctx, credential) {
  const guest = await requireGuest(ctx, credential);
  const entries = await ctx.store.query(
    `GUEST#${guest.guestId}`,
    "CH#",
    LIST_LIMIT,
  );
  const found = await Promise.all(
    entries.map((e) => ctx.store.get(key.challenge(e.challengeId))),
  );
  const challenges = [];
  for (const [index, item] of found.entries()) {
    const record = unwrap(item);
    if (!record || S.isGone(record, ctx.now, ctx.config)) continue;
    const role = S.roleOf(record, guest.guestId);
    if (role) challenges.push(summarizeChallenge(record, role, ctx.now));
  }
  return { challenges, totals: { ...guest.stats } };
}

// First request reserves the next deal atomically; no presence or acceptance requirement.
export const LIVE = Object.freeze({ presentSeconds: 15, requestSeconds: 60 });
async function rematchView(ctx, record, guestId) {
  const rematch = await ctx.store.get(key.live(record.id, "rematch"));
  return {
    opponentHere: false,
    rematch: rematch
      ? {
          state: "accepted",
          from: rematch.fromRole === S.roleOf(record, guestId) ? "you" : "them",
          challengeId: rematch.challengeId,
        }
      : null,
  };
}
export async function livePing(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  const record = await loadRecord(ctx, id);
  if (!S.roleOf(record, guest.guestId) || record.state !== "responded")
    throw unavailable();
  return rematchView(ctx, record, guest.guestId);
}
export async function requestRematch(ctx, credential, id) {
  const guest = await requireGuest(ctx, credential);
  const record = await loadRecord(ctx, id);
  const role = S.roleOf(record, guest.guestId);
  if (!role || record.state !== "responded") throw unavailable();
  const existing = await rematchView(ctx, record, guest.guestId);
  if (existing.rematch) return existing;
  const sender =
    role === "sender"
      ? { id: record.senderId, name: record.senderName }
      : { id: record.recipientId, name: record.recipientName };
  const recipient =
    role === "sender"
      ? { id: record.recipientId, name: record.recipientName }
      : { id: record.senderId, name: record.senderName };
  const draft = S.createDraft({
    dataset: ctx.dataset,
    senderId: sender.id,
    senderName: sender.name,
    recipient,
    now: ctx.now,
    config: ctx.config,
    random: ctx.random,
    parentId: id,
    deferDeal: true,
  });
  await ctx.store.commit([
    op.create({
      ...key.live(id, "rematch"),
      version: 1,
      fromRole: role,
      state: "accepted",
      challengeId: draft.id,
      purgeAt: S.purgeAt(record, ctx.config),
    }),
    op.create(challengeItem(ctx, draft)),
    op.create(entryItem(ctx, sender.id, draft, "sender")),
    op.create(entryItem(ctx, recipient.id, draft, "recipient")),
  ]);
  return rematchView(ctx, record, guest.guestId);
}
export async function answerRematch(ctx, credential, id, input) {
  return input?.accept
    ? requestRematch(ctx, credential, id)
    : livePing(ctx, credential, id);
}
export async function dealHand(ctx, credential, id, input) {
  const guest = await requireGuest(ctx, credential);
  const record = await mutate(ctx, id, async (r) => {
    const history = await recentHistory(ctx, guest.guestId);
    const recent =
      r.recipientId === guest.guestId && r.senderCard
        ? rememberCards(history.ids, [r.senderCard.id])
        : history.ids;
    const updated = S.dealHand(
      r,
      guest.guestId,
      ctx.dataset,
      input?.packs,
      ctx.now,
      ctx.random,
      recent,
    );
    if (updated === r) return { record: r };
    const cards =
      S.roleOf(r, guest.guestId) === "sender"
        ? updated.senderCards
        : updated.recipientCards;
    return {
      record: updated,
      extra: [
        historyOp(
          ctx,
          guest.guestId,
          { ...history, ids: recent },
          cards.map((card) => card.id),
        ),
      ],
    };
  });
  return viewFor(ctx, record, guest.guestId);
}

// ---------- recovery ----------

export async function recoveryLink(ctx, credential) {
  const guest = await requireGuest(ctx, credential);
  const expiresAt = guestPurgeAt(ctx);
  const token = sign({
    secret: await ctx.secret(),
    purpose: "guest-recovery",
    subject: guest.guestId,
    generation: guest.generation,
    expiresAt,
  });
  return { path: `/challenges#access=${guest.guestId}.${token}`, expiresAt };
}

// Exchanges a private recovery proof for a new credential on this browser. Any failure is
// the same generic error so the endpoint cannot be used to probe guest ids.
export async function recover(ctx, input) {
  const [guestId, ...rest] = String(input?.access ?? "").split(".");
  const token = rest.join(".");
  const guest = isId(guestId) ? await ctx.store.get(key.guest(guestId)) : null;
  const valid =
    guest &&
    ctx.now < guest.lastSeenAt + ctx.config.guestInactivitySeconds &&
    verify({
      secret: await ctx.secret(),
      purpose: "guest-recovery",
      subject: guestId,
      generation: guest.generation,
      token,
      now: ctx.now,
    });
  if (!valid)
    throw new GameError("This recovery link is not valid.", 404, "unavailable");
  const { credential } = newGuest();
  const purgeAt = guestPurgeAt(ctx);
  const saved = await ctx.store.commit([
    op.create({
      ...key.auth(hashCredential(credential)),
      guestId,
      createdAt: ctx.now,
      purgeAt,
    }),
  ]);
  if (!saved) throw new GameError("Please try again.", 409, "conflict");
  await ctx.store.touch(key.guest(guestId), { lastSeenAt: ctx.now, purgeAt });
  return { issuedCredential: credential };
}

// Public preview intentionally exposes only the played quote front, never scores or sin.
export async function publicCard(ctx, id) {
  const record = await loadRecord(ctx, id);
  if (
    !["open", "accepted", "responded"].includes(
      S.effectiveState(record, ctx.now),
    )
  )
    throw unavailable();
  const card = record.senderCard;
  return {
    id: card.id,
    label: card.label,
    front: card.front,
    speaker: card.speaker,
  };
}
