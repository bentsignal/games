# Production releases

GitHub Actions coordinates releases from `main`. The six CI checks remain parallel
and credential-free. The Production release job waits for all six to pass.

## Hosting

| Resource                                | Provider                                    |
| --------------------------------------- | ------------------------------------------- |
| Frontend                                | Cloudflare Pages project `bentsignal-games` |
| Grams live room                         | Cloudflare Worker `games-grams`             |
| Auth, accounts, records, Ticket to Ride | Convex `BSX:ticket-to-ride:prod`            |
| Registration and authoritative DNS      | Vercel, unchanged                           |

Only `games.bentsignal.com` moves to Pages. Keep the existing `api.games` and
`auth.games` records pointing to Convex. Other applications and subdomains stay
where they are. The old Vercel project is retained for recovery and legacy
`ticket.bentsignal.com` redirects; its Git auto-deploy must be disabled at cutover.

Pages uses direct uploads, without a second Git build pipeline. It supports a
custom subdomain with Vercel DNS. Its built-in SPA fallback serves the app's deep
links; `public/_redirects` preserves legacy room URLs and `public/_headers`
preserves security and immutable asset headers.

## Release sequence

1. Wait for all six checks and the production release lock. Skip the run if a
   newer `main` commit already exists. Running releases are never auto-cancelled.
2. Verify credentials, required production auth settings, and the existing Grams
   namespace `594d285208dd4519ba392e4c0d941548`. Record current Cloudflare versions.
3. Build the frontend with production URLs and bundle the Worker without deploying.
4. Upload a Pages candidate and check its release SHA, deep links, redirects,
   JavaScript, image assets, and security headers.
5. Deploy Convex, then the existing Grams Worker, checking backend reachability.
6. Upload the same frontend files to Pages production and check the served SHA.
   After cutover, also check `https://games.bentsignal.com`.

The release manifest artifact records the commit, completed stages, candidate and
production Pages IDs, and old/new Worker versions. It contains no credentials.
Artifacts expire after 30 days. Health checks cover anonymous Convex access and
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

Repository variable `PRODUCTION_RELEASES_ENABLED=true` enables releases on main
pushes. Set it to `false` to pause automatic releases. Environment variable
`CHECK_PRODUCTION_DOMAIN=true` enables the final custom-domain smoke check.

For an intentional release of current main, including recovery after a provider
outage, run:

```sh
gh workflow run ci.yml --ref main -f release=true
```

This reruns the six checks before deployment. The manual release input works even
when automatic releases are paused. Use the Actions run's logs and manifest to
diagnose failure before retrying. The release script refuses local execution and
non-main refs. Normal local builds and checks never deploy.

## Recovery

First pause automatic releases. Do not blindly retry schema or Durable Object
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
  Worker name, `GRAMS` binding, class name, and namespace.
- To revert Convex code, make a revert PR and release it only after reviewing the
  schema against current data. Database restoration is a separate operation.

Before DNS cutover, `games.bentsignal.com` used Vercel A record `76.76.21.21`,
record ID `rec_f5738ba0dfa0e0f5af6c41cd`, TTL 60. Its replacement points to
`bentsignal-games.pages.dev`. Preserve the old Vercel deployment and domain
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
