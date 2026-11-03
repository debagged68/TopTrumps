'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, KeyRound, Send } from 'lucide-react';
import { api, daysLeft, STATUS_TEXT } from '../../lib/challenge-client';
import { copyText } from '../../lib/share';
import { Header } from './ChallengeRoom';

const GROUPS: [string, (c: any) => boolean][] = [
  ['Needs you', c => ['your_turn', 'result_ready'].includes(c.status)],
  ['Waiting', c => ['awaiting_reply', 'accepted', 'draft'].includes(c.status)],
  ['Finished', c => ['completed', 'cancelled', 'declined', 'expired'].includes(c.status)],
];

export default function MyChallenges() {
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [recovered, setRecovered] = useState('');
  const [saved, setSaved] = useState('');

  async function load() {
    const r = await api('GET', '/api/challenges');
    if (r.ok) { setData(r.data); setState('ready'); }
    else setState(r.status === 404 ? 'none' : 'error');
  }

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1)).get('access');
    if (hash) { setRecovered(hash); history.replaceState(null, '', window.location.pathname); setState('none'); return; }
    void load();
  }, []);

  async function recover() {
    const r = await api('POST', '/api/guests/recover', { access: recovered });
    if (!r.ok) { setMessage('This private access link is not valid or has expired.'); return; }
    setRecovered(''); setMessage(''); void load();
  }

  async function saveLink() {
    const r = await api('GET', '/api/guests/recovery-link');
    if (!r.ok) { setMessage(r.data.error); return; }
    const url = new URL(r.data.path, window.location.origin).toString();
    setSaved(url);
    setMessage((await copyText(url)) ? 'Private access link copied. Keep it to yourself.' : 'Copy the link below and keep it private.');
  }

  const totals = data?.totals;
  return <main className="challenge-page"><Header />
    <section className="challenge-panel">
      <p className="eyebrow">FRIEND CHALLENGES</p>
      <h1>My challenges</h1>
      {totals && <p className="tally-line" aria-label="Friend challenge totals"><strong>{totals.wins}</strong> You · <strong>{totals.losses}</strong> Opponents · <strong>{totals.draws}</strong> Draws</p>}
      <Link className="button-link" href="/challenges/new"><Send size={18} />New challenge</Link>
    </section>

    {recovered && <section className="challenge-panel">
      <h2>Restore your challenges?</h2>
      <p>This private access link restores the challenges and totals from another browser. It replaces nothing here unless you confirm.</p>
      <button onClick={recover}><KeyRound size={18} />Restore on this browser</button>
    </section>}

    {state === 'loading' && <section className="challenge-panel"><p>Loading…</p></section>}
    {state === 'none' && !recovered && <section className="challenge-panel"><p>No challenges on this browser yet. If you used another browser or app, open your private access link here.</p></section>}
    {state === 'error' && <section className="challenge-panel"><p role="alert">Could not load your challenges. <button className="secondary" onClick={load}>Try again</button></p></section>}

    {state === 'ready' && (data.challenges.length === 0
      ? <section className="challenge-panel"><p>Nothing yet. Start a challenge and send it to a friend.</p></section>
      : GROUPS.map(([title, test]) => {
        const rows = data.challenges.filter(test);
        return rows.length > 0 && <section className="challenge-panel" key={title}><h2>{title}</h2>
          <ul className="challenge-list">{rows.map((c: any) => <li key={c.id}>
            <Link href={`/challenges/${c.id}`}>
              <span><strong>{c.role === 'sender' ? `To ${c.opponentName ?? 'a friend'}` : `From ${c.opponentName}`}</strong>
                <small>{STATUS_TEXT[c.status] ?? c.status}{c.outcome ? ` · ${c.outcome === 'win' ? 'You won' : c.outcome === 'loss' ? 'You lost' : 'Draw'}` : ''}{c.deadline ? ` · ${daysLeft(c.deadline)}` : ''}</small></span>
            </Link></li>)}</ul></section>;
      }))}

    {state === 'ready' && <section className="challenge-panel">
      <h2>Use another browser?</h2>
      <p className="muted">Save a private access link to get your challenges back on another device. Anyone who has it can restore your history, so don’t share it in an invitation.</p>
      <button className="secondary" onClick={saveLink}><Copy size={16} />Save private access link</button>
      {saved && <input readOnly value={saved} aria-label="Private access link" onFocus={e => e.currentTarget.select()} />}
    </section>}
    {message && <div className="notice" role="status">{message}</div>}
  </main>;
}
