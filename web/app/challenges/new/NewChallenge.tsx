'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api, newRequestKey, rememberedNickname, rememberNickname } from '../../../lib/challenge-client';
import { Header } from '../ChallengeRoom';

function Form() {
  const router = useRouter();
  const back = useSearchParams().get('back');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(newRequestKey); // one key per form, so a double tap cannot create two drafts
  useEffect(() => setName(rememberedNickname()), []);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const r = await api('POST', '/api/challenges/draft', { nickname: name, idempotencyKey: key, ...(back ? { parentId: back } : {}) });
    if (!r.ok) { setError(r.data.error ?? 'Could not start a challenge.'); setBusy(false); return; }
    rememberNickname(name.trim());
    router.push(`/challenges/${r.data.id}`);
  }

  return <main className="challenge-page"><Header />
    <form className="challenge-panel" onSubmit={start}>
      <p className="eyebrow">CHALLENGE A FRIEND</p>
      <h1>{back ? 'Challenge back' : 'Send a card'}</h1>
      <p>You will get one card, choose a sin and send the challenge by WhatsApp, text, email or link. Your friend plays whenever they like.</p>
      <label htmlFor="nick">Your nickname</label>
      <input id="nick" value={name} onChange={e => setName(e.target.value)} maxLength={24} autoComplete="nickname" required aria-describedby="nick-help" />
      <small id="nick-help" className="muted">Shown to your friend. Up to 24 letters or numbers.</small>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button disabled={busy || !name.trim()}>Deal my card<ArrowRight size={18} /></button>
    </form>
  </main>;
}

export default function NewChallenge() {
  return <Suspense><Form /></Suspense>;
}
