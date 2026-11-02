# Developer handoff — current web app and asynchronous challenges

The repository contains the runnable computer game, editorial content, original artwork, current card design and a specification for adding asynchronous human challenges. A developer must be able to implement this work without the private Site or this conversation.

## Read in this order

1. [ASYNC_CHALLENGES.md](ASYNC_CHALLENGES.md) — canonical new feature: experience, sender/recipient process, rules, state, sharing, identity, storage, APIs, implementation order and acceptance tests. **Specification only; not implemented.**
2. [web/README.md](../web/README.md) and [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) — current runnable app and deployment setup. Use the actual account/app region; the owner's deployment context is Stockholm, not the historical London example.
3. [REQUIREMENTS.md](REQUIREMENTS.md) — product scope and later owner decisions; the asynchronous specification takes precedence for this feature.
4. [GAME_FLOWS.md](GAME_FLOWS.md) — computer/reference history plus new asynchronous journey.
5. [SOLUTION_DESIGN.md](SOLUTION_DESIGN.md) — architecture history and standalone AWS updates.
6. [ARTWORK.md](ARTWORK.md) — canonical portrait and asset mapping.

## Current implementation to reuse

- Runnable application: `web/`; root `amplify.yml` builds monorepo root `web`.
- Shared server rules and snapshots: `web/lib/game.mjs`; computer transaction service: `web/lib/service.mjs`; DynamoDB adapter: `web/lib/store.mjs`.
- Current card UI: `web/app/page.tsx` and `globals.css`. Extract reusable presentation once for the human route instead of copying a second maintained screen.
- Shared coloured sin names/icons: `web/app/components/SinBadge.tsx`.
- Win/loss effects: `web/app/components/RoundCelebration.tsx`; make human opponent wording configurable.
- Existing browser-local computer tally: `web/lib/tally.mjs`. Keep it separate from the proposed server-backed human totals.
- Canonical editorial Markdown: `docs/DONALD_DECK_CANDIDATES.md`; shared parser: `scripts/card_content.py`; generated server content: `content/server/donald.json`.
- Original artwork: `assets/artwork/donald-portrait.png`. Preparation scripts generate runtime copies; do not maintain another editorial/asset source.
- Current infrastructure: `infra/toptrumps-state.yaml`, with one computer-session table and scoped GetItem/PutItem permissions. Human challenge infrastructure is proposed work, not already present.
- `reference/prototype/` is historical Site/Vinext/D1 reference. Do not implement or maintain a second rules engine there.

## Current visual/rule baseline

Top Trumps / The Donald Deck has six sins: Pride, Greed, Lust, Envy, Wrath and Stupidity. Mobile computer play deals one player card, while desktop retains two. Player reverses expose their own scores before play. Deal first chooses a sin; computer Deal second locks one of its top two sins, shows two possible icon badges and commits through Play for without a player category choice.

Cards use full uncropped artwork and readable quotes, folded-corner/full-surface flips, slim equal-sized shells, an offset arriving opponent card and an overlapping reveal. The local left card starts on top so both score columns can be inspected. Green plus Winner/ticks marks the deciding row of the winning card. Brief win/loss effects clear automatically and honour reduced motion. The computer tally beside the logo survives browser refresh and counts each revealed round once.

These computer features do not constitute a human invitation, shared match, guest recovery or challenge list.

## New work boundaries

Build a saved challenge that can be answered hours/days later, with the sender offline. WhatsApp/SMS only carry user-shared URLs; the game remains in the browser. No live-room assumption, Brevo premium requirement, background message sender, contact import, registration or payment step is required.

The asynchronous specification labels proposed defaults, including selected-sin-plus-decoy human hints and expiry/retention. Do not silently reuse the computer top-two selection for a human sender who can choose any sin. Reuse core selection/comparison primitives; do not duplicate outcome calculations in the client or a new backend path.

Implement and verify atomic claim/respond/reveal, invitation safety, preview-safe links, per-viewer secrecy, stable content snapshots, recovery, deadlines and exactly-once awards before enabling the new entry publicly. Do not replace the existing computer session cookie/record with one shared challenge ID; multiple pending challenges must coexist.

## Developer verification

Run the existing game/tally tests, TypeScript and production build in `web/`. Add the human transition/API/security cases and real DynamoDB concurrency tests specified in the handoff. Record iPhone Safari, WhatsApp/Messages sharing, Android Chrome, keyboard and reduced-motion checks separately from desktop/in-memory tests.

This documentation change ships no human gameplay, message sending, cloud resources or secret configuration.
