// Anonymous guest identity (docs/ASYNC_CHALLENGES.md §7). The cookie holds an opaque
// 256-bit credential; the server stores only its SHA-256 hash, so a database read
// never yields a usable credential.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const GUEST_COOKIE = 'tt_guest';
const CREDENTIAL = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, unpadded

export function newGuest() {
  return { guestId: randomBytes(16).toString('base64url'), credential: randomBytes(32).toString('base64url') };
}

export function hashCredential(credential) {
  return createHash('sha256').update(credential).digest('hex');
}

export function credentialMatches(credential, storedHash) {
  if (!isCredential(credential) || typeof storedHash !== 'string') return false;
  const a = Buffer.from(hashCredential(credential), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isCredential(value) {
  return typeof value === 'string' && CREDENTIAL.test(value);
}

export function readCredential(cookieHeader) {
  for (const part of String(cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === GUEST_COOKIE) {
      const value = rest.join('=');
      return isCredential(value) ? value : null;
    }
  }
  return null;
}

export function guestCookie(credential, { secure, maxAgeSeconds }) {
  return [`${GUEST_COOKIE}=${credential}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, ...(secure ? ['Secure'] : [])].join('; ');
}

export function clearGuestCookie({ secure }) {
  return guestCookie('', { secure, maxAgeSeconds: 0 });
}

export function validNickname(value, max = 24) {
  if (typeof value !== 'string') return null;
  if (/[\p{Cc}\p{Cf}]/u.test(value)) return null; // reject control/invisible characters outright
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  // Letters, numbers, spaces and light punctuation only; no control or markup characters.
  if (!name || [...name].length > max || !/^[\p{L}\p{N} .,'’_-]+$/u.test(name)) return null;
  return name;
}
