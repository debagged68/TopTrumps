import Link from 'next/link';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ArrowRight, Crown } from 'lucide-react';
import { PACKS } from '../../lib/packs';
import BuyButton from './BuyButton';

export const metadata = { title: 'Card packs — Top Trumps', description: 'Extend your Top Trumps deck with more cards.' };

// The Donald portrait is always there; other packs show their art once the file exists.
function artFor(id: string) {
  if (id === 'donald') return '/trump-art.png';
  if (existsSync(join(process.cwd(), 'public', 'packs', `${id}.png`))) return `/packs/${id}.png`;
  return id === 'donald-extended' ? '/trump-art.png' : null;
}

export default function Page() {
  return <main className="challenge-page">
    <header><div className="brand-group"><Link className="brand" href="/" aria-label="Top Trumps home"><Crown /><span>TOP TRUMPS</span></Link></div><Link className="header-link" href="/">Home</Link></header>
    <section className="challenge-panel">
      <p className="eyebrow">CARD PACKS</p>
      <h1>Extend your deck</h1>
      <p>More cards mean more rounds and harder choices. Packs you own are used in the computer game and in friend challenges.</p>
    </section>
    {PACKS.map(p => <section key={p.id} className="challenge-panel pack">
      {artFor(p.id) && <img className="pack-art" src={artFor(p.id)!} alt="" loading="lazy" />}
      <h2>{p.name}</h2>
      <p>{p.blurb}</p>
      <p className="muted">{p.cards ? `${p.cards} cards` : 'Card count to be announced'}</p>
      {p.owned ? <p className="pack-owned">Included, you already have this</p> : <BuyButton name={p.name} available={p.available} />}
    </section>)}
    <section className="challenge-panel">
      <Link className="button-link" href="/">Back to the game<ArrowRight size={18} /></Link>
    </section>
  </main>;
}
