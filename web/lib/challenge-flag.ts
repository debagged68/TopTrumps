// Friend challenges are off unless explicitly enabled, so a missing challenge
// configuration can never affect computer play.
export function challengesEnabled(env: Record<string, string | undefined> = process.env) {
  return env.TOPTRUMPS_CHALLENGES === '1';
}
