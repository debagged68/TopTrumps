// Browser-side helpers for the challenge pages.
export type ApiResult = { ok: boolean; status: number; data: any };

export async function api(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'You appear to be offline. Check your connection and try again.', code: 'offline' } };
  }
}

export const NICKNAME_KEY = 'toptrumps-nickname-v1';
export const rememberedNickname = () => {
  try { return localStorage.getItem(NICKNAME_KEY) ?? ''; } catch { return ''; }
};
export const rememberNickname = (name: string) => {
  try { localStorage.setItem(NICKNAME_KEY, name); } catch { /* private mode */ }
};

// crypto.randomUUID only exists on HTTPS and localhost; getRandomValues works everywhere,
// including a phone testing against the dev server over plain http on the local network.
export function newRequestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export const STATUS_TEXT: Record<string, string> = {
  draft: 'Draft — choose your sin',
  waiting_for_sender: 'Rematch on — waiting for their sin',
  awaiting_reply: 'Waiting for your friend',
  accepted: 'Accepted — waiting for their play',
  your_turn: 'Your turn',
  result_ready: 'Result ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined',
  expired: 'Expired',
};

export function daysLeft(deadline: number | null | undefined) {
  if (!deadline) return '';
  const seconds = deadline - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return 'expired';
  if (seconds < 3600) return 'less than an hour left';
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h left`;
  return `${Math.floor(seconds / 86400)}d left`;
}
