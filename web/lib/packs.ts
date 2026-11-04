// Card packs offered on the packs page. Purchases are not wired up yet: `available` stays false
// until the payment flow exists, and the page then shows "Coming soon" instead of a live Buy button.
// Placeholder names and blurbs: edit here, the packs page reads this list.
export type Pack = {
  id: string;
  name: string;
  short: string; // label for the front-page chips
  blurb: string;
  cards: number | null; // null = to be announced
  owned?: boolean;
  available: boolean;
};

export { PACKS } from './packs.mjs';
