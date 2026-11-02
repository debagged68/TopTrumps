# Card content database (Supabase)

Holds The Donald Deck candidate cards: quote text, attribution, reveal description, per-category scores with rationales, and source links.

| Table | Contents |
|---|---|
| `decks` | Deck record and the document version the data was built from |
| `categories` | The six scoring categories and their interpretation |
| `cards` | One row per card: `front_text`, `attribution`, `description`, `setting`, `evidence_type`, `verification_notes`, `release_status`, `status` (`candidate` / `hold`), and the full original `source_markdown` |
| `card_scores` | Six rows per card: `score` (1-100) and `rationale` |
| `card_sources` | One row per source link: `title`, `url`, `role` |

Row level security is on with no policies, so the public API cannot read hidden scores or unpublished drafts. Access is by the service role or direct database connection only.

## Keeping it in sync

`docs/DONALD_DECK_CANDIDATES.md` stays the editorial source of truth. After editing it:

    python3 scripts/build_seed.py      # regenerates supabase/seed.sql, checks scores against the matrix

The seed is idempotent (upserts on deck + card number), so it can be re-applied.

## Applying to a project

    supabase link --project-ref <ref>
    supabase db push                   # applies supabase/migrations
    supabase db query --linked -f supabase/seed.sql

Keep the database password in `.env.local` (git-ignored), never in the repo.

## Status

Cards marked `hold` (11, 19, 27, 36, 40, 41, 42, 44) must be excluded from any dealing logic. All content is draft: wording and sources are unverified where the document says so.
