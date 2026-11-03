# Top Trumps — artwork and visual specification

2 November 2026

## Committed original asset

![Original Donald Deck portrait](../assets/artwork/donald-portrait.png)

- File: `assets/artwork/donald-portrait.png`
- Format/dimensions: PNG, 1024 × 1536 pixels, 3,710,897 bytes.
- SHA-256: `8b402ef97ef55013f64615b46a9fc6144153a8859405f97abf15ae4cb142d76e`
- Git blob: `c296b93bc71959c9667c3f8c8487b37816ce6545`
- Origin: original AI-generated illustration created for this project on 2 November 2026. This is the exact raster used by the playable prototype, not a screenshot or an external hotlink.
- Alt text: Original satirical illustration of Donald Trump with a floating crown, gold playing cards and classical architecture.
- Current use: the same decorative portrait on each quote front. It must not vary according to category strength or provide a score hint. Separate per-quote illustrations have not been created.
- Runtime mapping: the reference UI requests `/trump-art.png`; copy this file to the independent application's `public/trump-art.png`, or update that URL.

## Art brief for future matching assets

Vertical collectible political satire illustration. Recognizable Donald Trump caricature with exaggerated pursed lips and sweeping golden hair, navy suit and red tie, theatrical imperious expression, ornate floating gold crown, gilded playing cards and classical architectural fragments. Engraved editorial illustration meets hand-painted luxury tarot. Midnight navy, antique gold, ivory and vermilion, warm dramatic light, fine detail. No embedded text, letters or card border; render readable quote text and the frame in the UI.

## Card construction

| Layer | Current design |
|---|---|
| Baize | Deep green felt `#104c3e`, subtle texture, dark wood rim and gold edge |
| Front | Ivory `#efe3c9`, fine gold double frame `#cda75d`, neutral A/B and card number, portrait, full quote, attribution, Flip action |
| Reverse | Midnight blue `#102531`, gold headings and frame, six full-width sin/score rows |
| House cover | Navy patterned back, crown, Top Trumps / The House wordmark, manual Flip computer's card action |
| Deciding row | Antique gold `#d3b172` with dark text on both reversed cards |
| Typography | Cormorant Garamond for editorial headings/quotes; DM Sans for UI. Provide Georgia/Arial fallbacks or self-host licensed font files |
| Geometry | Equal 640px card-shell height; desktop paired columns, mobile stacked; scroll long quotes inside the fixed front |

The quote text, gold frame, reverse, house cover and baize are code-rendered UI, not additional raster files. Their full source styles and markup are committed under `reference/prototype/app/`. Keep UI text separate from imagery so long quotes stay readable.

The earlier three-phone WhatsApp concept board is a visual inspiration from an earlier stage, not an implemented WhatsApp interface. This handoff's committed PNG and code-rendered cards are the current web design. WhatsApp delivery remains deferred.

## Pack artwork briefs

One portrait per pack, in the same house style as the Donald portrait so the packs read as a set: vertical 1024 × 1536 PNG, engraved editorial illustration meets hand-painted luxury tarot, midnight navy, antique gold, ivory and vermilion, warm dramatic light, fine detail. No embedded text, letters, logos or card border (the UI renders those). The art is decorative and must not hint at scores. Each pack keeps the gold crown and floating gilded playing cards from the Donald portrait, which ties the packs together.

Save each file as `assets/artwork/packs/<pack-id>.png` (ids come from `web/lib/packs.ts`). `npm run prepare:content` copies them to `web/public/packs/`, and the packs page shows each one automatically.

| File | Pack | Brief |
|---|---|---|
| `donald-extended.png` | The Donald Deck: Extended | Optional. Without a file this pack uses the Donald portrait. A variation on the original: same caricature, a wider scene with more gilded cards and a grander stage. |
| `westminster.png` | The Westminster Pack | The Palace of Westminster by the Thames at dusk, shown as a ruined grand theatre set. The Elizabeth Tower (Big Ben) is cracked and leaning, its clock face split with the hands hanging loose, stone falling into the river. Union-flag-coloured bunting torn and flying. A gold crown hangs over the tower with gilded playing cards swirling in the sky. No real people. |
| `unreality-tv.png` | Un-Reality TV | A dazzling reality-TV studio that is falling apart. A huge gilded TV set stands in a spotlit arena with a cracked screen, snapped cameras on cranes, a ring of ring-lights and a vermilion curtain half torn down, confetti and gold cards raining over a podium with a toppled trophy. A gold crown floats over the stage. No real people, no logos. |

Generic caricature figures can be added later for either pack, but avoid recognisable real individuals unless the quote cards for that pack depict them, so the art and the licensing story stay consistent with REQUIREMENTS.md.
