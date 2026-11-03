// "It's your move" alerts for an open challenge page: a short chime, a vibration where the
// browser supports one, and a flashing tab title. Browsers only allow sound after a tap, so
// the audio context is created on the first interaction and reused afterwards.
const KEY = 'tt_sound';
let ctx: AudioContext | null = null;
let stopFlash: (() => void) | null = null;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSound(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: keep the default */ }
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch { return null; }
  return ctx;
}

// Call from a user gesture (tap or key press). Safe to call repeatedly.
export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

function chime() {
  const c = context();
  if (!c || c.state !== 'running') return;
  const start = c.currentTime + 0.02;
  [[659.25, 0], [987.77, 0.14]].forEach(([freq, offset]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.5);
    osc.connect(gain).connect(c.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.55);
  });
}

function flashTitle(message: string) {
  stopFlash?.();
  const original = document.title;
  let on = false;
  const timer = window.setInterval(() => { on = !on; document.title = on ? `● ${message}` : original; }, 1000);
  const stop = () => {
    window.clearInterval(timer);
    document.title = original;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', stop);
    stopFlash = null;
  };
  const onVisible = () => { if (document.visibilityState === 'visible') stop(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', stop);
  stopFlash = stop;
  // A visible tab does not need to keep flashing: the page itself already shows the change.
  if (document.visibilityState === 'visible') window.setTimeout(stop, 4000);
}

export function alertUser(message: string) {
  flashTitle(message);
  if (!soundOn()) return;
  chime();
  try { navigator.vibrate?.([120, 80, 120]); } catch { /* not supported */ }
}
