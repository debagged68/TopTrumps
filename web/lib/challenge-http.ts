// Shared HTTP handling for every challenge route: feature flag, origin and size checks,
// guest cookie, rate limits, no-store/no-referrer headers and safe error mapping.
import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import dataset from '../data/donald.json';
import { GameError } from './game.mjs';
import { challengeConfig } from './challenge-config.mjs';
import { memoryStore, dynamoStore } from './challenge-store.mjs';
import { signingSecret, redact } from './capability.mjs';
import { secretsManagerLoader } from './challenge-secret.mjs';
import { readCredential, guestCookie } from './guest.mjs';
import { rateLimiter } from './rate-limit.mjs';
import { challengesEnabled } from './challenge-flag';

export const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store, private',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

const MAX_BODY = 4096;
type Store = ReturnType<typeof memoryStore>;
type Shared = { store?: Store; localSecret?: string; limiters?: Record<string, (name: string, now: number) => boolean> };
const shared = ((globalThis as unknown as { __ttChallenges?: Shared }).__ttChallenges ??= {});


function isLocal() {
  return process.env.TOPTRUMPS_LOCAL_STATE === '1' && process.env.NODE_ENV !== 'production';
}

function store(): Store {
  if (isLocal()) return (shared.store ??= memoryStore());
  return (shared.store ??= dynamoStore() as Store);
}

async function loadSecret() {
  if (isLocal() && !process.env.TOPTRUMPS_CHALLENGE_SIGNING_SECRET) {
    return (shared.localSecret ??= randomBytes(32).toString('hex'));
  }
  return signingSecret({ loader: process.env.NODE_ENV === 'production' ? () => secretsManagerLoader() : undefined });
}

const limits = (shared.limiters ??= {
  create: rateLimiter({ limit: 30, windowSeconds: 600 }),
  accept: rateLimiter({ limit: 30, windowSeconds: 600 }),
  recover: rateLimiter({ limit: 10, windowSeconds: 600 }),
});

export type Ctx = {
  store: Store;
  dataset: typeof dataset;
  config: ReturnType<typeof challengeConfig>;
  secret: () => Promise<string>;
  now: number;
};

export type Handled = { body: unknown; status?: number; issuedCredential?: string };
type Handler = (args: { ctx: Ctx; credential: string | null; input: Record<string, unknown> }) => Promise<Handled>;

function clientAddress(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  try {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isSecure(req: NextRequest) {
  return req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) throw new GameError('Request is too large.', 413, 'too_large');
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new GameError('Request is too large.', 413, 'too_large');
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new GameError('Invalid request.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GameError('Invalid request.');
  return value as Record<string, unknown>;
}

export function handle(handler: Handler, options: { mutate?: boolean; limit?: 'create' | 'accept' | 'recover' } = {}) {
  return async function route(req: NextRequest) {
    if (!challengesEnabled()) return json({ error: 'Not found.', code: 'disabled' }, 404);
    try {
      const now = Math.floor(Date.now() / 1000);
      if (options.mutate && !sameOrigin(req)) return json({ error: 'Invalid request origin.', code: 'origin' }, 403);
      if (options.limit && !limits[options.limit](`${options.limit}:${clientAddress(req)}`, now)) {
        return json({ error: 'Too many attempts. Please wait a few minutes.', code: 'rate_limited' }, 429);
      }
      const input = options.mutate ? await readBody(req) : {};
      const config = challengeConfig();
      const ctx: Ctx = { store: store(), dataset, config, secret: loadSecret, now };
      const result = await handler({ ctx, credential: readCredential(req.headers.get('cookie')), input });
      const res = json(result.body, result.status ?? 200);
      if (result.issuedCredential) {
        res.headers.append('Set-Cookie', guestCookie(result.issuedCredential, { secure: isSecure(req), maxAgeSeconds: config.guestInactivitySeconds }));
      }
      return res;
    } catch (e) {
      if (e instanceof GameError) return json({ error: e.message, code: e.code }, e.status);
      console.error('Challenge request failed', redact(e instanceof Error ? `${e.name}: ${e.message}` : 'error'));
      return json({ error: 'Unable to complete this action. Please try again.', code: 'server' }, 503);
    }
  };
}

// Route segment params arrive as a Promise in Next 15.
export type IdParams = { params: Promise<{ id: string }> };
export function withId(make: (id: string) => Handler, options?: Parameters<typeof handle>[1]) {
  return async (req: NextRequest, { params }: IdParams) => handle(make((await params).id), options)(req);
}
