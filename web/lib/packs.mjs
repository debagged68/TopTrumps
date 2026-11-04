// Shared catalogue. Ownership stays server controlled until checkout is connected.
export const PACKS = [
  {
    id: "donald",
    name: "The Donald Deck",
    short: "Donald",
    blurb: "The original 48 quote cards, scored across the six sins.",
    cards: 48,
    owned: true,
    available: true,
  },
  {
    id: "donald-extended",
    name: "The Donald Deck: Extended",
    short: "Donald Extended",
    blurb:
      "More quotes and more sins to fight over. Mixes straight into your existing deck.",
    cards: null,
    available: false,
  },
  {
    id: "westminster",
    name: "The Westminster Pack",
    short: "Westminster",
    blurb:
      "Quotes from the corridors of Westminster, scored across the same six sins.",
    cards: null,
    available: false,
  },
  {
    id: "unreality-tv",
    name: "Un-Reality TV",
    short: "Un-Reality TV",
    blurb:
      "Reality television at its most shameless, scored across the same six sins.",
    cards: null,
    available: false,
  },
];
