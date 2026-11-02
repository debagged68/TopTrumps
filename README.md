# Top Trumps

A political quote card game for the web and WhatsApp. Choose one of two quote cards, flip your cards to inspect their sins and scores, then select a sin or card, then discover whether you beat the computer. Twist Again deals a new round.

**Status:** private mobile web prototype implemented. Accounts, payments and WhatsApp delivery remain deferred.

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

Start with [DEVELOPER_HANDOFF.md](docs/DEVELOPER_HANDOFF.md), [SOLUTION_DESIGN.md](docs/SOLUTION_DESIGN.md) and [GAME_FLOWS.md](docs/GAME_FLOWS.md). Original artwork is committed at [assets/artwork/donald-portrait.png](assets/artwork/donald-portrait.png), with its specification in [ARTWORK.md](docs/ARTWORK.md). The current UI/API/database/test snapshot is under `reference/prototype/`. It is reference source, not a complete installation of the Sites runtime; integration instructions are included.

Player scores are now visible on their flipped reverses before play. The computer's card enters face down and waits for the user's flip before its sins/scores and result appear. Both deal modes use the same server rules.
