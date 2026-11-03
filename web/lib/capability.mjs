// Purpose-separated, expiring HMAC capabilities (docs/ASYNC_CHALLENGES.md §7).
// A token proves "the holder was given this link" for one purpose, one subject
// (challenge or guest) and one generation. Bumping the stored generation revokes it.
// The signing secret never reaches client code, logs or `.env.production`.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { GameError } from './game.mjs';

export const PURPOSES = Object.freeze(['invite', 'guest-recovery']);
const VERSION = 'v1';

function mac(secret, purpose, subject, generation, expiresAt) {
  return createHmac('sha256', secret).update([VERSION, purpose, subject, generation, expiresAt].join('\n')).digest();
}

function checkPurpose(purpose) {
  if (!PURPOSES.includes(purpose)) throw Error(`Unknown capability purpose: ${purpose}`);
}

function checkSecret(secret) {
  if (typeof secret !== 'string' && !Buffer.isBuffer(secret)) throw Error('A signing secret is required.');
  if (secret.length < 32) throw Error('The signing secret is too short.');
}

export function sign({ secret, purpose, subject, generation, expiresAt }) {
  checkSecret(secret);
  checkPurpose(purpose);
  const tag = mac(secret, purpose, subject, generation, expiresAt).toString('base64url');
  return `${VERSION}.${expiresAt}.${tag}`;
}

// Never throws on malformed input: any problem is simply "not valid".
export function verify({ secret, purpose, subject, generation, token, now }) {
  checkSecret(secret);
  checkPurpose(purpose);
  if (typeof token !== 'string' || token.length > 200) return false;
  const [version, expiry, tag, extra] = token.split('.');
  if (version !== VERSION || extra !== undefined || !/^\d{1,12}$/.test(expiry ?? '') || !tag) return false;
  const expiresAt = Number(expiry);
  const expected = mac(secret, purpose, subject, generation, expiresAt);
  const given = Buffer.from(tag, 'base64url');
  // Reject non-canonical encodings: the final character carries spare bits, so several
  // different strings would otherwise decode to the same valid signature.
  if (given.toString('base64url') !== tag) return false;
  const matches = given.length === expected.length && timingSafeEqual(given, expected);
  return matches && now < expiresAt;
}

// Compact invitation key for short links (/c/<id>#<key>): 128 bits of the HMAC, 22 characters.
// It carries no expiry because the challenge record's own deadline is enforced on every use;
// bumping the generation still revokes it. Long v1 tokens remain valid for links already sent.
const COMPACT = 'c1';
const COMPACT_BYTES = 16;
function compactMac(secret, purpose, subject, generation) {
  return createHmac('sha256', secret).update([COMPACT, purpose, subject, generation].join('\n')).digest().subarray(0, COMPACT_BYTES);
}

export function signCompact({ secret, purpose, subject, generation }) {
  checkSecret(secret);
  checkPurpose(purpose);
  return compactMac(secret, purpose, subject, generation).toString('base64url');
}

export function verifyCompact({ secret, purpose, subject, generation, token }) {
  checkSecret(secret);
  checkPurpose(purpose);
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(token)) return false;
  const given = Buffer.from(token, 'base64url');
  if (given.toString('base64url') !== token) return false; // canonical encoding only
  const expected = compactMac(secret, purpose, subject, generation);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Fails closed. In production the loader must read Secrets Manager; tests and local
// development inject a loader (or set TOPTRUMPS_CHALLENGE_SIGNING_SECRET outside production).
let cached;
export function resetSecretCache() { cached = undefined; }

/**
 * @param {{ loader?: () => Promise<string | null>, env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<string>}
 */
export async function signingSecret({ loader = undefined, env = process.env } = {}) {
  if (cached) return cached;
  let secret;
  if (loader) secret = await loader();
  else if (env.TOPTRUMPS_CHALLENGE_SIGNING_SECRET && env.NODE_ENV !== 'production') {
    secret = env.TOPTRUMPS_CHALLENGE_SIGNING_SECRET;
  }
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new GameError('Challenges are unavailable right now.', 503, 'unavailable');
  }
  cached = secret;
  return secret;
}

// Keeps capabilities out of logs and error messages.
export function redact(text) {
  return String(text)
    .replace(/#(invite|access)=[^\s&"']+/g, '#$1=[redacted]')
    .replace(/(\/c\/[A-Za-z0-9_-]+)#[A-Za-z0-9_-]+/g, '$1#[redacted]')
    .replace(/\bv1\.\d{1,12}\.[A-Za-z0-9_-]{20,}/g, 'v1.[redacted]');
}
