'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Crown,RotateCcw,Send,Shuffle,X} from 'lucide-react';
import {emptyTally,parseTally,recordResult} from '../lib/tally.mjs';
import Link from 'next/link';
import { PACKS } from '../lib/packs';
import RoundCelebration from './components/RoundCelebration';
import SinBadge,{SIN_NAMES} from './components/SinBadge';
const TALLY_KEY='toptrumps-tally-v1';

export default function HomeGame({challenges=false}:{challenges?:boolean}){
  const [game,setGame]=useState<any>(null);
  const [flipped,setFlipped]=useState<string[]>([]);
  const [activeCard,setActiveCard]=useState('');
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [help,setHelp]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [tally,setTally]=useState(emptyTally);
  const tallyRef=useRef(emptyTally());
  const [celebration,setCelebration]=useState<'win'|'loss'|'draw'|null>(null);
  const rail=useRef<HTMLDivElement>(null);
  const cardNodes=useRef<Record<string,HTMLDivElement|null>>({});
  const pending=useRef(false);
  useEffect(()=>{
    const restore=()=>{try{const raw=localStorage.getItem(TALLY_KEY);if(raw)tallyRef.current=parseTally(raw);}catch{}setTally(tallyRef.current);};
    restore();
    const changed=(event:StorageEvent)=>{if(event.key===TALLY_KEY)restore();};
    window.addEventListener('storage',changed);
    return()=>window.removeEventListener('storage',changed);
  },[]);
  useEffect(()=>{
    if(!game?.done)return;
    let current=tallyRef.current;
    try{const raw=localStorage.getItem(TALLY_KEY);if(raw)current=parseTally(raw);}catch{}
    const id=game.roundId||['legacy',game.played.id,game.opponent.id,game.result.category,game.contentVersion].join(':');
    const next=recordResult(current,id,game.result.outcome);
    tallyRef.current=next;setTally(next);
    if(next===current)return;
    try{localStorage.setItem(TALLY_KEY,JSON.stringify(next));}catch{}
    setCelebration(game.result.outcome==='You win'?'win':game.result.outcome==='Computer wins'?'loss':'draw');
  },[game?.done,game?.roundId]);
  useEffect(()=>{
    if(!celebration)return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer=window.setTimeout(()=>setCelebration(null),reduced?1200:celebration==='draw'?1800:3000);
    return()=>window.clearTimeout(timer);
  },[celebration]);
  useEffect(()=>{
    const media=window.matchMedia('(max-width:1100px)');
    const update=()=>setMobile(media.matches);
    update();media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    fetch('/api/game').then(async response=>{
      const data=await response.json();if(!response.ok)throw Error(data.error);
      setGame(data);setActiveCard(data?.committed?'computer':data?.cards[0]?.id||'');
      if(data?.done){setFlipped([data.playedCardId,'computer']);setActiveCard(data.playedCardId);}
    }).catch(()=>setError('Could not restore your round. Please try again.')).finally(()=>setReady(true));
  },[]);
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      const node=rail.current;
      if(node)node.scrollTo({left:Math.max(0,(node.scrollWidth-node.clientWidth)/2),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
    return()=>cancelAnimationFrame(frame);
  },[game?.committed,game?.done,mobile]);
  async function act(input:any){
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{
      const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      const data=await response.json();if(!response.ok)throw Error(data.error);
      setGame(data);
      if(input.action==='deal'){setFlipped([]);setActiveCard(data.cards[0].id);setCelebration(null);}
      if(input.action==='play'){setFlipped([]);setActiveCard('computer');}
      if(input.action==='reveal'){setFlipped([data.playedCardId,'computer']);setActiveCard(data.playedCardId);}
      if(input.action==='cancel'){setFlipped([]);setActiveCard('');setCelebration(null);}
    }catch(e){setError((e as Error).message);}
    finally{pending.current=false;setBusy(false);}
  }
  function turn(key:string){
    if(busy)return;
    setActiveCard(key);
    cardNodes.current[key]?.scrollIntoView({block:'nearest',inline:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    if(key==='computer'&&!game.done){void act({action:'reveal'});return;}
    setFlipped(ids=>ids.includes(key)?ids.filter(id=>id!==key):[...ids,key]);
  }
  const cards=game?(game.committed?[
    {key:game.playedCardId,card:game.played,label:'YOUR CARD'},
    {key:'computer',card:game.opponent||game.opponentFront,label:'COMPUTER'}
  ]:game.cards.map((card:any,index:number)=>({key:card.id,card,label:game.cards.length===1?'YOUR CARD':('YOUR CARD '+(index===0?'A':'B'))}))):[];
  const selected=cards.find((item:any)=>item.key===activeCard)||cards[0];
  function corner(key:string,isBack:boolean){return <button className="fold-corner" aria-label={isBack?'Turn card to quote':'Turn card to sins'} onClick={()=>turn(key)} disabled={busy}><RotateCcw size={15}/></button>;}
  function cardView(item:any){
    const {card:c,key,label}=item;
    const isBack=flipped.includes(key);
    const canPlay=!game.committed;
    return <div key={key} ref={node=>{cardNodes.current[key]=node;}} className={'card-slot '+(selected?.key===key?'is-active':'')}>
      <div className="flip-shell" role="group" tabIndex={0} aria-label={label+'. '+(isBack?'Scores':'Quote')+' side. Press Enter or tap to turn over.'} aria-busy={busy}
        onFocus={()=>{setActiveCard(key);cardNodes.current[key]?.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});}}
        onClick={event=>{if(!(event.target as HTMLElement).closest('button,a')&&!window.getSelection()?.toString())turn(key);}}
        onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();turn(key);}}}>
        <div className={'flip-inner '+(isBack?'is-flipped':'')}>
          <article className="playing-card quote-front" aria-hidden={isBack} inert={isBack}>
            <div className="card-top"><span>{label}</span>{canPlay&&cards.length>1&&game.mode==='second'&&selected?.key===key?<span>SELECTED</span>:<Crown size={17}/>}<span>{c.label.replace('Donald ','')}</span></div>
            <div className="portrait"><img src="/trump-art.png" alt="Satirical portrait of Donald Trump with a floating crown" draggable={false}/></div>
            <blockquote className="quote" tabIndex={isBack?-1:0} aria-label="Complete quote"><p>“{c.front}”</p><cite>Donald Trump</cite></blockquote>
            {corner(key,false)}
          </article>
          <article className="playing-card score-back" aria-hidden={!isBack} inert={!isBack}>
            <div className="card-top"><span>{label}</span>{canPlay&&cards.length>1&&game.mode==='second'&&selected?.key===key?<span>SELECTED</span>:<Crown size={17}/>}<span>{c.label.replace('Donald ','')}</span></div>
            <div className="back-heading"><h2>{canPlay&&game.mode==='first'?'Choose your sin':'Sins & scores'}</h2><p>{canPlay?(game.mode==='first'?'Tap a row to play. Higher score wins.':'The computer locked one of two sins. Higher score wins.'):!game.done?'Awaiting the computer’s reveal.':game.result?.outcome==='Draw'?'Equal scores. Round drawn.':'The winning sin is marked in green.'}</p></div>
            <div className="sin-rows">{game.categories.map((sin:string)=>{
              const deciding=game.done&&game.result.category===sin;
              const winner=deciding&&(key==='computer'?game.result.outcome==='Computer wins':game.result.outcome==='You win');
              const contents=<><span className="sin-description"><SinBadge name={sin}/>{deciding&&<small>{winner&&<Check size={12}/>}{winner?'Winner':game.result.outcome==='Draw'?'Draw':'Played sin'}</small>}</span><strong>{c.scores?.[sin]??'—'}</strong>{canPlay&&game.mode==='first'&&<ArrowRight size={18}/>}{winner&&<Check size={18}/>}</>;
              return canPlay&&game.mode==='first'?<button className="sin-score" key={sin} disabled={busy} onClick={()=>act({action:'play',card:c.id,category:sin})} aria-label={'Play '+sin+', score '+c.scores[sin]}>{contents}</button>:<div className={'sin-score '+(deciding?'deciding ':'')+(winner?'winning':'')} key={sin}>{contents}</div>;
            })}</div>
            {game.done&&c.links?.[0]&&<a className="source-link" href={c.links[0][1]} target="_blank" rel="noreferrer">Quote source ↗</a>}
            {corner(key,true)}
          </article>
        </div>
      </div>
    </div>;
  }
  return <main className={game?'game-screen':'home-screen'}>
    <header><div className="brand-group"><a className="brand" href="/" aria-label="Top Trumps home"><Crown/><span>TOP TRUMPS</span></a><div className="tally" aria-label="Win tally on this browser" aria-live="polite"><span aria-label={'Your wins: '+tally.wins}><strong>{tally.wins}</strong><small>You</small></span><span aria-label={'Computer wins: '+tally.losses}><strong>{tally.losses}</strong><small>Computer</small></span><span aria-label={'Draws: '+tally.draws}><strong>{tally.draws}</strong><small>Draws</small></span></div></div><button className="help-button" aria-label="How to play" onClick={()=>setHelp(true)}><span className="help-label">How to play</span><span className="help-symbol" aria-hidden="true">?</span></button></header>
    {!game?<section className="welcome">
      <div className="intro"><h1>Big words.<br/>Bigger sins.</h1><p className="lede">Turn the card. Choose your sin.<br/>Let the baize decide.</p><div className="deal-options">
        <button disabled={busy||!ready} onClick={()=>act({action:'deal',mode:'first'})}><span>Deal first<small>You choose the sin</small></span><ArrowRight/></button>
        <button className="secondary" disabled={busy||!ready} onClick={()=>act({action:'deal',mode:'second'})}><span>Deal second<small>The computer chooses</small></span><Shuffle/></button>
      </div>{challenges&&<div className="friend-options"><Link className="button-link" href="/challenges/new"><span>Challenge a friend<small>Send a card by WhatsApp, text or email</small></span><Send/></Link><Link className="text-link" href="/challenges">My challenges</Link></div>}<ul className="pack-chips" aria-label="Card packs">{PACKS.filter(p=>p.id!=='donald-extended').map(p=><li key={p.id} className={p.owned?'on':''}>{p.short}{!p.owned&&<small>Soon</small>}</li>)}</ul><Link className="packs-link" href="/packs"><span>Card packs<small>Buy more packs for your deck</small></span><ArrowRight/></Link></div>
      <div className="cover"><img src="/trump-art.png" alt="Top Trumps artwork"/><div><Crown/><h2>Top Trumps</h2><p>SIX SINS. ONE WINNING CHOICE.</p></div></div>
    </section>:<>
      <section className={'card-stage '+(game.done?'spread':game.committed?'stacked':cards.length>1?'hand-pair':'single')} aria-label="Playing cards">
        <div className="card-rail" ref={rail}><div className="card-layout">{cards.map(cardView)}</div></div>
        {game.done&&<p className="sr-only" role="status">{game.result.outcome}. {game.result.category}: you {game.result.yours}, computer {game.result.theirs}.</p>}
      </section>
      <div className={'bottom-actions '+(!game.committed&&game.mode==='second'?'challenge-actions':'')}>
        {game.done?<button onClick={()=>act({action:'deal',mode:game.mode})} disabled={busy}><RotateCcw size={18}/>Play again</button>:!game.committed&&game.mode==='second'?<button className="play-mine" onClick={()=>act({action:'play',card:selected.card.id})} disabled={busy} aria-label={'Play your card. The computer locked '+game.hints.join(' or ')+'.'}><ArrowRight size={18}/><span>Play my card<small>Computer locked {game.hints[0]} or {game.hints[1]}</small></span></button>:null}
        <button className="secondary" disabled={busy} onClick={()=>act({action:'cancel'})}><X size={18}/>Cancel</button>
      </div>
    </>}
    {(busy||error)&&<div className={'notice '+(error?'error':'')} role={error?'alert':'status'}>{error||'Please wait…'}</div>}
    {celebration&&<RoundCelebration outcome={celebration}/>}
    {help&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="help-title" className="modal"><button className="close" aria-label="Close instructions" onClick={()=>setHelp(false)}><X/></button><p className="eyebrow">THE RULES</p><h2 id="help-title">Turn the cards.</h2><p>Tap either side of a card, or its folded corner, to flip it. The computer deals onto your card, slightly offset. Revealing it spreads both cards side by side at the same size, with your left card on top so both score columns remain visible. Tap either card to bring it forward; on a narrow phone you can also slide across the pair.</p><div className="sin-legend" aria-label="The six sin symbols">{(game?.categories||SIN_NAMES).map((sin:string)=><SinBadge key={sin} name={sin}/>)}</div><h3>Deal first</h3><p>Turn your card and tap a sin to play it. The computer’s card arrives with its quote showing. Tap to reveal its scores. The winning sin on the winning card is green.</p><h3>Deal second</h3><p>The computer locks one of its top two sins. The two possible sins are shown under Play my card. Turn your card to check your scores, then press Play my card. Tap the computer’s card to reveal which sin it chose.</p><p>Higher score wins. Equal scores draw. The tally beside the logo counts your wins, computer wins and draws on this browser, including after a refresh. Each round is counted once. Play again starts another round in the same mode; Cancel returns to the deal choices.</p><button onClick={()=>setHelp(false)}>Let’s play<ArrowRight size={18}/></button></section></div>}
  </main>;
}
