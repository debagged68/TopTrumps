'use client';
import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';

// Placeholder until payments exist: the button is real, the purchase is not.
export default function BuyButton({ name, available }: { name: string; available: boolean }) {
  const [note, setNote] = useState('');
  return <>
    <button className="buy-pack" onClick={() => setNote(available ? '' : `Purchases aren’t open yet. ${name} will be available here soon.`)}><ShoppingCart size={18} />Buy pack</button>
    {note && <p role="status" className="muted">{note}</p>}
  </>;
}
