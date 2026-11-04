# Two-card challenges

Implemented 4 November 2026. This replaces the one-card flow and the live-only rematch rules in ASYNC_CHALLENGES.md. Runnable source remains `web/`; no second game engine is introduced.

## Journey

- Home offers computer play and friend challenges. All four packs are visible. Donald is included; the other packs remain grey and marked Coming soon because payments and their content are not available.
- Two pack slots nominate one card each. The same owned pack can fill both. With Donald alone, two distinct random Donald cards are drawn.
- Ownership colours are consistent across card fronts/reverses, opponent previews, enlarged reading and results: You = warm cream, Computer = pale blue, Friend = pale purple. The three-label colour key sits above play and result screens; text labels remain visible.
- Both modes use one shared card-hand component: horizontal snap scrolling, navigation buttons/dots, card flip, enlarged reading dialog and score comparison table.
- The dealer inspects two cards, selects one and a sin, then confirms the exact card/sin. Selecting a score row alone never submits.
- The responder can inspect the dealer's quote in a collapsible strip, chooses packs, draws two cards, and commits one. No sin hints are exposed. The dealer's sin determines the outcome.
- Once a card is committed, the opponent’s quote front appears fully above your card in an overlapping stack. Left/right swipes, arrow buttons or the exposed card edge bring either card to the front. The hidden sin/scores remain private until the explicit result reveal.
- The result is a single page showing both quotes, the deciding sin and both scores, and a large WIN, LOSE or DRAW verdict. Win confetti and loss embers/waves play once on reveal. Each player independently reveals the same server result; tally awards happen once.
- Take the deal reserves one next challenge, atomically. The first server transaction determines the next dealer. The opponent need not be present and is already seated. Both players choose their packs before their new hands are drawn.

## Rules and storage

`game.mjs` owns card drawing and score comparison. Computer play and human play reuse these primitives. All drawing is server-side. The current entitlement policy accepts only Donald; client-supplied unowned packs are rejected.

New human records have `handVersion: 2`, immutable `senderCards` and `recipientCards`, plus the committed `senderCard`/`recipientCard`. Recipient hands are deferred until an authenticated POST to `/api/challenges/:id/hand`. Rematch hands are deferred for both players. Repeating the draw returns the existing hand. Old records without arrays still expose their original single card, allowing outstanding challenges to finish.

Computer play draws two cards for each side and chooses its response without using the player's hidden sin. When the computer deals, it chooses the strongest sin on its selected card. Both dealing options remain available.

The existing DynamoDB challenge table and transactional operations are reused. No schema migration, new table or IAM operation is required.

## Sharing

The share action follows a saved lock; invitation data and the card image are prepared before the explicit share tap. Native sharing offers a generated PNG containing the actual quote front and text containing the challenge URL. The image contains no sin badges, scores or chosen sin. Unsupported file sharing falls back to quote text and the link. The share caption starts with “YOU HAVE BEEN CHALLENGED”, followed by “Click to play” and the challenge URL; the quote is not repeated beneath the image. A copy-link action remains available.

Invitation metadata now points to `/api/challenges/:id/image`, a card-specific PNG. This intentionally makes the committed quote front publicly readable by unpredictable challenge ID while the challenge is available. The image and metadata never disclose the locked sin, scores, participant credentials or result. Preview requests cannot claim a seat. Cancelled, declined and expired challenges stop serving the card preview.

The user chooses the recipient and sends from the OS/WhatsApp interface. Delivery and image/link presentation are controlled by the target app. Physical iPhone WhatsApp verification remains necessary; browser checks cannot certify that integration. No automated WhatsApp message or paid messaging gateway is added.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build` from `web/`. Run `node scripts/smoke-challenges.mjs <base-url>` against a configured local server for independent-cookie HTTP verification, including rematches, public image rendering, hidden information and origin checks.

Verified in this change: 62 automated tests, TypeScript checks and a production build; independent-cookie HTTP challenge/rematch/image checks; two separate browser processes completing a challenge and rematch; layouts at 320×568, 375×667, 390×844 and 844×390. A stubbed native share API received the prepared PNG plus challenge link. Actual WhatsApp sending and preview presentation on physical iPhones are not certified by these checks.


## Recent-card weighting

One shared server selector weights random draws in computer and friend games. Each identity remembers up to 24 unique card IDs, newest first. The newest eight receive weight 1, the next eight weight 4, the oldest eight weight 8, and cards outside the recent list weight 32. Thus a fresh card is 32 times as likely as any individual card in the newest group, before normalising the whole pool. All weights remain positive, and each hand/round still uses distinct cards.

Computer history lives alongside its session’s round. Cancelling closes the round immediately via `roundExpiresAt` while preserving history until the existing 24-hour TTL expires; old rows without that field still work. Friend history is per guest in a versioned `GUEST#id / RECENT` record, retained for the existing guest inactivity period. Friend draws/history and reveal/history are saved atomically. Refreshes, retries and repeated reveals never record extra deals. History is private server data and does not appear in game responses. Computer sessions and friend guest profiles retain separate histories, using the same selection algorithm. No new table or IAM operation is required.
