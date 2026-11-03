// Best-effort per-instance limiter for create/accept/recover. Serverless instances do not
// share memory, so this only blunts casual abuse; enforce the real limit with AWS WAF
// rate-based rules in front of Amplify.
export function rateLimiter({ limit, windowSeconds }) {
  const hits = new Map();
  return function allow(name, now) {
    const entry = hits.get(name);
    if (!entry || now >= entry.resetAt) {
      if (hits.size > 5000) hits.clear();
      hits.set(name, { count: 1, resetAt: now + windowSeconds });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
