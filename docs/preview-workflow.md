# Preview and release workflow

Stage 4 is workflow infrastructure only. Package extraction and code refactoring
are a separate follow-up, after stable preview and production promotion work.

## Desired behavior

| Event                               | Result                                                           |
| ----------------------------------- | ---------------------------------------------------------------- |
| Any PR to main                      | Six ordinary checks, without deployment credentials              |
| Merge to main                       | Deploy Convex, Grams Worker, and frontend to stable preview      |
| Shawn explicitly requests a release | Review and test the candidate, then approve production promotion |

Use `main` as the integration branch. Stable preview is one environment whose
backend, database, and Worker storage persist between builds. Contributors use
local development and isolated Convex deployments when needed. Review PRs and
require passing CI before merging; test the deployed changes on stable preview.
Production data is never copied from, or overwritten with, preview data.

## Production authority

Production requires an explicit owner-triggered workflow and the GitHub
`Production` environment's approval from `bentsignal`. Admin bypass is disabled.
An agent acting through Shawn's GitHub CLI can request and approve that release
when Shawn authorizes it. A skill guides the operation; GitHub enforces it.

Pin promotion to the commit tested on stable preview. Do not silently release a
newer main commit that arrived after Shawn tested the preview.

## Review before production

When Shawn asks for a production release, the agent first prepares a review of
everything since the last successful production deployment. Use the
`production-release` skill and `pnpm run release:review --preview-url PREVIEW_URL`.
The command writes an ignored `.release/review-SHA/` inventory with the deployed
production frontend SHA, candidate SHA, every intervening Git commit, associated
merged PRs, and changed files. It does not deploy or grant approval.

The agent must verify coordinated backend deployment evidence as well as frontend
markers, inspect the code changes, and turn the inventory into a testing checklist.
Show linked PR titles with short summaries, specific actions and expected results,
and automated checks already completed. Include changes without PRs, merge
resolutions, reverted changes, and configuration or database changes that a title
list might miss. Explain when a change needs no manual testing.

Shawn tests the pinned preview candidate and then approves that exact release.
Main may continue advancing, but promotion must use the tested SHA. If the shared
preview updates during testing, restart testing for the new candidate or restore
the reviewed candidate, including its backends.

Publish a GitHub Release only after the coordinated deployment and smoke checks
succeed. Tag the deployed SHA and retain the reviewed changelog, PR links,
comparison, deployment run, review, and manifest there. These records must survive
the current 30-day Actions artifact retention. A partial failure must not advance
the successful production baseline; investigate actual service state before retrying.

[T3 Code's release workflow](https://github.com/pingdotgg/t3code/blob/main/.github/workflows/release.yml)
uses the published preview commit for stable releases and generates notes against
the previous release in the same channel. We use the same comparison principle,
with an agent-written testing checklist based on the actual Git changes.

## Stable preview resources

| Resource                 | Target                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| Frontend                 | `https://preview.games.bentsignal.com`                              |
| Cloudflare Pages project | `bentsignal-games-web-preview`, direct uploads to its `main` branch |
| Convex                   | `BSX:games:preview/preview`, deployment `chatty-okapi-416`          |
| Realtime Worker          | `bentsignal-games-server-preview`                                   |
| GitHub environment       | `Preview`, restricted to protected branches                         |

The Preview environment needs its deployment-scoped `CONVEX_DEPLOY_KEY`,
`CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` variable. The Cloudflare token
requires Pages and Workers deployment access. Account-scoped Cloudflare permissions
are broader than a single Worker; PR jobs receive no credentials. Production's
Convex key and approval gate stay in the Production environment.

The CI workflow waits for all six checks, then runs `scripts/deploy-preview.mjs`
on main pushes or a manual CI dispatch with `release=false`. Deployments are
serialized and running deployments are not cancelled. A queued superseded commit
is skipped. The script validates preview targets, builds first, deploys Convex and
the Worker, then publishes the frontend. Smoke checks verify both service URLs,
backend reachability, frontend SHA, deep links, redirects, and assets. The Actions
summary links to stable preview; the manifest records deployment IDs and stages.
A partial failure may change backend state, so inspect the manifest before retrying.

`STABLE_PREVIEW_ENABLED=true` enables the job after access setup. The environment
has no manual approval requirement. Production remains a separate manual job.

## Authentication

Stable preview game access requires approval. Google sign-in creates the account;
set `previewApproved` to `true` on its `users` record in the stable preview database
`BSX:games:preview/preview` to grant access. Missing or false means access is denied.
The Google callback records `verifiedGoogleEmail` to help identify the account.
Existing accounts populate that email on their next Google sign-in. Approval is
stored in the database, with no email list or deployment configuration to maintain.

An administrator can edit the record in Convex or use the internal CLI mutation:

```sh
pnpm exec convex run users:setPreviewApproval '{"userId":"USER_ID","approved":true}' --deployment chatty-okapi-416
```

Use `false` to revoke approval. This mutation is unavailable to website clients.

Unapproved accounts see a limited-access screen. The shared backend player check
blocks onboarding, Ticket to Ride requests, and new Grams connection tickets.
Approval updates the screen through the existing user subscription without another
sign-in. Existing Grams sockets finish their current session before revocation
takes effect on reconnect. Production and ordinary local development are unaffected.

Admin-created test accounts remain available through the existing internal fixtures.
Website clients cannot approve accounts or set their test-account flag. To test the
gate in an isolated database, set `GAMES_PREVIEW_SITE_URL` to its site URL, with its
matching `GAMES_DEV_SITE_URL`. Remove the override afterward.

Stable preview uses Google sign-in with a fixed callback URL. Its OAuth client
must allow `https://chatty-okapi-416.convex.site/oauth/google/callback`.
The Google client configuration is shared with production, but session signing
keys, accounts, game data, and the Grams realtime secret are separate.

Preview also enables admin-only test fixtures through `GAMES_DEV_SITE_URL` matching
its exact Convex site URL. These fixtures are not public sign-in endpoints. Agents
can create test sessions through the authenticated Convex CLI for browser testing;
website users use Google. Local development retains its test-username sign-in UI.

## Current checkpoint

The preview resources are provisioned and the frontend is reachable over HTTPS.
Convex, Worker health, frontend service URLs, deep links, redirects, assets, and
release markers pass smoke checks. The initial deployment used local CLI logins. Browser tests passed a complete Grams
round with two accounts and stored results, plus Ticket to Ride joining, ticket
selection, chat, drawing cards, and reconnecting.
The preview server Worker has separate Grams and Ticket namespaces. Its deployment
manifest records the Grams namespace used for each rollout.

Stable preview is enabled with `STABLE_PREVIEW_ENABLED=true`. GitHub Actions run
[34796077885](https://github.com/bentsignal/games/actions/runs/34796077885) passed all
six checks and every deployment stage for commit
`85c656184be91bbca50439369858e31acc297975`. The live custom-domain release marker
matches that commit. The manifest records Pages deployment
`d3052bcc-ee5e-4bcb-80f9-e0fdf080b5f3`, Worker version
`4fb74f88-c16d-4003-b54a-bc01c4ebd1ac`, and the preserved preview namespace.

Main pushes now deploy automatically after checks pass. Google callback setup is
complete; the setup agent verified real Google sign-in through username setup.
The initial token-copy problem was corrected and the replacement credential has
now passed a complete CI deployment. Production remains manual and unchanged.

For authenticated browser checks using admin-created preview sessions:

```sh
PLAYWRIGHT_PREVIEW=1 PLAYWRIGHT_BASE_URL=https://preview.games.bentsignal.com pnpm exec playwright test tests/e2e/grams.spec.ts tests/e2e/multiplayer.spec.ts --grep 'Grams preserves|two independent friends'
```

These checks exercise real sessions and gameplay, but do not replace a human
Google sign-in check after callback registration.

## Production promotion

`promote.yml` accepts a draft release ID and the digest of its reviewed bundle.
It verifies deployment evidence, reruns checks against the exact candidate, waits
for owner approval, and publishes a durable GitHub Release only after deployment
succeeds. See [production releases](releases.md) for the CLI sequence and recovery.
The first owner-approved production promotion remains the final live validation;
implementing or testing the workflow does not authorize that release.
