# The Seven Deadly Spins

A political quote card game for the web and WhatsApp. Choose one of two quote cards, select a deadly sin without seeing its score, then discover whether you beat the computer. Twist Again deals a new round.

**Status:** requirements only; no application or payment integration has been implemented.

See [the complete product requirements](docs/REQUIREMENTS.md) for gameplay, channel journeys, commerce, account linking, administration, technical boundaries and acceptance criteria.

Working title; final name and branding remain to be confirmed. This is an original game inspired by attribute-comparison card games; it must not use Top Trumps branding or copied assets.

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
