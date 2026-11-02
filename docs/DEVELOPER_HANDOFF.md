# Independent development checklist

The GitHub repository contains the authoritative requirements, current interaction flows, solution design, original artwork and a prototype source snapshot. Another developer can work without the private Site or this chat.

Read in this order:

1. [REQUIREMENTS.md](REQUIREMENTS.md) — complete product scope and current disclosure rules.
2. [GAME_FLOWS.md](GAME_FLOWS.md) — exact Deal first / Deal second / manual reveal sequence.
3. [SOLUTION_DESIGN.md](SOLUTION_DESIGN.md) — architecture, API, state model, hosting independence and gaps.
4. [ARTWORK.md](ARTWORK.md) — committed original asset, styling and runtime mapping.
5. [Prototype reference](../reference/prototype/README.md) — current UI/API/database/test source.

## Current owner decisions

- Name: Top Trumps. Deck: The Donald Deck.
- Six categories: Pride, Greed, Lust, Envy, Wrath, Stupidity.
- Card fronts show quotes and artwork. Flip to see the player's own sins and scores before commitment.
- Deal first: select a sin on one reverse. Deal second: computer locks one of its top-two sins, shows only their names, player selects a card after inspection.
- Remove the unused card from the green baize. Preserve the selected card's slot. The computer takes the vacated slot face down.
- The player, not a timer, flips the computer's card. Then reveal its sins/scores, highlight the deciding row and show the result.
- Both physical cards have identical dimensions. Full long quotes remain accessible.
- Mobile web is the first channel. WhatsApp is deferred; no Brevo premium subscription is needed for the web game.
- Markdown → generated JSON is the single content workflow. Never duplicate parsing or game rules between channels.

## Ready for reuse

Original portrait PNG; frontend markup/styles; server route demonstrating both rule modes; D1 schema/migration; 50-round reference tests; original editorial Markdown; shared parser and JSON generator; existing generated card dataset.

## Required before independent public launch

Editorial verification/publication gating, content snapshot pinning, database ownership/expiry/retention, concurrent-deal idempotency, rate limits, durable statistics if promised, real mobile/keyboard accessibility checks and operational recovery. Add accounts/payments/WhatsApp only in their own subsequent scope.

The reference API already returns the computer's scores after the card is committed, while visually holding them behind the manual flip. Implement a separate reveal endpoint if delayed data delivery is required. See the solution design for this deliberate distinction.
