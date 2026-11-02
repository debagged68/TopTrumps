# File-based card content

Run `python3 scripts/build_content.py` after editing
`docs/DONALD_DECK_CANDIDATES.md`. No packages, credentials or database are needed.
Commit the Markdown and generated JSON together; do not edit JSON directly.
Generation cross-checks six scores against the matrix and rejects duplicate card
numbers, empty quotes and scores outside 1–100.

## Server integration

Load `server/donald.json` only in trusted backend code. It contains hidden scores,
reveal explanations and full editorial records. Never place it in a public/static
directory, import it into a browser bundle or return the entire object in an API.
This public GitHub repository contains scores; this design prevents accidental
in-game disclosure, not deliberate source lookup.

Before commitment, explicitly allowlist only the player's dealt card ID, label,
quote, speaker and approved date/context/artwork. Do not spread the source object:
attribution notes and Markdown can include score hints. Keep the opponent and
scores on the server until resolution. No game server is implemented yet.

## Editorial and version rules

The entire export is draft. Candidate does not mean verified or published.
HOLD cards must never be dealt; all other cards also need editorial approval for
production. This export does not implement a publish action.
Current holds: #11, #19, #27, #36, #40, #41, #42 and #44.

Stable IDs use deck slug and card number; never renumber existing cards.
The document version identifies the content snapshot. A future game server must
pin quote and score snapshots when dealing, so deployment cannot change an active
round. Missing rationales remain missing rather than being invented.

Optional SQL export remains available with `python3 scripts/build_seed.py`.
Both exporters use the single shared parser in `scripts/card_content.py`.
