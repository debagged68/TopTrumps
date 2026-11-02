# Top Trumps — Product Requirements

Version 2.1 · 2 November 2026 · Current card-flip web prototype and independent implementation baseline; commerce and WhatsApp are deferred.

Implementation handoff: [solution design](SOLUTION_DESIGN.md), [game flows](GAME_FLOWS.md), [artwork](ARTWORK.md) and [developer checklist](DEVELOPER_HANDOFF.md). The v2 disclosure/manual-reveal requirements supersede earlier blanket hidden-player-score and automatic-flip assumptions.

## 1. Purpose and scope

Create a humorous political quote card game playable on a mobile website and through a one-to-one WhatsApp conversation. The website also presents all decks, prices, previews, secure payments and the player's collection. No installed mobile app is required.

The central challenge is interpreting a genuine political statement: choose one of two cards and nominate a deadly sin, after flipping the player's cards to inspect their own scores. The computer's scores remain hidden until the comparison reveal. The computer's random card is revealed, the selected sin scores are compared, and the player wins, loses or draws. A prominent **Twist Again** action starts the next round.

This document uses MUST for launch requirements, SHOULD for preferred behaviour and LATER for deferred features. Product choices introduced to fill gaps are identified as proposed defaults. They are implementation baselines that can be adjusted before launch, rather than claims that the owner expressly approved every detail.

## 2. Agreed decisions and proposed defaults

| Item | Requirement / status |
|---|---|
| Card content | Authentic political quote or statement, with attribution and context. Agreed. |
| Attributes | Donald Deck: six categories — Pride, Greed, Lust, Envy, Wrath and Stupidity. Greed absorbs Gluttony; Stupidity replaces Sloth. Supersedes the original seven-attribute baseline. |
| Score disclosure | Player flips either card to see its own six scores before commitment. Computer identity/scores stay unavailable before commitment and visually hidden until the user flips its house card. |
| Hand | Two cards; choose one to play. Agreed. |
| Opponent | Random computer card compared on the player's chosen sin. Agreed. |
| Replay | Twist Again starts a fresh round. Agreed. |
| Visuals | Designed card images in WhatsApp; visual cards on the website. Agreed. |
| Commerce | Website shows decks, costs and payments. Agreed. |
| Cross-channel access | One player identity and purchased collection for web and WhatsApp. Baseline from the proposed experience. |
| Scores | Fixed integers from 1–100; higher wins. Proposed default. |
| Format | Independent rounds with running totals; no five-round restriction or restriction on repeating sins. Proposed default reflecting the latest design. |
| Commercial launch | Free starter deck plus one-off paid decks. Prices and free limits configurable, not final. |
| Naming | Top Trumps. Updated by owner decision. |

## 3. Experience by channel

| Capability | Website | WhatsApp |
|---|---|---|
| Discover | Home page, rules, deck catalogue, previews and prices | Welcome message, brief rules, free-play and shop actions |
| View cards | Two readable visual cards; stack on narrow phones | Two separately labelled card images, A and B; concise text equivalents |
| Choose | Flip player cards; Deal first selects a sin on a reverse, Deal second selects a card against a locked computer sin | Future adapter must reproduce the same two modes using supported messages/controls; text fallback |
| Result | Reveal opponent, selected scores, outcome and explanation | Result image plus readable result text and replay button |
| More detail | Reveal all sins, attribution, context and source | Optional Reveal all sins / source response or website link |
| Buy | Deck details and provider-hosted checkout | Shop/buy link opens website checkout; no card details collected in chat |
| Collection | Owned/free decks and Play on web / Play in WhatsApp | Select available decks; locked deck links to its shop page |
| Progress | Wins, losses, draws, rounds and winning streak | Compact summary on request and after results |
| Resume | Resume active round or deliberately abandon it | Resume saved state, including after reopening chat |

The two channels MUST use the same rules, published card versions, identity, entitlements and results. Channel-specific layouts and input handling MUST NOT introduce alternative scoring or payment logic.

## 4. Rules and round lifecycle

### GAME-00: Deal first or second (updated owner decision)

Every new round begins with **Deal first** or **Deal second**.

- **Deal first:** the player receives two cards, selects one and chooses a category. The computer's card is locked before these choices; resolve on the player's selected category.
- **Deal second:** the computer locks its card and chosen category before the player's choice. Show its two highest-scoring category names, without scores, their ranking or which was chosen. The player receives two cards and chooses one; the computer's locked category decides the outcome. The player does not select a category in this mode.
- Prototype default: choose the computer's category randomly from its top two. Break tied category rankings using deck category order; present hints in deck order. These defaults can be tuned after playtesting.
- Both modes share one deal/resolve engine. Higher wins; equal scores draw. Replay offers either mode. This section supersedes older descriptions that assume the player always chooses the category or that no category hint is ever shown.

### GAME-01: Dealing and fairness

The server MUST select three distinct eligible published cards: two for the player and one for the computer. All MUST come from the same selected deck or explicitly selected deck pool. The player MUST have access to every deck in that pool.

The computer card MUST be randomly selected and persisted before the player chooses a card or sin. It MUST NOT be selected or changed in response to that choice, previous losses, payment status or commercial objectives. Use server-side secure randomness. Store the deal and rules/content version so results can be audited. No card may occupy two positions in the same round.

A deck/pool MUST have at least three eligible cards. Avoid repeats between consecutive rounds when the pool permits; cross-round repeats are allowed and do not change scores. This is a memory/interpretation game, not a claim that previously revealed information can be made secret again.

### GAME-02: Choice and commitment

The category-selection steps below apply to Deal first. In Deal second, Play card A/B on the reverse commits against the computer's locked category; the player may inspect their own six scores, while only two category names are disclosed about the computer.

Player fronts show quote, speaker, date/context and artwork. Flipping either or both cards reveals their own six sins and numeric scores. Deal first: tap a sin row on the chosen reverse to commit the card/category immediately. Deal second: inspect either reverse, then tap Play card A/B to commit against the computer's locked category; the player does not choose a sin. Allow free flipping back to quotes before commitment. Never expose the computer's identity, scores or selected category before commitment.

The server MUST atomically validate ownership, round state, card choice and sin, then resolve exactly once. Double taps, retries and duplicate webhooks MUST return the original result without creating additional rounds or statistics. Selecting an already resolved round MUST never permit a different choice.

### GAME-03: Outcome

Compare the two selected-sin integer scores: player greater = win; smaller = loss; equal = draw. After commitment, slide the unused player card off the baize, replace it in the same slot with the face-down computer card, and wait for the user to press Flip computer's card. Only then turn it to its six sins/scores, highlight the deciding row on both reverses and show both selected scores and the outcome. Provide quotes, context and editorial explanation through details. Never invent the outcome with an LLM. Reveal all sins is optional after resolution and shows both complete category-score profiles without altering the outcome.

Track completed rounds, wins, losses, draws, current winning streak and best winning streak. Proposed default: a win increases the streak; a loss or draw resets it. Abandoned or expired rounds do not count as outcomes. Display the streak rule in help.

### GAME-04: Replay and continuity

Twist Again creates one new deal only after the current round resolves. If a quota or entitlement prevents another round, explain the limit and present a free alternative or shop link. Never start a charge automatically.

Maintain at most one active round per player across channels. An incomplete round resumes when switching channels. Starting another requires an explicit abandon action. Proposed default expiry: 24 hours after dealing, with a clear expiry notice and no loss recorded. Concurrent actions use server state/version checks; stale buttons return current status rather than replaying mutations.

## 5. Card content and editorial requirements

### CARD-01: Required fields

Each card MUST have an immutable ID; deck membership; published version; exact quote; speaker; role at the time; date with known precision; event/publication context; original language; any clearly labelled translation; source URL and citation details; image and alt text; one score and short rationale per configured category (six for Donald); content/asset rights notes; editorial status and reviewer record.

Do not fabricate dates or silently treat paraphrases as quotations. Material omissions MUST be signalled and preserve meaning. Disputed or unverifiable quotes MUST NOT be published as verified cards. Use primary evidence where available, such as transcripts, recordings or official publications.

### CARD-02: Sin interpretation

The table below defines the Donald Deck’s six categories. Controls, score validation and results MUST use the selected deck’s category definitions. Mixed deck pools require compatible category sets.

| Sin | Editorial interpretation |
|---|---|
| Pride | Boasting, vanity, self-importance or personal infallibility |
| Greed | Desire for wealth, possessions, entitlement or personal advantage; absorbs Gluttony, including excessive acquisition or consumption |
| Lust | Desire for power, office, control or attraction; interpretation must be clear |
| Envy | Resentment of another person's success, popularity or status |
| Wrath | Anger, threats, revenge or expressed contempt |
| Stupidity | Absurd claims, poor reasoning or lazy thinking; physical inactivity alone does not count |

Scores describe the statement as satirical editorial interpretation, not a factual diagnosis of the speaker's character. Publish a consistent scoring rubric: 1–20 absent/very weak, 21–40 weak, 41–60 moderate, 61–80 strong, 81–100 extreme. Review borderline cases and ensure both quote and context support the explanation. A single quote can score strongly in multiple sins.

No live LLM generation is required for play. AI-assisted research or drafting, if used, MUST receive human verification before publication. Choose quotes for quality and thematic fit across parties, countries and periods; do not force invented content to fill a category. Card count is a catalogue attribute, not a fixed 28-card commitment.

### CARD-03: Visual design

Use recognisable original branding, large quote text, attribution and accessible contrast. Portraits/caricatures require appropriate asset permission or original commissioned artwork. Quote fronts, player score reverses and face-down house covers must be distinct. The web design uses a green felt baize, ivory/gold quote fronts and navy/gold reverses. Card shells must be identical in size; scroll long quotes inside the fixed front. Reduced-motion mode preserves the manual reveal step without timed rotation/sliding. Long quotes MUST use an approved layout or a clearly marked preview with access to the complete wording; never shrink into unreadable text or silently truncate. Keep accessible text alongside images. Published card scores and explanations are versioned; existing rounds retain their original version after corrections.

## 6. Website requirements

### WEB-01: Public pages

Home: explain the game, show sample cards, Play free and Browse decks. How to play: demonstrate two card fronts, flips to the player's visible scores, sin/card selection, a face-down house card awaiting user flip, result and replay. Shop: show all published decks, cover artwork, theme, eligible card count, currency, total displayed price and free/owned/paid status. Deck details: include representative previews, contents, purchase terms and a clear buy/play action. Do not expose the complete hidden score database through public previews or API payloads.

### WEB-02: Player experience

Support guest free play on the web; explain that durable cross-device history and purchases require an account. Preserve an anonymous session securely and offer an explicit verified merge on registration. Proposed authentication: email magic link with persistent sessions. Final provider is an implementation decision. Purchased access must be recoverable without relying solely on cookies.

My collection shows accessible decks, purchase status and channel launch buttons. The play screen shows selected deck, two cards, choice controls and clear progress. Result shows both quotes and selected scores, explanation, Reveal all sins and Twist Again. Provide source/context access without accidentally committing a play. Offer history and statistics for signed-in players.

### WEB-03: Mobile and accessibility

Design mobile first for iPhone Safari and Android Chrome, with desktop support. Core purchase and play flows MUST work at 320 CSS pixels wide without horizontal scrolling. All controls need keyboard operation, visible focus, meaningful labels and readable text alternatives. Outcome MUST use text/icons as well as colour. Respect reduced-motion settings and target WCAG 2.2 AA for the website.

## 7. WhatsApp requirements

### WA-01: Entry and gameplay

Use the official WhatsApp Business Platform or an approved provider. First contact explains the game and links to rules/privacy. Offer Play free, My decks and Shop through supported controls. The first incoming contact can create a WhatsApp player profile; this is distinct from marketing consent.

Send real card images labelled A/B, not text-only substitutes. Provide a short text equivalent so the game remains usable if an image cannot load. Select A/B using reply controls, followed by the deck’s category list (six items for Donald). Maintain short text commands as a fallback: A, B, Pride, etc. Parse these deterministically against the current state, not with a second game engine.

Reveal as a result image and accessible text, then provide Twist Again and optional details actions. Rendering or delivery failure MUST preserve the resolved result and allow retry without re-dealing. Clearly reject stale round controls. Handle free text, invalid commands and incoming non-text messages with brief state-appropriate guidance.

### WA-02: Platform constraints

Validate current support for image headers, reply-button counts and list interactions against the selected provider before implementation. Baseline design assumes up to three reply buttons and a category list (six options for Donald); use separate media and selection messages where needed. Do not depend on custom JavaScript, interactive regions inside an image or an embedded website running within a chat message.

Respect current messaging-window, template, opt-in and opt-out requirements. When the free-form reply window is closed, resume on the user's next message or use an approved, appropriately consented template. Do not silently send promotional reminders. WhatsApp group play is out of launch scope.

### WA-03: Commercial feasibility gate

Before committing to a paid WhatsApp launch, confirm provider acceptance of this entertainment game and its political satire content, plus applicable commerce/payment-link rules. This document does not assert that platform approval has already been granted. Record the result. If unavailable, retain web gameplay and user-initiated sharing links; do not use unofficial WhatsApp automation.

## 8. Payments, accounts and deck activation

### PAY-01: Product catalogue

Launch with a free starter deck and one or more paid themed decks, sold as one-off purchases. Example test price: £3.99 per paid deck, not a final price. Store products/prices centrally with currency and tax treatment. Clearly specify what access includes and whether new cards in the same deck are included; proposed default is ongoing access to the purchased deck and its updates while the service operates, without promising perpetual service availability.

The exact free allowance, launch card counts and pricing require owner decisions before release. Keep limits configurable and disclose them before purchase. A deck purchase MUST NOT silently imply unlimited WhatsApp messaging; any channel limits must be explicit. No stakes, cash prizes, cash-out, paid random loot boxes or purchased advantages in scoring.

### PAY-02: Checkout and fulfilment

Use a provider-hosted checkout, with Stripe as the proposed provider. The backend creates an order using trusted product prices and associates it with an authenticated player. Support a purchase started from the web or a WhatsApp buy link. Show amount, currency, purchased content and one-off/recurring nature before payment. Never request or store payment-card data in chat or the application database.

Only verified server-to-server payment confirmation grants access. A browser success URL, screenshot or player assertion is insufficient. Verify event authenticity, provider status, product, amount, currency and order association. Deduplicate events. Where payment is asynchronous, show Pending and grant only after successful confirmation. Reconcile missed notifications through provider status checks.

Payment success grants the entitlement exactly once and shows Play on web / Play in WhatsApp. Failed, cancelled or abandoned checkout grants nothing and allows retry. Prevent accidental duplicate purchases of owned decks. Record refunds/disputes and reconcile access according to the published policy; do not delete historic results. Offer support for payment succeeded/access missing, and a clear receipt/order history.

### ID-01: Linking channels

One internal player ID owns entitlements, statistics and rounds. Web login identity and WhatsApp sender identity are verified aliases of that player. A typed phone number alone MUST NOT be sufficient to claim an existing account.

From a signed-in purchase/account page, create a high-entropy, single-use, short-lived linking token and a Play in WhatsApp link with a prefilled activation message. The player must send the message; opening the link alone does not deliver it. Do not include payment secrets or personal details in the token. Store token hashes and expiry; suppress tokens from analytics and logs.

The backend validates the token and actual WhatsApp sender, consumes it atomically, links the channel and confirms the deck. Treat the token as a bearer credential. For an existing WhatsApp profile with purchases/history or a conflicting link, require verified control of both identities and an explicit merge confirmation. Never silently overwrite another player's link or transfer paid access. Provide token regeneration, recovery and secure unlink/relink processes; handle number changes and reassignment without assuming a phone number permanently proves account ownership.

### ID-02: Purchase initiated in WhatsApp

Create an opaque, expiring checkout handoff bound to the current player. The website authenticates or safely links that player before associating the order. On return, use the same entitlement and payment service as a web-originated order. Avoid maintaining separate web and WhatsApp inventories. Existing purchasers MUST not need to buy again when changing channel.

## 9. Administration

ADMIN-01: Restricted editorial/admin interface supports draft, review, publish, unpublish and versioned correction of cards/decks. Validate all configured category scores (six for Donald), rationales, citation, artwork and minimum eligible deck size before publication. Separate draft content from public endpoints.

ADMIN-02: Manage catalogue descriptions, covers, ordering, visibility, prices via the commerce integration, free limits and availability. Price edits must not rewrite historical orders. Disable a deck/card without breaking already persisted result records; block new sales or deals when appropriate and offer an alternative.

ADMIN-03: Support users, linking recovery, purchases, entitlement repairs and refunds through audited operations. Record actor, timestamp, reason and before/after state. Restrict manual score/result alteration; corrections create new versions rather than quietly changing completed rounds.

## 10. Architecture and data

### ARCH-01: One shared backend

Website and WhatsApp adapters call the same application services: Deal round, Select card, Commit sin, Resolve result, Replay, Get collection, Create checkout, Process payment, Link identity and Get statistics. The server owns rules and authorization. Never duplicate business logic between channels. Adapters may format messages, images and browser screens differently.

### ARCH-02: Core records

| Entity | Minimum responsibilities |
|---|---|
| Player / identity | Internal ID, verified web/WhatsApp aliases, preferences and recovery state |
| Deck / product / price | Catalogue, content membership, publication and commerce mapping |
| Card version | Quote, context, sources, asset references, configured category scores and explanations |
| Round | Player, channel origin, state/version, player pair, locked computer card, chosen card/sin, pinned content versions, result and timestamps |
| Order / payment event | Player, product, trusted price, provider identifiers, status and deduplication |
| Entitlement | Player, deck, grant source, status and access history |
| Link token | Hash, originating player, intended operation, expiry and consumed state |
| Message delivery | Provider message ID, round/action reference, delivery/retry state |
| Audit / statistics | Auditable actions and derived player aggregates |

Suggested round states: dealt → card selected → resolved; dealt/card selected → abandoned or expired. Sin commitment and result resolution are atomic. Persist final results before attempting delivery.

### ARCH-04: File-based card content (current decision)

Card content MUST use the default workflow **Markdown → generated JSON → game server**. Supabase is optional for content; no database project is required for this workflow.

- Editorial source: `docs/DONALD_DECK_CANDIDATES.md`.
- Generate with `python3 scripts/build_content.py`; commit the Markdown and `content/server/donald.json` together.
- JSON and the optional SQL exporter MUST use the single parser in `scripts/card_content.py`. Do not duplicate parsing or scoring logic.
- The generated JSON contains stable card IDs, quote text, attribution, context, source links, editorial notes, six scores and available rationales. Generation cross-checks scores against the Markdown matrix and rejects duplicate numbers, empty quotes and scores outside 1–100.
- The current v0.20 export contains 48 draft cards, 288 scores, eight HOLD cards and 71 source links. HOLD cards are #11, #19, #27, #36, #40, #41, #42 and #44. Counts describe the current snapshot, not fixed deck limits.
- All exported content remains draft. Candidate status MUST NOT imply publication or verification. HOLD cards MUST never be dealt; production use of any other card requires editorial approval. The exporter does not implement the publication workflow, and missing rationales remain missing.
- IDs use the deck slug and original card number; never renumber existing cards. Pin quote and score snapshots when dealing so a deployment cannot alter an active round.
- Read the full JSON only in trusted server code. Never copy the full deck into public/static assets or browser bundles. Precommit APIs may return the two dealt player cards and their six scores so the reverses work. Exclude computer identity/scores/selected category and unrelated cards. Explicitly project fields; source Markdown and editorial verification notes do not belong in card-front payloads.
- The GitHub repository is public and includes scores; server-only delivery prevents accidental disclosure during play, not deliberate repository lookup.
- Keep Supabase migration and seed files available as an optional future route. Accounts, entitlements, payments, rounds and statistics still need appropriate durable storage when implemented; the content JSON does not replace transactional player-state storage.

See [content handling instructions](../content/README.md). The export pipeline, private reference game server and D1 round storage are implemented. Publication controls, robust content snapshot pinning and production player-state handling remain implementation work.

### ARCH-03: Security and reliability

Before commitment, APIs and assets MUST NOT expose the computer's scores, selected category or identity. The player's two dealt cards intentionally include their own scores for reverse inspection. Full deck score tables stay server-side. The current API returns the computer/result after commitment, with a manual visual flip delaying display; a separate reveal endpoint is needed if postcommit network secrecy is required. Signed player sessions, authorization on every owned resource, admin access control and webhook signature verification are required. Rate-limit play, linking and checkout creation. Store credentials in managed secrets, never in source control.

Use idempotency keys and transactional updates for payments, entitlements, quota reservation and round resolution. Duplicate messages, webhook reordering and concurrent browser/WhatsApp actions must not corrupt state. Retries must be bounded and observable, with dead-letter/support recovery. Keep logs useful without recording secret tokens or unnecessary personal message content.

## 11. Performance, operation and measurement

Pre-render/cache published card artwork and keep game scores fixed; do not incur live LLM generation per round. Proposed targets under normal load: web actions respond within two seconds at p95, excluding external services; accept/queue WhatsApp actions within two seconds and aim for a reply within ten seconds, recognising provider delivery is outside direct control. Measure rather than guarantee provider latency.

Monitor errors, webhook failures, pending payments, delivery failures and cost per completed round. Back up persistent data and test recovery before accepting paid purchases. Provide a support contact and a basic service-status/recovery procedure.

Track first-round completion, repeat play, rounds per player, win distribution by sin, purchase conversion, owned-deck usage, payment failures, support incidents, cost and revenue. Do not infer or profile players' political beliefs from card choices. Establish privacy/retention rules and account deletion handling before launch, preserving only records required by the applicable retention policy.

WhatsApp tariffs and provider fees are launch dependencies; do not hard-code an assumption that service messages are free. Calculate the actual messages per round and unit cost for each channel. Provider costs, tax, checkout fees and content production must inform limits and prices.

## 12. Acceptance criteria

| ID | Scenario and expected outcome |
|---|---|
| AC-01 | A new round shows exactly two distinct quote fronts. Either flips to its own six scores. The computer card is already persisted and distinct; Deal second may show its two category-name hints only. |
| AC-02 | For each configured category (six for Donald), known fixture scores produce the correct win/loss/draw; result includes both scores and relevant rationales. |
| AC-03 | Precommit responses contain only the two player cards/scores and permitted hints; no opponent identity, scores or selected category. Full deck is absent from browser bundles. |
| AC-04 | Double taps, duplicate inbound messages and retries resolve one round once and update statistics once. |
| AC-05 | Twist Again creates a new round; limits show a clear explanation without charging automatically. |
| AC-06 | Website and WhatsApp given the same round produce identical results and entitlements. Switching channels resumes rather than rerolls. |
| AC-07 | WhatsApp sends readable card images and accepts both supported controls and documented text commands. Invalid/stale input does not change the result. |
| AC-08 | Mobile website permits browse, purchase, play and replay without horizontal overflow; keyboard and screen-reader paths are usable. |
| AC-09 | Verified successful checkout grants the correct deck once. Forged return URLs, invalid signatures, wrong amounts and cancelled/pending payments do not grant it. |
| AC-10 | Duplicate/out-of-order payment events and interrupted fulfilment recover without duplicate purchases or lost access. |
| AC-11 | Valid linking activates purchases for the actual sender. Expired, reused or forged tokens fail; conflicts do not overwrite accounts. |
| AC-12 | Linking an existing web and WhatsApp player preserves agreed purchases/history after verified merge; neither channel requires repurchase. |
| AC-13 | A corrected card is used for new rounds while an existing round retains its original quote/score version. |
| AC-14 | Media/delivery failure can resend the same result. Expired messaging windows use permitted recovery rather than unauthorised free-form sends. |
| AC-15 | Unpublished/unverified cards cannot be dealt, and inaccessible paid decks cannot be played via direct API requests. |
| AC-16 | Sources and full context are accessible; satire scoring is distinguished from the verified quotation. |
| AC-17 | Guest-to-account recovery, refund reconciliation, data backup recovery and support entitlement repair have documented checks. |
| AC-18 | Regenerating content produces deterministic JSON matching the Markdown scores, card identities, holds and source records; no Supabase project is needed. |
| AC-19 | Full content JSON and unrelated editorial fields are absent from browser bundles/static assets; precommit APIs explicitly project only dealt player fields and permitted hints. |
| AC-20 | Selecting a sin/card removes the unused card, preserves the selected slot and inserts the computer face down in the vacated slot. It never auto-flips. |
| AC-21 | Only the user's Flip computer's card action reveals its reverse, deciding-row highlights, totals update and outcome. Reduced-motion mode still requires this action. |
| AC-22 | Both card shells have equal dimensions, including mobile layout; long quotes stay readable inside the fixed front. |

### Current private web prototype

A playable mobile-first prototype is deployed at https://toptrumps-play.debagged.chatgpt.site (owner-private; ChatGPT sign-in required). It includes both deal modes, original illustrated ivory/gold cards on green baize, player flips to six visible scores, animated unused-card removal, a computer house card awaiting manual flip, comparison, source links, replay and same-browser round restoration. The deployed Site is versioned separately; this repository also includes a readable source snapshot under `reference/prototype/`, the original artwork under `assets/artwork/`, and independent solution/flow documentation. Card content remains the generated JSON snapshot; Cloudflare D1 stores round state only. No Supabase project is required.

Prototype limits: all cards are editorial drafts; HOLD cards are excluded. Session totals reset on refresh. The same decorative portrait is reused across cards and is independent of scores. No purchases, player accounts, WhatsApp integration, public launch or cross-device continuity are implemented. Database retention cleanup and rate limits remain launch work. Browser tests exercised both modes and refresh restoration; 50 automated round tests and TypeScript/build checks passed.

## 13. Delivery stages

1. **Content and feasibility:** confirm name, score rubric, source/asset process, launch deck contents, WhatsApp/provider acceptance and current tariffs. Manually test the game with representative quotes.
2. **Shared core and web:** implement content model, deal/resolve engine, mobile gameplay, accounts, catalogue and editorial workflow. Prove hidden-score handling and channel-independent tests.
3. **Commerce:** integrate checkout, verified fulfilment, collection, recovery and operational support; run test-mode purchase/failure/refund scenarios.
4. **WhatsApp:** connect official provider, render cards/results, implement stateful controls, account linking and payment handoff using the existing core. Validate end-to-end on real phones.
5. **Launch readiness:** publish reviewed decks, final prices/terms/limits, complete accessibility/reliability checks and measure pilot costs before broader release.

## 14. Deferred features

Subscriptions, party passes, multiplayer, shared seeded daily challenges, leaderboards, referral rewards, physical cards and sponsorship are LATER. They must not complicate launch rules. A shared challenge would require frozen deals and content versions, a defined number of rounds, spoiler-safe sharing and separate replay/ranking rules. No subscription or unlimited-play promise is implied by this baseline.

## 15. Decisions needed before launch

Domain/final visual style; approved quote collection and asset rights; deck sizes; starter allowance; prices/currencies/tax setup; whether paid decks include updates; WhatsApp provider and policy acceptance; messaging budget; authentication/recovery provider; final access/refund terms; support owner; retention schedule and hosting stack. These do not prevent documenting or prototyping the agreed game.

## 16. Reference sources and verification notes

Platform details can change. Validate again during implementation; these sources guide integration rather than proving approval of this particular game.

- WhatsApp interaction types and limits: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/ (archived SDK reference; check current provider documentation).
- WhatsApp Business Messaging Policy: https://business.whatsapp.com/policy
- WhatsApp platform pricing: https://business.whatsapp.com/products/platform-pricing (public pricing wording and October 2026 provider updates have conflicted; verify current applicable rate card).
- WhatsApp payment availability: https://faq.whatsapp.com/1293279751500598 — native UK payments must not be assumed; this design uses external checkout.
- Stripe hosted Payment Links: https://stripe.com/gb/payments/payment-links
- Stripe fulfilment: https://docs.stripe.com/checkout/fulfillment
- Stripe webhooks: https://docs.stripe.com/webhooks

No production integration, merchant acceptance, quote rights clearance or payment processing has yet been completed.

## 17. Standalone AWS version-one implementation

The runnable application is now `web/` (standard Next.js 15/React). It preserves the approved card flips, baize, two deal modes and manual house-card reveal. Shared server rules are in `web/lib/game.mjs`; `web/lib/service.mjs` handles state transitions and compare-and-set retries; `web/lib/store.mjs` implements AWS DynamoDB state storage. No Supabase, Brevo, Cloudflare runtime or ChatGPT login is required for the intended AWS deployment.

This implementation improves on the historical prototype: dealt card wording/scores are pinned in round snapshots; concurrent initial deals, choices and reveals are handled atomically; expiry is checked server-side; and the computer's card, selected category, scores and result are absent from network responses until an explicit server `reveal` action. The manual flip therefore controls both data delivery and visual reveal. These rules supersede the historical prototype's postcommit visual-only concealment description.

Round state: dealt → committed → revealed. Own scores remain visible before commit. All eight HOLD cards remain excluded and other content remains labelled editorial draft. Page-visit totals are not persistent player statistics. Commerce, accounts and WhatsApp are out of version-one scope.

The repository includes an Amplify monorepo build specification, pinned package lock, CloudFormation table/role template and deployment helper. Tests cover 200 random deals plus draws, invalid inputs, content mutation after dealing, concurrent requests, expiry and rejected actions. Local browser play and a production Next.js build passed. AWS infrastructure creation, real DynamoDB validation, actual-device testing and a live AWS URL remain pending authenticated AWS deployment. See [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md).

## Computer quote and result alignment update — 2 November 2026

After commitment, the computer's card enters the unused slot showing its illustrated quote front, not an anonymous house cover. The user then flips that quote card to reveal its six sins/scores and the result. Precommit responses still omit all opponent data; committed responses include only `opponentFront` (ID, label, quote, speaker), without scores, rationale, locked category or outcome. The reveal action delivers scores/result. This supersedes older descriptions that conceal the computer's identity until the flip itself.

Each revealed score is rendered directly beneath the card it belongs to, in the same slot/container. When the computer is on the left its score is on the left. In the stacked mobile layout, each score follows its own card rather than appearing in a separately ordered summary. The separate summary displays only the deciding sin and outcome.

Deal second prompt explicitly labels the two names as possible sins, with one already locked. Neither is presented as the selected sin. The commit/reveal sequence always compares the locked sin, including after restore or a client supplying a different category.

Mobile refinement: below 560px, equal card shells are 580px tall, images are 175px tall, full quotes remain scrollable at readable type sizes, and score rows/buttons have at least 44px touch height. The comparison stacks each card together with its own score and avoids page-level horizontal overflow. Desktop card shells remain 640px tall.

## Viewport-fit phone play and landscape pairing

Gameplay on screens up to 1100px wide uses a fixed dynamic-viewport-height shell, safe-area padding and a flexible card area, replacing fixed pixel card heights on phones. Header/instructions are compact and nonessential chrome is hidden. Portrait shows one full-height card slot at a time, with Card A/Card B controls (or Your card/Computer after play) and horizontal swipe navigation; no vertical page scroll is needed to reach the flip or play controls. Landscape shows two equally-sized cards side by side, with a compact two-column sins reverse. Each result score stays within its card slot. Long quote text retains its internal readable area; mobile sizing never changes the game rules. Orientation changes use responsive CSS without starting a new round.

## Single-player-card mobile flow and complete portrait

Mobile layouts (up to 1100px) now request exactly one player card per new round, in either deal mode. This replaces the mobile A/B choice: Deal first flips that card to select its sin; Deal second inspects it and presses Play against the locked computer sin. Desktop keeps two player cards. The same server deal/commit/reveal engine accepts a validated one- or two-card count; it does not fork scoring logic. Existing unresolved rounds are preserved; on mobile only the first unplayed card is presented until that round completes.

After mobile commitment, the comparison contains Your card and Computer, rather than treating a second player card as mandatory. Portrait uses comparison navigation; landscape pairs the two comparison cards. Donald's complete source artwork uses object-fit contain and its original aspect ratio, without cover cropping or distortion. Short landscape fronts position the tall portrait beside the quote instead of compressing it into a wide image strip. These rules supersede earlier mobile two-player-card designs.

## Full-page results and persistent quote wording

After the computer's manual flip, show a dedicated full-page results view instead of squeezing the result into viewport-height gameplay cards. Show both complete quotes in aligned columns, deciding scores beneath their quotes, all six sin comparisons with the deciding row highlighted, and source information directly on the page. Remove replay/card-switch/show-details button rows from results. A small New round navigation link returns to deal selection. Results use natural document height on phones rather than shrinking all content to one screen.

While playing, score reverses also include the quote text above the six sins. Showing sins must not remove the quotation or place a details overlay over it. Long quote wording remains readable in its allotted reverse area. This replaces the previous show/hide quote overlay interaction.

## Mobile quote-front clipping correction

Quote fronts on mobile now use an explicit three-row grid: label/header, portrait beside quote, then a separate full-width flip-control row. The complete portrait uses contain sizing in the left column; the quote has the remaining width and middle-row height. Remove the previous stacked 32–36dvh portrait allocation on these fronts. The flip control is static in its own grid row, with no overlay or overlap into the quote. The same layout applies to the computer's quote front. Longer text remains accessible within the quote region; no text is silently truncated. Results retain their separate full-page layout.
