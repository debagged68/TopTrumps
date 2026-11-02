'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Crown,RotateCcw,Shuffle,X} from 'lucide-react';

export default function Home(){
  const [game,setGame]=useState<any>(null);
  const [flipped,setFlipped]=useState<string[]>([]);
  const [activeCard,setActiveCard]=useState('');
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [help,setHelp]=useState(false);
  const [mobile,setMobile]=useState(false);
  const pending=useRef(false);
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
    }).catch(()=>setError('Could not restore your round. Please try again.')).finally(()=>setReady(true));
  },[]);
  async function act(input:any){
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{
      const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input.action==='deal'?{...input,playerCardCount:mobile?1:2}:input)});
      const data=await response.json();if(!response.ok)throw Error(data.error);
      setGame(data);
      if(input.action==='deal'){setFlipped([]);setActiveCard(data.cards[0].id);}
      if(input.action==='play'){setFlipped([]);setActiveCard('computer');}
      if(input.action==='reveal')setFlipped(ids=>[...ids.filter(id=>id!=='computer'),'computer']);
      if(input.action==='cancel'){setFlipped([]);setActiveCard('');}
    }catch(e){setError((e as Error).message);}
    finally{pending.current=false;setBusy(false);}
  }
  function turn(key:string){
    if(busy)return;
    setActiveCard(key);
    if(key==='computer'&&!game.done){void act({action:'reveal'});return;}
    setFlipped(ids=>ids.includes(key)?ids.filter(id=>id!==key):[...ids,key]);
  }
  const cards=game?(game.committed?[
    {key:game.playedCardId,card:game.played,label:'YOUR CARD'},
    {key:'computer',card:game.opponent||game.opponentFront,label:'COMPUTER'}
  ]:(mobile?game.cards.slice(0,1):game.cards).map((card:any,index:number)=>({key:card.id,card,label:game.cards.length===1||mobile?'YOUR CARD':('YOUR CARD '+(index===0?'A':'B'))}))):[];
  const selected=cards.find((item:any)=>item.key===activeCard)||cards[0];
  const status=game?.done?(game.result.outcome+' · '+game.result.category+' '+game.result.yours+'–'+game.result.theirs):game?.committed?'The computer’s card':game?.mode==='second'?('Computer plays '+game.hints.join(' or ')+' · one is locked'):'You deal first · choose a sin on the reverse';
  function corner(key:string,isBack:boolean){return <button className="fold-corner" aria-label={isBack?'Turn card to quote':'Turn card to sins'} onClick={()=>turn(key)} disabled={busy}><RotateCcw size={15}/></button>;}
  function cardView(item:any){
    const {card:c,key,label}=item;
    const isBack=flipped.includes(key);
    const canPlay=!game.committed;
    return <div key={key} className={'card-slot '+(selected?.key===key?'is-active':'')}>
      <div className="flip-shell" role="group" tabIndex={0} aria-label={label+'. '+(isBack?'Scores':'Quote')+' side. Press Enter or tap to turn over.'} aria-busy={busy}
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
            <div className="back-heading"><h2>{canPlay&&game.mode==='first'?'Choose your sin':'Sins & scores'}</h2><p>{canPlay?(game.mode==='first'?'Tap a row to play. Higher score wins.':'Your scores. Play this card when you’re ready.'):'Higher score wins. The played sin is marked.'}</p></div>
            <div className="sin-rows">{game.categories.map((sin:string)=>{
              const deciding=game.done&&game.result.category===sin;
              const contents=<><span>{sin}{deciding&&<small><Check size={12}/>Played sin</small>}</span><strong>{c.scores?.[sin]??'—'}</strong>{canPlay&&game.mode==='first'&&<ArrowRight size={18}/>}{deciding&&<Check size={18}/>}</>;
              return canPlay&&game.mode==='first'?<button className="sin-score" key={sin} disabled={busy} onClick={()=>act({action:'play',card:c.id,category:sin})} aria-label={'Play '+sin+', score '+c.scores[sin]}>{contents}</button>:<div className={'sin-score '+(deciding?'deciding':'')} key={sin}>{contents}</div>;
            })}</div>
            {game.done&&c.links?.[0]&&<a className="source-link" href={c.links[0][1]} target="_blank" rel="noreferrer">Quote source ↗</a>}
            {corner(key,true)}
          </article>
        </div>
      </div>
    </div>;
  }
  return <main className={game?'game-screen':'home-screen'}>
    <header><a className="brand" href="/" aria-label="Top Trumps home"><Crown/><span>TOP TRUMPS</span></a><button className="help-button" onClick={()=>setHelp(true)}>How to play</button></header>
    {!game?<section className="welcome">
      <div className="intro"><p className="eyebrow">THE DONALD DECK</p><h1>Big words.<br/>Bigger sins.</h1><p className="lede">Turn the card. Choose your sin.<br/>Let the baize decide.</p><div className="deal-options">
        <button disabled={busy||!ready} onClick={()=>act({action:'deal',mode:'first'})}><span>Deal first<small>You choose the sin</small></span><ArrowRight/></button>
        <button className="secondary" disabled={busy||!ready} onClick={()=>act({action:'deal',mode:'second'})}><span>Deal second<small>The computer chooses</small></span><Shuffle/></button>
      </div></div>
      <div className="cover"><img src="/trump-art.png" alt="The Donald deck artwork"/><div><Crown/><h2>Top Trumps</h2><p>SIX SINS. ONE WINNING CHOICE.</p></div></div>
    </section>:<>
      <div className="round-status" role="status"><p>{status}</p>{game.done&&<span className="status-detail">You – Computer</span>}</div>
      {cards.length>1&&<nav className="card-tabs" aria-label="Choose a card">{cards.map((item:any)=><button key={item.key} aria-pressed={selected?.key===item.key} onClick={()=>setActiveCard(item.key)}>{item.label==='COMPUTER'?'Computer':item.label.replace('YOUR CARD','Your card')}{game.done&&<strong>{item.key==='computer'?game.result.theirs:game.result.yours}</strong>}</button>)}</nav>}
      <section className={'card-stage '+(cards.length>1?'two-cards':'')} aria-label="Playing cards">{cards.map(cardView)}</section>
      <div className="bottom-actions">
        {game.done?<button onClick={()=>act({action:'deal',mode:game.mode})} disabled={busy}><RotateCcw size={18}/>Play again</button>:!game.committed&&game.mode==='second'?<button onClick={()=>act({action:'play',card:selected.card.id})} disabled={busy}><ArrowRight size={18}/>{cards.length>1?'Play card '+selected.label.slice(-1):'Play this card'}</button>:<span className="action-note">{game.committed?'Reveal the computer’s scores':'Choose a sin on the reverse'}</span>}
        <button className="secondary" disabled={busy} onClick={()=>act({action:'cancel'})}><X size={18}/>Cancel</button>
      </div>
    </>}
    {(busy||error)&&<div className={'notice '+(error?'error':'')} role={error?'alert':'status'}>{error||'Please wait…'}</div>}
    {help&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="help-title" className="modal"><button className="close" aria-label="Close instructions" onClick={()=>setHelp(false)}><X/></button><p className="eyebrow">THE RULES</p><h2 id="help-title">Turn the cards.</h2><p>Tap anywhere on either side of a card, or its folded corner, to flip it. Use the card tabs to switch between your card and the computer on a phone. Landscape shows both cards together.</p><h3>Deal first</h3><p>Turn your card and tap a sin to play it. The computer’s card arrives with its quote showing. Tap to reveal its scores and the result.</p><h3>Deal second</h3><p>The computer locks one of its top two sins. You see both possible names. Inspect your card, then press Play this card. Tap the computer’s card to reveal its chosen sin.</p><p>Higher score wins. Equal scores draw. Play again starts another round in the same mode; Cancel returns to the deal choices.</p><button onClick={()=>setHelp(false)}>Let’s play<ArrowRight size={18}/></button></section></div>}
  </main>;
}
