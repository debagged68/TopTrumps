// Storage for asynchronous challenges. One small interface, two implementations:
//   memoryStore()  – tests and TOPTRUMPS_LOCAL_STATE=1 development
//   dynamoStore()  – the ChallengeTable (pk/sk, on-demand, TTL on purgeAt)
//
// Items (pk | sk):  AUTH#<hash> | META        credential hash -> guest id
//                   GUEST#<id>  | META        guest profile, generation, stats
//                   GUEST#<id>  | CH#<createdAt>#<cid>  list entry (role) for My challenges
//                   GUEST#<id>  | OP#<key>    idempotency record
//                   CHAL#<cid>  | META        challenge record (version-checked)
//                   CHAL#<cid>  | AWARD#<gid> one tally award per guest per challenge
//                   CHAL#<cid>  | LIVE#<name> presence heartbeat per role, and the one rematch request
//
// All multi-item changes go through commit(ops), which is atomic and returns false when
// any condition fails (a lost race), so callers re-read and decide.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const key = {
  auth: hash => ({ pk: `AUTH#${hash}`, sk: 'META' }),
  guest: id => ({ pk: `GUEST#${id}`, sk: 'META' }),
  entry: (guestId, createdAt, challengeId) => ({ pk: `GUEST#${guestId}`, sk: `CH#${String(createdAt).padStart(12, '0')}#${challengeId}` }),
  op: (guestId, name) => ({ pk: `GUEST#${guestId}`, sk: `OP#${name}` }),
  challenge: id => ({ pk: `CHAL#${id}`, sk: 'META' }),
  award: (challengeId, guestId) => ({ pk: `CHAL#${challengeId}`, sk: `AWARD#${guestId}` }),
  // Live "challenge back" state: LIVE#sender / LIVE#recipient presence, LIVE#rematch request.
  live: (challengeId, name) => ({ pk: `CHAL#${challengeId}`, sk: `LIVE#${name}` }),
};

// Ops understood by commit():
//   { type: 'put',       item }                        unconditional write (presence heartbeats)
//   { type: 'create',    item }                        fails if the key exists
//   { type: 'replace',   item, expectedVersion }       fails unless stored version matches
//   { type: 'delete',    key }
//   { type: 'increment', key, field }                  stats.<field> += 1 on an existing item
export const op = {
  put: item => ({ type: 'put', item }),
  create: item => ({ type: 'create', item }),
  replace: (item, expectedVersion) => ({ type: 'replace', item, expectedVersion }),
  delete: key => ({ type: 'delete', key }),
  increment: (key, field) => ({ type: 'increment', key, field }),
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const isId = value => typeof value === 'string' && ID.test(value);

const strip = ({ pk, sk, purgeAt, ...rest }) => rest;

export function memoryStore() {
  const items = new Map();
  const slot = k => `${k.pk}|${k.sk}`;
  return {
    async get(k) {
      const found = items.get(slot(k));
      return found ? structuredClone(found) : null;
    },
    async query(pk, prefix, limit = 50) {
      return [...items.values()]
        .filter(item => item.pk === pk && item.sk.startsWith(prefix))
        .sort((a, b) => (b.sk < a.sk ? -1 : 1))
        .slice(0, limit)
        .map(item => structuredClone(item));
    },
    async touch(k, changes) {
      const found = items.get(slot(k));
      if (found) Object.assign(found, changes);
    },
    async commit(ops) {
      for (const o of ops) {
        const found = items.get(slot(o.item ?? o.key));
        if (o.type === 'create' && found) return false;
        if (o.type === 'replace' && (found?.version ?? null) !== o.expectedVersion) return false;
        if (o.type === 'increment' && !found) return false;
      }
      for (const o of ops) {
        if (o.type === 'delete') items.delete(slot(o.key));
        else if (o.type === 'increment') items.get(slot(o.key)).stats[o.field] += 1;
        else items.set(slot(o.item), structuredClone(o.item));
      }
      return true;
    },
  };
}

let shared;
export function dynamoStore({ table = process.env.TOPTRUMPS_CHALLENGE_TABLE_NAME, region = process.env.TOPTRUMPS_AWS_REGION, client } = {}) {
  if (!table) throw Error('Challenge storage is not configured. Set TOPTRUMPS_CHALLENGE_TABLE_NAME.');
  const doc = client ?? (shared ??= DynamoDBDocumentClient.from(new DynamoDBClient({ region: region || 'eu-west-2' }), { marshallOptions: { removeUndefinedValues: true } }));
  const conditionFailed = e => e?.name === 'TransactionCanceledException'
    && (e.CancellationReasons ?? []).some(r => r?.Code === 'ConditionalCheckFailed' || r?.Code === 'TransactionConflict');

  function toTransactItem(o) {
    if (o.type === 'put') return { Put: { TableName: table, Item: o.item } };
    if (o.type === 'create') {
      return { Put: { TableName: table, Item: o.item, ConditionExpression: 'attribute_not_exists(pk)' } };
    }
    if (o.type === 'replace') {
      const missing = o.expectedVersion === null;
      return {
        Put: {
          TableName: table, Item: o.item,
          ConditionExpression: missing ? 'attribute_not_exists(pk)' : '#v = :expected',
          ...(missing ? {} : { ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':expected': o.expectedVersion } }),
        },
      };
    }
    if (o.type === 'delete') return { Delete: { TableName: table, Key: o.key } };
    if (o.type === 'increment') {
      return {
        Update: {
          TableName: table, Key: o.key,
          UpdateExpression: 'ADD stats.#f :one',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeNames: { '#f': o.field },
          ExpressionAttributeValues: { ':one': 1 },
        },
      };
    }
    throw Error(`Unknown store operation: ${o.type}`);
  }

  return {
    async get(k) {
      const r = await doc.send(new GetCommand({ TableName: table, Key: k, ConsistentRead: true }));
      return r.Item ?? null;
    },
    async query(pk, prefix, limit = 50) {
      const r = await doc.send(new QueryCommand({
        TableName: table, ConsistentRead: true, Limit: limit, ScanIndexForward: false,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':pk': pk, ':p': prefix },
      }));
      return r.Items ?? [];
    },
    async touch(k, changes) {
      const names = Object.keys(changes);
      try {
        await doc.send(new UpdateCommand({
          TableName: table, Key: k,
          UpdateExpression: `SET ${names.map((n, i) => `#n${i} = :v${i}`).join(', ')}`,
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeNames: Object.fromEntries(names.map((n, i) => [`#n${i}`, n])),
          ExpressionAttributeValues: Object.fromEntries(names.map((n, i) => [`:v${i}`, changes[n]])),
        }));
      } catch (e) {
        if (e?.name !== 'ConditionalCheckFailedException') throw e;
      }
    },
    async commit(ops) {
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: ops.map(toTransactItem) }));
        return true;
      } catch (e) {
        if (conditionFailed(e)) return false;
        throw e;
      }
    },
  };
}

// Records are stored flat beside their keys; callers never see pk/sk/purgeAt.
export const unwrap = item => (item ? strip(item) : null);
