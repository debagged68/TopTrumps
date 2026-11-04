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

The implemented covers use `assets/artwork/packs/<pack-id>.webp`; IDs and runtime image URLs come from `web/lib/packs.mjs`. `npm run prepare:content` copies these to `web/public/packs/`. The original briefs below informed the finished covers; the implementation and prompts are documented in the following section.

| File | Pack | Brief |
|---|---|---|
| `donald-extended.webp` | The Donald Deck: Extended | A distinct variation on the original: same caricature, a wider scene with more gilded cards and a grander stage. |
| `westminster.webp` | The Westminster Pack | The Palace of Westminster by the Thames at dusk, shown as a ruined grand theatre set. The Elizabeth Tower (Big Ben) is cracked and leaning, its clock face split with the hands hanging loose, stone falling into the river. Union-flag-coloured bunting torn and flying. A gold crown hangs over the tower with gilded playing cards swirling in the sky. No real people. |
| `unreality-tv.webp` | Un-Reality TV | A dazzling reality-TV studio that is falling apart. A huge gilded TV set stands in a spotlit arena with a cracked screen, snapped cameras on cranes, a ring of ring-lights and a vermilion curtain half torn down, confetti and gold cards raining over a podium with a toppled trophy. A gold crown floats over the stage. No real people, no logos. |

Generic caricature figures can be added later for either pack, but avoid recognisable real individuals unless the quote cards for that pack depict them, so the art and the licensing story stay consistent with REQUIREMENTS.md.

## Implemented pack covers — 4 November 2026

Matching colour artwork is now committed as optimised 768 × 1152 WebP assets:

- `assets/artwork/packs/donald.webp`: web cover derived from the existing original Donald portrait.
- `assets/artwork/packs/donald-extended.webp`: new throne-and-theatre illustration.
- `assets/artwork/packs/westminster.webp`: new crumbling Westminster illustration.
- `assets/artwork/packs/unreality-tv.webp`: new shattered television studio illustration.

The three new originals were created with built-in image generation. Existing-art searches located the Donald portrait and earlier concept board, but no finished covers for these three packs. New output used the established briefs and house style. Pack names remain HTML text, not part of the images. The shared pack catalogue supplies each image URL; preparation copies the committed assets to `web/public/packs/` and verifies every catalogue image exists. Home, new-challenge selection and the packs page use the same images. Unowned artwork uses CSS `grayscale(1)`; owning a pack removes the filter automatically without replacing the colour source. Ownership, availability and checkout rules are unchanged.

### Generation prompts

Common prefix for each new illustration:

> Use case: stylized-concept. Asset type: portrait card-pack cover illustration, 2:3 vertical. Match a luxury satirical tarot series: ornate engraved editorial illustration mixed with rich hand-painted texture, midnight navy, antique gold, ivory and vermilion, warm theatrical lighting, intricate etching, floating gilded playing cards and a prominent gold crown. Strong central silhouette readable as a small mobile pack tile. No typography, no text, no logos, no card border, no watermarks.

Donald Extended subject:

> Subject: a recognisable satirical Donald Trump caricature on a grand gold throne, navy suit, red tie, gold sweeping hair and theatrical imperious expression. Wider scene than a close portrait: extravagant velvet curtain stage, classical columns, floating gilded cards swirling around the throne and a hovering crown. Original art for The Donald Deck: Extended, visually distinct from a close-up hand-forward portrait.

Westminster subject:

> Subject: Palace of Westminster by the Thames at dusk as a ruined grand theatre set. Elizabeth Tower is cracked and slightly leaning, its clock face split, stone falling toward the water. Torn red, ivory and navy bunting flies. A gold crown hangs prominently above the tower with gilded cards swirling in the navy sky. No real people.

Un-Reality TV subject:

> Subject: dazzling reality television studio falling apart: huge ornate gilded television with a cracked dark screen at centre, spotlit arena, broken camera cranes, ring lights, torn vermilion curtains, a toppled gold trophy on a podium. Gold confetti and gilded playing cards rain around it; a gold crown floats over the stage. No real people or logos.
