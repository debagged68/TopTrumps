# Top Trumps — standalone AWS web app

This is the runnable first web version. It uses standard Next.js 15, React and AWS DynamoDB; it does not need Sites, Supabase, Brevo or ChatGPT authentication.

From this directory:

    npm ci
    TOPTRUMPS_LOCAL_STATE=1 npm run dev

Development uses process-local state only when explicitly enabled and NODE_ENV is not production. Production requires the table and compute role described in [AWS_DEPLOYMENT.md](../docs/AWS_DEPLOYMENT.md).

    npm test
    npm run typecheck
    npm run build

The prebuild/pretest preparation copies the canonical generated JSON and portrait into this app. Do not hand-edit those copies or import the full dataset into client components.

The server owns random dealing, immutable round snapshots, atomic commitment and a separate reveal action. Until the user's explicit flip, responses contain no computer card identity, scores, locked category or result. Round expiry is enforced server-side; DynamoDB TTL cleans up later.

The visuals preserve both deal modes, player score reverses, equal-size cards, green baize, unused-card removal and manual computer flip. Draft content is labelled and eight HOLD cards excluded. Page-session totals reset on refresh. Accounts, purchases and WhatsApp remain separate work.

The unit suite covers 200 random deals, both modes, draws, invalid choices, content mutation after dealing, concurrent deals/choices/reveals, expiry and rejected actions. Real AWS deployment and device checks are still required once AWS access is available.
