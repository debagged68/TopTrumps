// Proposed v1 defaults from docs/ASYNC_CHALLENGES.md section 1. All are configurable
// because the owner has not separately approved each duration.
const DAY = 86400;

export const CHALLENGE_DEFAULTS = Object.freeze({
  draftSeconds: 7 * DAY,            // an unlocked draft is discarded after this long
  inviteSeconds: 7 * DAY,           // unanswered challenges expire this long after locking
  resultRetentionSeconds: 30 * DAY, // completed results stay available this long
  terminalGraceSeconds: 7 * DAY,    // keep cancelled/declined/expired rows so the page can explain
  guestInactivitySeconds: 30 * DAY, // a guest identity expires after this much inactivity
  guestTouchSeconds: DAY,           // refresh guest activity at most this often
  nicknameMax: 24,
});

const OVERRIDES = {
  TOPTRUMPS_CHALLENGE_INVITE_DAYS: 'inviteSeconds',
  TOPTRUMPS_CHALLENGE_RESULT_DAYS: 'resultRetentionSeconds',
  TOPTRUMPS_GUEST_INACTIVITY_DAYS: 'guestInactivitySeconds',
};

export function challengeConfig(env = process.env) {
  const config = { ...CHALLENGE_DEFAULTS };
  for (const [name, key] of Object.entries(OVERRIDES)) {
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw Error(`${name} must be a whole number of days from 1 to 365.`);
    }
    config[key] = days * DAY;
  }
  return Object.freeze(config);
}
