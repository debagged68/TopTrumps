'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Copy, Crown, MessageCircle, Send, X } from 'lucide-react';
import PlayingCard from '../components/PlayingCard';
import SinBadge from '../components/SinBadge';
import RoundCelebration from '../components/RoundCelebration';
import { api, daysLeft, STATUS_TEXT } from '../../lib/challenge-client';
import { inviteText, shareText, copyText, openWhatsApp } from '../../lib/share';

const POLL_MS = 15000;
const WAITING = new Set(['awaiting_reply', 'accepted']);

export default function ChallengeRoom({ id }: { id: string }) {
  const [view, setView] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState('');
  const [celebrate, setCelebrate] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [front, setFront] = useState<'own' | 'other'>('own');
  const pending = useRef(false);

  const load = useCallback(async () => {
    const r = await api('GET', `/api/challenges/${id}`);
    if (r.ok) { setView(r.data); setError(''); }
    else setError(r.status === 404 ? 'This challenge is unavailable on this browser.' : r.data.error);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Poll only while waiting on the other person and only while the tab is visible.
  useEffect(() => {
    if (!view || !WAITING.has(view.status)) return;
    let timer = 0;
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    const start = () => { window.clearInterval(timer); timer = window.setInterval(tick, POLL_MS); };
    const onVisible = () => { if (document.visibilityState === 'visible') { tick(); start(); } };
    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [view?.status, load]);

  useEffect(() => {
    if (!celebrate) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setCelebrate(null), reduced ? 1200 : celebrate === 'draw' ? 1800 : 3000);
    return () => window.clearTimeout(timer);
  }, [celebrate]);

  async function act(path: string, body?: unknown) {
    if (pending.current) return null;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const r = await api('POST', `/api/challenges/${id}/${path}`, body ?? {});
      if (!r.ok) { setError(r.data.error ?? 'Something went wrong.'); if (r.status === 409 || r.status === 410) void load(); return null; }
      setView(r.data);
      return r.data;
    } finally { pending.current = false; setBusy(false); }
  }

  async function invite() {
    const r = await api('GET', `/api/challenges/${id}/invitation`);
    if (!r.ok) { setError(r.data.error); return null; }
    const url = new URL(r.data.path, window.location.origin).toString();
    setShareUrl(url);
    return { url, text: inviteText(r.data.senderName, url) };
  }

  async function whatsapp() {
    setError('');
    const i = await invite();
    if (!i) return;
    openWhatsApp(i.text);
    setNotice('WhatsApp is opening with your invitation. Pick your friend and tap send.');
  }

  async function share() {
    setError('');
    const i = await invite();
    if (!i) return;
    const outcome = await shareText(i.text);
    setNotice(outcome === 'shared' ? 'Invitation ready. Only the first person to accept can play.'
      : outcome === 'copied' ? 'Invitation copied. Paste it into WhatsApp, Messages or email.'
      : outcome === 'cancelled' ? '' : 'Copy the link below and send it yourself.');
  }

  // Locking is the moment the sender wants to invite, so go straight to WhatsApp.
  async function lockAndInvite() {
    const data = await act('lock', { category: picked });
    if (data) await whatsapp();
  }

  async function reveal() {
    const before = view?.status;
    const data = await act('reveal');
    if (data?.result && before === 'result_ready') {
      setFlipped({ own: true, other: true });
      setFront('own');
      setCelebrate(data.result.outcome);
    }
  }

  if (!view) {
    return <main className="challenge-page"><Header />
      <section className="challenge-panel">{error ? <><h1>Challenge unavailable</h1><p>{error}</p><p>If you opened this from WhatsApp or another app, try the same browser you used before, or use your private access link.</p><Link className="button-link" href="/challenges">My challenges<ArrowRight size={18} /></Link></> : <p>Loading…</p>}</section>
    </main>;
  }

  const opponent: string = view.opponentName ?? 'Your friend';
  const revealed = !!view.result;
  const deciding = revealed ? { sin: view.result.category, winner: view.result.outcome === 'win', draw: view.result.outcome === 'draw' } : undefined;
  const otherDeciding = revealed ? { sin: view.result.category, winner: view.result.outcome === 'loss', draw: view.result.outcome === 'draw' } : undefined;
  const flip = (k: string) => setFlipped(f => ({ ...f, [k]: !f[k] }));
  const status = STATUS_TEXT[view.status] ?? view.status;
  const left = daysLeft(view.deadline);

  const ownHeading = view.status === 'draft' ? 'Choose your sin' : view.role === 'recipient' && view.status === 'your_turn' ? 'Your card' : 'Sins & scores';
  const ownSub = view.status === 'draft' ? 'Tap the sin you want to challenge with, then lock it.'
    : view.status === 'your_turn' ? `${view.opponentName} locked one of two sins. Higher score wins.`
    : revealed ? (view.result.outcome === 'draw' ? 'Equal scores. Round drawn.' : 'The winning sin is marked in green.') : undefined;

  const otherCard = view.opponent ?? view.opponentFront;
  // Like the computer game, the friend's quote card arrives on top until the result is revealed.
  const ownOnTop = !otherCard || (revealed && front === 'own');

  return (
    <main className="game-screen challenge-room">
      <Header />
      <section className="challenge-panel room-status" aria-live="polite">
        <p className="eyebrow">{view.role === 'sender' ? `YOU v ${view.opponentName ?? 'A FRIEND'}` : `${view.opponentName} v YOU`}{left && <span className="muted"> · {left}</span>}</p>
        <h1>{status}</h1>
        {view.role === 'sender' && view.chosen && !revealed && <p>You locked <SinBadge name={view.chosen} />.</p>}
        {view.status === 'cancelled' && <p>{view.role === 'sender' ? 'You cancelled this challenge.' : 'The sender cancelled this challenge. Nobody wins or loses.'}</p>}
        {view.status === 'declined' && <p>{view.role === 'sender' ? `${opponent} declined this challenge. No result was recorded.` : 'You declined this challenge. No result was recorded.'}</p>}
        {view.status === 'expired' && <p>This challenge ran out of time. No result was recorded.</p>}
        {view.status === 'result_ready' && <p>{view.role === 'sender' ? `${opponent} has played.` : 'You played.'} Turn the cards to see who won.</p>}
        {revealed && <p className="result-line">{view.result.outcome === 'win' ? 'You win' : view.result.outcome === 'loss' ? `${opponent} wins` : 'Draw'} on <SinBadge name={view.result.category} />: you {view.result.yours}, {opponent} {view.result.theirs}.</p>}
      </section>

      <section className={'card-stage ' + (otherCard ? (revealed ? 'spread' : 'stacked') : 'single')} aria-label="Playing cards">
        <div className="card-rail"><div className="card-layout">
          <PlayingCard card={view.card} tag="YOUR CARD" categories={view.categories} flipped={!!flipped.own} onFlip={() => flip('own')}
            heading={ownHeading} subheading={ownSub} disabled={busy}
            onPick={view.status === 'draft' ? setPicked : undefined} picked={view.status === 'draft' ? picked : undefined} deciding={deciding}
            active={ownOnTop} onActivate={() => setFront('own')} />
          {otherCard && (
            revealed
              ? <PlayingCard card={otherCard} tag={`${opponent.toUpperCase()}’S CARD`} categories={view.categories} flipped={!!flipped.other} onFlip={() => flip('other')} deciding={otherDeciding} active={!ownOnTop} onActivate={() => setFront('other')} />
              : <PlayingCard card={otherCard} tag={`${opponent.toUpperCase()}’S CARD`} categories={view.categories} flipped={false} onFlip={reveal} disabled={busy} revealLabel={`Tap to reveal ${opponent}’s scores and the result.`} active={!ownOnTop} onActivate={() => setFront('other')} />
          )}
        </div></div>
      </section>

      <div className="bottom-actions challenge-actions">
        {view.status === 'draft' && <button onClick={lockAndInvite} disabled={busy || !picked}><Crown size={18} />{picked ? `Lock ${picked} & send on WhatsApp` : 'Choose a sin first'}</button>}
        {view.status === 'awaiting_reply' && view.role === 'sender' && <>
          <button onClick={whatsapp} disabled={busy}><MessageCircle size={18} />Send on WhatsApp</button>
          <button className="secondary" onClick={share} disabled={busy}><Send size={18} />Other apps or copy</button>
        </>}
        {view.status === 'your_turn' && (
          <button className="play-for" onClick={() => act('respond', { card: view.card.id })} disabled={busy}
            aria-label={`Play your card for ${view.hints.join(' or ')}. ${opponent} has already locked one of these sins.`}>
            <span className="play-for-label">Play for<span className="play-for-lock"> · one locked</span></span>
            <span className="possible-sins"><SinBadge name={view.hints[0]} /><span className="sin-or">or</span><SinBadge name={view.hints[1]} /></span>
          </button>
        )}
        {view.status === 'result_ready' && <button onClick={reveal} disabled={busy}><ArrowRight size={18} />Reveal result</button>}
        {(view.status === 'completed' || ['cancelled', 'declined', 'expired'].includes(view.status)) && (
          <Link className="button-link" href={`/challenges/new${view.status === 'completed' ? `?back=${view.id}` : ''}`}><Send size={18} />{view.status === 'completed' ? 'Challenge back' : 'New challenge'}</Link>
        )}
        {view.role === 'sender' && ['draft', 'awaiting_reply', 'accepted'].includes(view.status) && <button className="secondary" onClick={() => { if (confirm('Cancel this challenge? Nobody wins or loses.')) void act('cancel'); }} disabled={busy}><X size={18} />Cancel challenge</button>}
        {view.role === 'recipient' && view.status === 'your_turn' && <button className="secondary" onClick={() => { if (confirm('Decline this challenge? It does not count as a loss.')) void act('decline'); }} disabled={busy}><X size={18} />Decline</button>}
      </div>

      {shareUrl && view.status === 'awaiting_reply' && (
        <section className="challenge-panel share-fallback">
          <label htmlFor="invite-url">Invitation link</label>
          <div className="copy-row"><input id="invite-url" readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} />
            <button className="secondary" onClick={async () => setNotice((await copyText(inviteText(view.yourName, shareUrl))) ? 'Copied.' : 'Select the link and copy it.')}><Copy size={16} />Copy</button></div>
          <p className="muted">Anyone with this link can take the one seat, so send it only to the friend you mean.</p>
        </section>
      )}
      {(busy || error || notice) && <div className={'notice ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{error || notice || 'Please wait…'}</div>}
      {celebrate && <RoundCelebration outcome={celebrate} opponent={opponent} />}
    </main>
  );
}

export function Header() {
  return <header><div className="brand-group"><Link className="brand" href="/" aria-label="Top Trumps home"><Crown /><span>TOP TRUMPS</span></Link></div><Link className="header-link" href="/challenges">My challenges</Link></header>;
}
