// User-confirmed sharing only: the native share sheet where available, otherwise copy.
// Nothing here sends a message on the user's behalf.
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export function inviteText(senderName: string, url: string) {
  return `👑 ${senderName} sent you a Top Trumps challenge. Play whenever you're ready:\n${url}`;
}

// A nudge goes to someone who is already in the game, so the plain challenge page is enough.
export function nudgeText(kind: 'your_turn' | 'played', from: string, url: string) {
  return kind === 'your_turn'
    ? `👑 ${from} here: it's your turn on our Top Trumps challenge.\n${url}`
    : `👑 ${from} here: I've played my card on our Top Trumps challenge. Come and see who won:\n${url}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // fall through to copy when the share sheet is unavailable
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export function whatsappUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// Opens WhatsApp with the message already written. The user still chooses the
// contact and taps send: web pages cannot post to WhatsApp on someone's behalf.
export function openWhatsApp(text: string): boolean {
  const url = whatsappUrl(text);
  const win = window.open(url, '_blank', 'noopener');
  if (win) return true;
  window.location.assign(url); // popup blocked after an async step: navigate instead
  return true;
}
