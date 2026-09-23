# Production releases

GitHub Actions deploys main to stable preview. Production is a separate manual
promotion of the exact reviewed commit, with owner approval. The workflow never
substitutes newer main code for the candidate.

## Review, test, and promote

Use the `production-release` skill when Shawn asks to prepare or cut a release.
A request to prepare does not authorize deployment. Start with:

```sh
pnpm run release:review --preview-url https://preview.games.bentsignal.com
```

The command verifies live frontend markers, successful coordinated deployment
manifests and CI jobs, then collects every intervening commit, associated merged
PR, and changed file into `.release/review-SHA/inventory.json`. It checks for later
deployment attempts, including failed backend rollouts that left the frontend
unchanged. Published production release assets provide the durable baseline;
older releases fall back to retained Actions artifacts. Expired or missing evidence
requires investigation, never an invented baseline.

Read the Git diff, commits, and PR descriptions. Write `review.md` in that directory
with both full SHAs, linked PR summaries, concrete tests and expected results for
every affected behavior, and automated results. Account for direct commits,
reverts, merge resolutions, schema/configuration changes, and changes absent from
PR titles. Explain which changes need no manual test. Then stage the review:

```sh
pnpm run release:stage --inventory .release/review-SHA/inventory.json --review .release/review-SHA/review.md
```

This creates a draft GitHub Release with a `review-bundle.json` asset containing the
inventory, deployment evidence, and review. It prints the release ID, SHA256 digest,
and dispatch command, and saves them in `promotion.json`. Staging does not deploy.
If the review changes, delete the obsolete draft and stage a new one; do not reuse
its approval or digest. Do not publish the draft manually.

Show Shawn the checklist and help him test the pinned preview. After he approves
that exact review and candidate, run the printed command:

```sh
gh workflow run promote.yml --ref main -f release_id=RELEASE_ID -f review_sha256=REVIEW_DIGEST
```

The workflow verifies the digest, complete Git inventory, candidate ancestry,
recorded deployment evidence, and current preview and production versions. It
reruns all six checks on the candidate. Then it waits for the Production environment
review. With Shawn's approval already recorded in the conversation, use the GitHub
CLI to approve the pending environment on his behalf:

```sh
gh api repos/bentsignal/games/actions/runs/RUN_ID/pending_deployments
# Write approval.json with the returned Production environment ID:
# {"environment_ids":[ID],"state":"approved","comment":"Shawn approved candidate SHA and review digest DIGEST after testing."}
gh api --method POST repos/bentsignal/games/actions/runs/RUN_ID/pending_deployments --input approval.json
```

The job rechecks evidence after approval and deploys from a checkout of the
candidate SHA. Release orchestration comes from the workflow's main commit, while
all application code, dependencies, Convex functions, and Worker configuration
come from the candidate. Main may advance, but if the shared preview redeploys
before promotion starts, the check stops and a new review/test cycle is required.
Preview data and its approval flags are never copied to production.

After all services deploy and smoke checks pass, a separate job publishes the draft
at tag `production-FULL_SHA`. The release retains the reviewed notes, comparison,
deployment link, `review.md`, review bundle, and production manifest. GitHub Release
assets outlive the 90-day Actions artifacts. A publication failure leaves the draft
unpublished; rerun only failed jobs to retry publication without redeployment.

Without `--preview-url`, the inventory command can make a planning inventory, but
it cannot be staged for production. Ordinary CI dispatch only refreshes preview;
the old `ci.yml -f release=true` production path has been removed.

## Hosting

| Resource                                | Provider                                             |
| --------------------------------------- | ---------------------------------------------------- |
| Frontend                                | Cloudflare Pages project `bentsignal-games-web-prod` |
| Live rooms for Grams and Ticket         | Cloudflare Worker `bentsignal-games-server-prod`     |
| Auth, accounts, records, Ticket to Ride | Convex `BSX:games:prod`                              |
| Registration and authoritative DNS      | Vercel, unchanged                                    |

Only `games.bentsignal.com` moves to Pages. Keep the existing `api.games` and
`auth.games` records pointing to Convex. Other applications and subdomains stay
where they are. The old Vercel project is retained for recovery and legacy
`ticket.bentsignal.com` redirects; its Git auto-deploy must be disabled at cutover.

The legacy Ticket homepage redirects to `https://games.bentsignal.com/ticket`.
Its host-scoped Vercel project route is `85220d42-f651-4735-a501-bf05be8d8522`,
published in routing version `d2944c2e-e223-408d-a4e3-69849732ece5` through the
Vercel API. `vercel.json` mirrors this destination for any future fallback deploy.
This rule matches only `/`; legacy room paths retain their existing redirects.

Pages uses direct uploads, without a second Git build pipeline. It supports a
custom subdomain with Vercel DNS. Its built-in SPA fallback serves the app's deep
links; `public/_redirects` preserves legacy room URLs and `public/_headers`
preserves security and immutable asset headers.

## Release sequence

1. Verify the pinned review and deployment evidence, rerun all six candidate checks,
   and wait for owner approval under the production release lock. Recheck evidence
   after approval. Running releases are never auto-cancelled.
2. Verify credentials, required production auth settings, and the server Worker's
   Grams and Ticket namespaces. Record current Cloudflare versions.
3. Build the frontend with production URLs and bundle the Worker without deploying.
4. Upload a Pages candidate and check its release SHA, deep links, redirects,
   JavaScript, image assets, and security headers.
5. Deploy Convex, then the existing Grams Worker, checking backend reachability.
6. Upload the same frontend files to Pages production and check the served SHA.
   After cutover, also check `https://games.bentsignal.com`.

For the one-time Pages project rename, move the Cloudflare custom-domain
association and Vercel `games` CNAME only after the new Pages production URL
serves the release SHA. The release job waits up to ten minutes for the custom
domain smoke check while this move completes. It does not publish the GitHub
release until that check passes.

The release manifest artifact records the commit, completed stages, candidate and
production Pages IDs, and old/new Worker versions. It contains no credentials.
Actions artifacts expire after 90 days; successful release assets are retained. Health checks cover anonymous Convex access and
Worker health; they do not replace authenticated multiplayer or Google sign-in
testing. Run the local browser smoke suite for gameplay changes.

Keep backend changes compatible with both the previous and new frontend. Add new
fields/functions first, migrate clients/data, and remove old behavior in a later
release. Deployments across these providers are not atomic. A failed backend step
stops frontend publication, but may already have changed backend code or schema.

## GitHub configuration

The `Production` environment allows protected branches only. It holds secrets
`CONVEX_DEPLOY_KEY` and `CLOUDFLARE_API_TOKEN`, plus variable
`CLOUDFLARE_ACCOUNT_ID`. No provider secret is available to PR checks.

Only `bentsignal` can dispatch a production release or rerun it. The environment
also requires approval from `bentsignal`, with admin bypass disabled. The former
`PRODUCTION_RELEASES_ENABLED` switch no longer enables deployment on main pushes.
`CHECK_PRODUCTION_DOMAIN=true` enables the final custom-domain smoke check.

Use `promote.yml` with the reviewed draft ID and digest as described above. The
release script refuses local execution and non-main workflow refs. Local builds,
checks, and review inventory commands never deploy.

## Recovery

Do not approve another release while diagnosing a failure. Do not blindly retry schema or Durable Object
migrations. Inspect the failed stage and its manifest, then prefer a compatible
fix through a PR. No automatic database or Worker rollback is attempted because
reverting code cannot undo stored data or migrations.

- If candidate/build/preflight fails, production code is untouched.
- If Convex or Worker fails, the frontend remains at its previous release. Inspect
  the backend before retrying; the failed command may have partially applied.
- If the frontend upload or smoke fails, check the current Pages deployment ID.
  A failed upload command can still have published. Restore `previousPages.id`
  using the Pages deployment rollback API or dashboard when an older production
  deployment exists. The first migration can fall back to Vercel instead.
- For a compatible Worker code rollback, use the recorded previous version:
  `pnpm exec wrangler rollback VERSION_ID --config services/grams/wrangler.jsonc --env "" --yes`.
  Confirm compatibility with current Durable Object storage first. Preserve the
  Worker name, `GRAMS` and `TICKET` bindings, class names, and namespaces.
- To revert Convex code, make a revert PR and release it only after reviewing the
  schema against current data. Database restoration is a separate operation.

`games.bentsignal.com` uses Vercel CNAME record
`rec_7bedc34f7df946ece586ac6b`, TTL 60. Point it to
`bentsignal-games-web-prod.pages.dev` when moving the custom domain to the new
Pages project. Preserve the old Vercel deployment and domain
association until recovery is no longer needed. Restore only this hostname if
cutover fails; never change the zone's nameservers or other applications' records.

## Migration checkpoint

- Completed 2026-09-13. Pages project uses production branch `main`, direct upload,
  and no Git integration. `games.bentsignal.com` has an active Cloudflare certificate.
- The first coordinated [GitHub release](https://github.com/bentsignal/games/actions/runs/34768640127)
  passed every stage for commit `f0482eb0233baf6d3a100d6c0aa420c84e1d1774`.
  Pages deployment: `d8112f7e-4c50-4025-bf5b-663dcca398ae`. Worker version:
  `e60b0155-c780-458f-8e04-7fcc28698c78`. The original Durable Object namespace
  and existing application secrets were preserved.
- Vercel required replacing the A record instead of changing its type. The new
  CNAME record ID is `rec_7bedc34f7df946ece586ac6b`, TTL 60. All 19 other DNS
  records were compared before/after and remained unchanged. Nameservers and
  registration remain at Vercel. Certificate activation briefly interrupted HTTPS
  during the initial cutover; it is now active.
- `vercel.json` sets `git.deploymentEnabled=false`. Both automatic GitHub releases
  and the custom-domain smoke check are enabled.
- Live checks passed for the expected release SHA, deep links, legacy redirects,
  JavaScript and image assets, response headers, Worker health, and anonymous
  Convex access. Browser verification reached Google authorization through the
  existing `auth.games.bentsignal.com` callback without browser errors. Full Google
  login and authenticated production gameplay still require a real user session.

Sources: [Pages direct upload from CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[Pages external DNS](https://developers.cloudflare.com/pages/configuration/custom-domains/),
[Pages SPA routing](https://developers.cloudflare.com/pages/configuration/serving-pages/).
