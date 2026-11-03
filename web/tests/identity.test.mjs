import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, signingSecret, resetSecretCache, redact } from '../lib/capability.mjs';
import { newGuest, hashCredential, credentialMatches, readCredential, guestCookie, validNickname } from '../lib/guest.mjs';

const secret = 'x'.repeat(40);
const base = { secret, purpose: 'invite', subject: 'chal1', generation: 1, expiresAt: 2000 };
const check = (over = {}) => verify({ ...base, token: sign(base), now: 1000, ...over });

test('a valid capability verifies until it expires', () => {
  assert(check());
  assert(!check({ now: 2000 }));
});

test('tampering, wrong purpose, subject, generation or secret are all rejected', () => {
  const token = sign(base);
  assert(!check({ purpose: 'guest-recovery' }));
  assert(!check({ subject: 'chal2' }));
  assert(!check({ generation: 2 })); // revoked by cancel/regenerate
  assert(!check({ secret: 'y'.repeat(40) }));
  const [v, , tag] = token.split('.');
  assert(!check({ token: `${v}.99999.${tag}` })); // extended expiry
  assert(!check({ token: token.slice(0, -2) + 'AA' }));
  for (const bad of [undefined, null, '', 'v1', 'v1..', 'v2.2000.abc', token + '.x', 'v1.20x.abc', 'a'.repeat(500)]) {
    assert(!check({ token: bad }), String(bad));
  }
});

test('non-canonical encodings of a valid signature are rejected', () => {
  const token = sign(base);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const head = token.slice(0, -1);
  for (const ch of alphabet) {
    const variant = head + ch;
    assert.equal(check({ token: variant }), variant === token, variant);
  }
});

test('short secrets and unknown purposes are refused', () => {
  assert.throws(() => sign({ ...base, secret: 'short' }));
  assert.throws(() => sign({ ...base, purpose: 'admin' }));
});

test('signing secret fails closed and caches an injected loader', async () => {
  resetSecretCache();
  await assert.rejects(signingSecret({ env: {} }), /unavailable/);
  await assert.rejects(signingSecret({ loader: async () => 'short' }), /unavailable/);
  await assert.rejects(signingSecret({ env: { NODE_ENV: 'production', TOPTRUMPS_CHALLENGE_SIGNING_SECRET: secret } }), /unavailable/);
  assert.equal(await signingSecret({ env: { TOPTRUMPS_CHALLENGE_SIGNING_SECRET: secret } }), secret);
  resetSecretCache();
});

test('redact hides capabilities in URLs and tokens', () => {
  const token = sign(base);
  assert(!redact(`/challenge/a#invite=${token}`).includes(token));
  assert(!redact(`failed ${token}`).includes(token.split('.')[2]));
  assert(!redact('/challenges#access=g.abc').includes('abc'));
});

test('guest credentials are random, stored only as hashes and compared safely', () => {
  const a = newGuest(), b = newGuest();
  assert.notEqual(a.credential, b.credential);
  assert.equal(a.credential.length, 43);
  const hash = hashCredential(a.credential);
  assert(!hash.includes(a.credential));
  assert(credentialMatches(a.credential, hash));
  assert(!credentialMatches(b.credential, hash));
  assert(!credentialMatches('short', hash));
  assert(!credentialMatches(a.credential, undefined));
});

test('cookie parsing and flags', () => {
  const { credential } = newGuest();
  assert.equal(readCredential(`a=1; tt_guest=${credential}; b=2`), credential);
  assert.equal(readCredential('tt_guest=bad'), null);
  assert.equal(readCredential(undefined), null);
  const c = guestCookie(credential, { secure: true, maxAgeSeconds: 100 });
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=100']) assert(c.includes(flag), flag);
  assert(!guestCookie(credential, { secure: false, maxAgeSeconds: 1 }).includes('Secure'));
});

test('nicknames are normalised and unsafe values rejected', () => {
  assert.equal(validNickname('  Ann   Lee '), 'Ann Lee');
  assert.equal(validNickname('Zoë'), 'Zoë');
  for (const bad of ['', '   ', '<b>x</b>', 'a'.repeat(25), 'x\ny', 42, null, 'x;DROP']) assert.equal(validNickname(bad), null, String(bad));
});
