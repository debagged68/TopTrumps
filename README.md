# Top Trumps

A political quote card game for mobile browsers. Choose packs, draw two cards, and play one card with a hidden sin against the computer or a friend. Swipe between readable cards, flip to inspect scores, enlarge to read, or compare both cards.

**Status:** computer play and asynchronous friend challenges are implemented under `web/` for AWS Amplify. Friend play requires `TOPTRUMPS_CHALLENGES=1` and the existing challenge storage/signing configuration. Donald is included; other packs remain visible and locked, with purchases not yet connected.

Start with [TWO_CARD_EXPERIENCE.md](docs/TWO_CARD_EXPERIENCE.md) for the current flow, storage compatibility, sharing and verification. [ASYNC_CHALLENGES.md](docs/ASYNC_CHALLENGES.md) remains a historical architecture handoff; its one-card, two-hint and live-only rematch rules are superseded.

See [the complete product requirements](docs/REQUIREMENTS.md) for gameplay, channel journeys, commerce, account linking, administration, technical boundaries and acceptance criteria.

The game is named Top Trumps. Use original card artwork and assets.

## Card content — no database required

The default content workflow is Markdown → generated JSON → game server.
Edit `docs/DONALD_DECK_CANDIDATES.md`, then run:

    python3 scripts/build_content.py

Commit the Markdown and generated `content/server/donald.json` together.
The JSON includes card text, attribution, context, source links, editorial notes,
six scores and available rationales. Stable IDs use the deck slug and card number;
do not renumber existing cards. Both JSON and optional SQL exports use
`scripts/card_content.py` as their single shared Markdown parser.

See [content handling instructions](content/README.md). Supabase is optional;
its migration and SQL export remain available for a future database workflow.

## Independent development handoff

Start with [DEVELOPER_HANDOFF.md](docs/DEVELOPER_HANDOFF.md), [SOLUTION_DESIGN.md](docs/SOLUTION_DESIGN.md) and [GAME_FLOWS.md](docs/GAME_FLOWS.md). Original artwork is committed at [assets/artwork/donald-portrait.png](assets/artwork/donald-portrait.png), with its specification in [ARTWORK.md](docs/ARTWORK.md). The current runnable UI/API/storage/tests are under `web/`. `reference/prototype/` is a historical Site snapshot, not a second maintained game engine.

Player scores are now visible on their flipped reverses before play. The computer's illustrated quote front arrives on top of the player's card; the user's explicit flip reveals its sins, scores and result. Both deal modes use the same server rules.

## Run the standalone web version

```bash
cd web
npm ci
TOPTRUMPS_LOCAL_STATE=1 npm run dev
```

Deploy to AWS Amplify using [AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md). The root `amplify.yml` builds `web/`; `infra/toptrumps-state.yaml` provisions DynamoDB round storage and the SSR compute role. `scripts/deploy-aws.sh` configures a new GitHub-connected Amplify app and reports its live URL after a successful build.

`web/` is the authoritative runnable implementation. `reference/prototype/` remains a historical snapshot of the earlier ChatGPT Site and must not become a second maintained game engine. Current server rules live only in `web/lib/game.mjs`; web and future adapters reuse them. No accounts or ChatGPT login are required on the intended AWS deployment.
