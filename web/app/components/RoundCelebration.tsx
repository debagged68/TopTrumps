import type {CSSProperties} from 'react';
import {Crown} from 'lucide-react';

export default function RoundCelebration({outcome}:{outcome:'win'|'loss'|'draw'}){
  const colors=outcome==='win'?['#f5d76e','#69e6a8','#8dcaff','#ff87bb','#fff7d5']:['#ff715b','#f2a467','#d95148','#ffc77e'];
  return <div className={'round-celebration '+outcome} aria-hidden="true">
    {outcome!=='draw'&&Array.from({length:outcome==='win'?70:38},(_,i)=><i className={outcome==='win'?'confetti':'ember'} key={i} style={{'--x':((i*37)%100)+'%','--delay':(outcome==='win'?-(i%19)*.08:(i%9)*.06)+'s','--duration':(2+(i%5)*.13)+'s','--drift':((i*23)%160-80)+'px','--spin':(180+(i*53)%540)+'deg','--color':colors[i%colors.length]} as CSSProperties}/>)}
    {outcome==='loss'&&<><span className="loss-wave"/><span className="loss-wave second"/></>}
    <div className="celebration-message"><div className="celebration-crown"><Crown size={76}/></div><strong>{outcome==='win'?'You win!':outcome==='loss'?'Round lost':'Honours even'}</strong><span>{outcome==='win'?'A sinfully good choice.':outcome==='loss'?'The computer takes this one.':'A draw. The deck keeps its secrets.'}</span></div>
  </div>;
}
