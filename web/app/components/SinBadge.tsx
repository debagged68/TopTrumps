import {Brain,Coins,Crown,Eye,Flame,Heart,HelpCircle} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import type {CSSProperties} from 'react';

const SINS:Record<string,{Icon:LucideIcon;ink:string;fill:string}>={
  Pride:{Icon:Crown,ink:'#753d96',fill:'#dec7ec'},
  Greed:{Icon:Coins,ink:'#845500',fill:'#f2d184'},
  Lust:{Icon:Heart,ink:'#ad2452',fill:'#f5c5d5'},
  Envy:{Icon:Eye,ink:'#216c42',fill:'#bde0c9'},
  Wrath:{Icon:Flame,ink:'#aa3719',fill:'#f7c1a1'},
  Stupidity:{Icon:Brain,ink:'#285a97',fill:'#c6daf1'}
};
export const SIN_NAMES=Object.keys(SINS);

export default function SinBadge({name}:{name:string}){
  const {Icon,ink,fill}=SINS[name]||{Icon:HelpCircle,ink:'#344851',fill:'#dae2e5'};
  return <span className="sin-badge" style={{'--sin-ink':ink,'--sin-fill':fill} as CSSProperties}><Icon className="sin-icon" aria-hidden="true"/><span>{name}</span></span>;
}
