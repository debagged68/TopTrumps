# AWS Amplify deployment — first standalone version

The deployable application is in `web/`. It is standard Next.js 15 with React, not the Sites/Vinext runtime. The repository root `amplify.yml` builds that app. The original artwork and generated JSON stay canonical at the repository root; the app prepares its runtime copies automatically.

## Status

The standalone source has been built and tested locally. AWS deployment requires an authenticated AWS account and GitHub repository connection. No AWS resources or live AWS URL have been created by this session. Do not confuse the existing ChatGPT Site preview with an AWS deployment.

## Deploy using the existing AWS account

1. In AWS Amplify, create a **new** app named TopTrumps. Connect GitHub repository `debagged68/TopTrumps`, branch `main`. Select monorepo root `web` and let the repository's `amplify.yml` provide the build settings. Keep this separate from E-Calendar and Oast Cottage.
2. Copy the new Amplify app ID. The first automatic build may stop until round-storage variables are configured; this is expected.
3. On a machine with AWS CLI v2 authenticated to that account, run from the repository root:

   ```bash
   AWS_PROFILE=oast-cottage bash scripts/deploy-aws.sh <NEW-AMPLIFY-APP-ID> eu-west-2
   ```

   Use the correct existing profile and region for your account. This command creates a dedicated DynamoDB rounds table and limited IAM compute role, configures the new app's main branch, starts a release and prints the real mobile URL only after AWS reports success. It refuses to modify apps connected to other repositories.

The script creates AWS resources subject to your account's normal Amplify/DynamoDB charges. The DynamoDB table uses on-demand requests and automatic TTL cleanup. It is retained if the CloudFormation stack is deleted. No Brevo, Supabase, payment provider or ChatGPT login is required to play on the resulting AWS site.

## Console-only equivalent

Create a CloudFormation stack from `infra/toptrumps-state.yaml`, acknowledging its IAM role. From Outputs, copy TableName, ComputeRoleArn and Region. On the Amplify main branch configure:

| Setting | Value |
|---|---|
| Application platform | Next.js SSR / WEB_COMPUTE |
| App root | `web` |
| `AMPLIFY_MONOREPO_APP_ROOT` | `web` |
| `TOPTRUMPS_TABLE_NAME` | TableName output |
| `TOPTRUMPS_AWS_REGION` | Region output |
| Main branch SSR Compute role | ComputeRoleArn output |
| Build specification | Root `amplify.yml` |

Attach the role to **main**, not untrusted preview branches. Keep pull-request previews off for this stateful environment. `scripts/amplify-env.mjs` makes only table/region identifiers available to the runtime; it never writes AWS credentials to build files. Redeploy main after setting these values.

## Local development

```bash
cd web
npm ci
TOPTRUMPS_LOCAL_STATE=1 npm run dev
```

Local-state mode is deliberately disabled in production. It uses process memory for UI testing and resets when that process restarts. AWS uses DynamoDB conditional writes and immutable per-round card snapshots. No local AWS credentials are needed for the UI-only local mode.

Run `npm test`, `npm run typecheck` and `npm run build` in `web/`. The first test step copies canonical content/artwork automatically. Generated copies, local environment files, dependencies and build outputs are ignored by Git.

## Version-one behavior

- Both deal modes, player card flips with own six scores, green baize, unused-card removal and manual computer-card reveal.
- Computer identity, selected sin, scores and outcome stay absent from responses until the user's explicit server reveal action.
- Server-controlled random dealing/scoring; atomic commits, replay and reveal under concurrent requests.
- Round snapshots retain dealt wording/scores across editorial changes. Session expiry is enforced on every request; DynamoDB TTL later clears expired rows.
- Opaque HttpOnly same-site session cookie. HTTPS deployments use Secure cookies.
- Eight HOLD cards excluded; all remaining quotes/scores remain labelled editorial drafts.
- Session totals currently count the open page visit only. No accounts, purchases, WhatsApp or cross-device history.

## Post-deployment checks

Open the returned HTTPS URL on iPhone Safari and Android Chrome. Deal first, inspect both reverses, select a sin and verify that the house stays face down until clicked. Repeat Deal second using the two hints. Refresh before and after commitment; repeat action requests and confirm the first result is preserved. Inspect pre-reveal responses: they must contain no opponent/result. Check the long-quote scroll area and equal card dimensions at narrow widths.

AWS references: [Next.js hosting](https://docs.aws.amazon.com/amplify/latest/userguide/deploy-nextjs-app.html), [SSR compute role](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html), [SSR environment variables](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html).
