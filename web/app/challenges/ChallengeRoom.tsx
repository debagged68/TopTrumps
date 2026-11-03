'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bell, BellOff, Copy, Crown, MessageCircle, Send, X } from 'lucide-react';
import PlayingCard from '../components/PlayingCard';
import SinBadge from '../components/SinBadge';
import RoundCelebration from '../components/RoundCelebration';
import { api, daysLeft, STATUS_TEXT } from '../../lib/challenge-client';
import { inviteText, nudgeText, shareText, copyText, openWhatsApp } from '../../lib/share';
import { alertUser, setSound, soundOn, unlockAudio } from '../../lib/alert';

const POLL_MS = 15000;
const WAITING = new Set(['awaiting_reply', 'accepted', 'waiting_for_sender']);
const HIDDEN_POLL_EVERY = 2; // a background tab checks every other poll, so alerts still arrive
const LIVE_MS = 5000; // heartbeat while both players are on a finished challenge

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
  const router = useRouter();
  const [live, setLive] = useState<any>(null);
  const lastRematch = useRef('');
  const lastStatus = useRef('');
  const [sound, setSoundState] = useState(true);

  useEffect(() => {
    setSoundState(soundOn());
    // Browsers only allow sound after a tap, so unlock audio on the first interaction.
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  const load = useCallback(async () => {
    const r = await api('GET', `/api/challenges/${id}`);
    if (r.ok) {
      // Alert only when polling discovers that the other player moved, never for your own taps.
      const before = lastStatus.current, now = r.data.status;
      lastStatus.current = now;
      if (before && before !== now) {
        if (r.data.role === 'sender' && before === 'awaiting_reply' && now === 'accepted') alertUser(`${r.data.opponentName ?? 'Your friend'} accepted`);
        else if (r.data.role === 'sender' && before === 'accepted' && now === 'result_ready') alertUser(`${r.data.opponentName ?? 'Your friend'} has played`);
        else if (r.data.role === 'recipient' && before === 'waiting_for_sender' && now === 'your_turn') alertUser('Your turn');
      }
      setView(r.data); setError('');
    }
    else setError(r.status === 404 ? 'This challenge is unavailable on this browser.' : r.data.error);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (view?.status) lastStatus.current = view.status; }, [view?.status]);

  // Poll only while waiting on the other person and only while the tab is visible.
  useEffect(() => {
    if (!view || !WAITING.has(view.status)) return;
    let timer = 0;
    let n = 0;
    const tick = () => { if (document.visibilityState === 'visible' || ++n % HIDDEN_POLL_EVERY === 0) void load(); };
    const start = () => { window.clearInterval(timer); timer = window.setInterval(tick, POLL_MS); };
    const onVisible = () => { if (document.visibilityState === 'visible') { tick(); start(); } };
    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [view?.status, load]);

  // Live challenge back: only while this tab is visible on a result you have revealed.
  const applyLive = useCallback((data: any, mine = false) => {
    setLive(data);
    const state = data?.rematch ? `${data.rematch.from}:${data.rematch.state}` : '';
    const before = lastRematch.current;
    lastRematch.current = state;
    // Move both players into the new game, but only when it was accepted while they were here.
    if (data?.rematch?.state === 'accepted' && (mine || (before && !before.endsWith('accepted')))) {
      router.push(`/challenges/${data.rematch.challengeId}`);
    }
  }, [router]);

  const liveAct = useCallback(async (action: string) => {
    const r = await api('POST', `/api/challenges/${id}/live`, { action });
    if (r.ok) { applyLive(r.data, action !== 'ping'); return r.data; }
    if (action !== 'ping') setError(r.data.error ?? 'Something went wrong.');
    return null;
  }, [id, applyLive]);

  useEffect(() => {
    if (view?.status !== 'completed') return;
    let timer = 0;
    const tick = () => { if (document.visibilityState === 'visible') void liveAct('ping'); };
    tick();
    timer = window.setInterval(tick, LIVE_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [view?.status, liveAct]);

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

  function nudge(kind: 'your_turn' | 'played') {
    openWhatsApp(nudgeText(kind, view.yourName, new URL(`/challenges/${id}`, window.location.origin).toString()));
  }

  function toggleSound() {
    const next = !sound;
    setSound(next); setSoundState(next);
    if (next) unlockAudio();
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

  // Locking is the moment the sender wants to invite, so go straight to WhatsApp. A live
  // rematch already has its opponent seated, so locking simply hands them the turn.
  async function lockAndInvite() {
    const data = await act('lock', { category: picked });
    if (data && data.status === 'awaiting_reply') await whatsapp();
  }

  async function challengeBack() {
    setError(''); setNotice('');
    const data = await liveAct('request');
    if (data?.rematch?.state === 'pending') setNotice(`Challenge sent. Waiting for ${view?.opponentName ?? 'your friend'} to answer…`);
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

  const seated = view.status === 'draft' && !!view.opponentName; // live rematch: no link needed
  const rematch = live?.rematch;
  const askedByThem = rematch?.from === 'them' && rematch.state === 'pending';
  const waitingOnThem = rematch?.from === 'you' && rematch.state === 'pending';
  const otherCard = view.opponent ?? view.opponentFront;
  // Like the computer game, the friend's quote card arrives on top until the result is revealed.
  const ownOnTop = !otherCard || (revealed && front === 'own');

  return (
    <main className="game-screen challenge-room">
      <Header />
      <section className="challenge-panel room-status" aria-live="polite">
        <p className="eyebrow">{view.role === 'sender' ? `YOU v ${view.opponentName ?? 'A FRIEND'}` : `${view.opponentName} v YOU`}{left && <span className="muted"> · {left}</span>}</p>
        <h1>{status}</h1>
        {WAITING.has(view.status) && <button type="button" className="sound-toggle" onClick={toggleSound} aria-pressed={sound}>{sound ? <Bell size={14} /> : <BellOff size={14} />}{sound ? 'Sound alert on' : 'Sound alert off'}</button>}
        {view.role === 'sender' && view.chosen && !revealed && <p>You locked <SinBadge name={view.chosen} />.</p>}
        {view.status === 'cancelled' && <p>{view.role === 'sender' ? 'You cancelled this challenge.' : 'The sender cancelled this challenge. Nobody wins or loses.'}</p>}
        {view.status === 'declined' && <p>{view.role === 'sender' ? `${opponent} declined this challenge. No result was recorded.` : 'You declined this challenge. No result was recorded.'}</p>}
        {view.status === 'expired' && <p>This challenge ran out of time. No result was recorded.</p>}
        {view.status === 'waiting_for_sender' && <p>{opponent} challenged you back and is choosing a sin. Your card is ready.</p>}
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
        {view.status === 'draft' && <button onClick={lockAndInvite} disabled={busy || !picked}><Crown size={18} />{!picked ? 'Choose a sin first' : seated ? `Lock ${picked} for ${opponent}` : `Lock ${picked} & send on WhatsApp`}</button>}
        {view.status === 'awaiting_reply' && view.role === 'sender' && <>
          <button onClick={whatsapp} disabled={busy}><MessageCircle size={18} />Send on WhatsApp</button>
          <button className="secondary" onClick={share} disabled={busy}><Send size={18} />Other apps or copy</button>
        </>}
        {view.status === 'your_turn' && (
          <button className="play-mine" onClick={() => act('respond', { card: view.card.id })} disabled={busy}
            aria-label={`Play your card. ${opponent} locked ${view.hints.join(' or ')}.`}>
            <ArrowRight size={18} /><span>Play my card<small>{opponent} locked {view.hints[0]} or {view.hints[1]}</small></span>
          </button>
        )}
        {view.status === 'result_ready' && <button onClick={reveal} disabled={busy}><ArrowRight size={18} />Reveal result</button>}
        {view.role === 'sender' && view.status === 'accepted' && <button onClick={() => nudge('your_turn')}><MessageCircle size={18} />Tell {opponent} it’s their turn</button>}
        {view.role === 'recipient' && view.status === 'result_ready' && <button className="secondary" onClick={() => nudge('played')}><MessageCircle size={18} />Tell {opponent} you’ve played</button>}
        {view.status === 'completed' && (rematch?.state === 'accepted'
          ? <Link className="button-link" href={`/challenges/${rematch.challengeId}`}><ArrowRight size={18} />Go to the rematch</Link>
          : <button className={askedByThem ? 'live-ask' : ''} onClick={askedByThem ? () => void liveAct('accept') : challengeBack}
              disabled={busy || waitingOnThem || (!askedByThem && !live?.opponentHere)}>
              <Send size={18} />{askedByThem ? `${opponent} challenged you back · Play` : waitingOnThem ? `Waiting for ${opponent}…` : 'Challenge back'}
            </button>)}
        {view.status === 'completed' && !rematch?.challengeId && <span className={'live-presence' + (live?.opponentHere ? ' here' : '')}>{live?.opponentHere ? `${opponent} is here` : `${opponent} isn’t on this page`}</span>}
        {['cancelled', 'declined', 'expired'].includes(view.status) && <Link className="button-link" href="/challenges/new"><Send size={18} />New challenge</Link>}
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
      {view.status === 'completed' && !askedByThem && rematch?.state === 'declined' && rematch.from === 'you' && <div className="notice" role="status">{opponent} said not now.</div>}
      {view.status === 'completed' && rematch?.state === 'lapsed' && <div className="notice" role="status">The challenge back lapsed because someone left. Ask again while you are both here.</div>}
      {askedByThem && !celebrate && (
        <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="rematch-title" className="modal rematch-modal">
          <p className="eyebrow">CHALLENGE BACK</p>
          <h2 id="rematch-title">{opponent} wants a rematch</h2>
          <p>{opponent} will deal a new card and lock a sin, then it’s your turn. No link needed.</p>
          <div className="rematch-actions">
            <button autoFocus onClick={() => void liveAct('accept')}><Crown size={18} />Accept</button>
            <button className="secondary" onClick={() => void liveAct('decline')}><X size={18} />Not now</button>
          </div>
        </section></div>
      )}
      {celebrate && <RoundCelebration outcome={celebrate} opponent={opponent} />}
    </main>
  );
}

export function Header() {
  return <header><div className="brand-group"><Link className="brand" href="/" aria-label="Top Trumps home"><Crown /><span>TOP TRUMPS</span></Link></div><Link className="header-link" href="/challenges">My challenges</Link></header>;
}
