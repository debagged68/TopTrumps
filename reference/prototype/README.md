# Prototype source reference

Snapshot of private Site source commit `4e65137de34f73f4de82097f2939488e9533d170` (2 November 2026).
This is the current card-flip/manual-house-reveal implementation.

Included: React page, layout and styles; server game route; D1 schema/migration; TypeScript configuration; package metadata and game tests. Original artwork is in `../../assets/artwork/donald-portrait.png`. Canonical generated content is `../../content/server/donald.json`.

These are reference files, **not a full runnable Sites/Vinext checkout**. The original package metadata documents versions; its scripts reference the original hosting scaffold, which is not copied here. Do not expect `npm run dev` in this directory to work without integrating into a scaffold.

To code independently:
1. Scaffold the desired React application/backend using your host's current setup.
2. Port `app/page.tsx`, `app/layout.tsx` and `app/globals.css`; install React and lucide-react. The CSS requests Cormorant Garamond and DM Sans with local font fallbacks.
3. Copy the canonical JSON to the new application's `data/donald.json` during preparation; never maintain it as a second editorial source. Copy the artwork to its `public/trump-art.png`.
4. Adapt `app/api/game/route.ts` to the host's route convention and storage. It currently imports `cloudflare:workers` and uses D1 `DB`; equivalent transaction-safe storage can replace this. Do not import the complete JSON into client code.
5. Apply the provided rounds table migration if using D1, otherwise create the equivalent schema.
6. Port and run `tests/game.mjs` (requires TypeScript as a development dependency and the expected route/data paths) and the acceptance checks in the design documents.

Known limitations and production gaps are explicit in [SOLUTION_DESIGN.md](../../docs/SOLUTION_DESIGN.md); the prototype must not be treated as a completed production game. No credentials or private Site hosting manifest are included.
