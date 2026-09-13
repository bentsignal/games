# Preview and release workflow

Stage 4 is workflow infrastructure only. Package extraction and code refactoring
are a separate follow-up, after we can test changes through deployed PRs.

## Desired behavior

| Event                               | Result                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Any PR to main                      | Six ordinary checks, without deployment credentials                    |
| PR from a trusted contributor       | Deployed frontend, isolated Convex database, and isolated Grams Worker |
| New commits on that PR              | Check the new commit, then update its preview URL                      |
| PR closed or merged                 | Remove preview resources; database expiration is a backstop            |
| Merge to main                       | Update the stable preview environment, without deploying production    |
| Shawn explicitly requests a release | Promote the commit verified on stable preview to production            |

Use `main` as the integration branch. The stable preview is an environment, not
another branch that needs merge management. Its database persists between builds.
PR databases are disposable and should expire after seven days. Production data
is never copied from, or overwritten with, preview data.

## Trust and production authority

[T3 Code's PR vouch workflow](https://github.com/pingdotgg/t3code/blob/main/.github/workflows/pr-vouch.yml)
checks contributor trust separately from PR code. Follow that separation here.
Maintain an explicit owner-controlled contributor allowlist, initially just
`bentsignal`. A label can display the decision but must not grant access by itself.

Evaluate trust from the default branch or owner-controlled repository settings.
Recheck the PR's current head commit and CI result before provisioning. A PR must
not be able to change its own trust decision. All PRs retain the ordinary checks;
only preview provisioning depends on trust.

Keep preview credentials separate from production. Run contributor build code
without Cloudflare account credentials. A trusted deployment job can upload its
artifacts. Any Convex credential needed while bundling/deploying PR code must be
scoped to preview resources. Never use the production key for PR builds.

Production requires both an explicit owner-triggered workflow and the GitHub
`Production` environment's approval from `bentsignal`. Admin bypass is disabled.
An agent acting through Shawn's GitHub CLI can request and approve that release
when Shawn authorizes it. A skill should guide the operation; GitHub enforces it.

Pin production promotion to the commit tested on stable preview. Do not silently
release a newer main commit that arrived after Shawn tested the preview.

## Authentication

PR previews should support test-username sign-in with real sessions in their own
database, without registering Google callbacks for every temporary deployment.
The current development sign-in endpoint is Vite-only; deployed preview sign-in
still needs implementation. Stable preview should support Google testing with a
fixed callback. Production retains its existing Google configuration.

## Foundation completed

- Renamed Convex project ID `2945745` to `games`, slug `games`, in team `BSX`,
  team ID `185568`. Existing production and development deployments were retained.
- Verified preview provisioning by creating the stable, non-expiring preview
  deployment `chatty-okapi-416`, reference `BSX:games:preview/preview`.
  This backend has not yet been populated or connected to a frontend.
- Paused automatic production releases, changed the release job to explicit
  owner dispatch, and configured the Production environment's owner approval.
- Updated local setup's default project reference to `BSX:games`.

## Remaining implementation

- Preview-scoped credentials and the trusted-contributor gate.
- Stable preview frontend, Grams Worker, auth configuration, and main deployment.
- PR provisioning, status links, deployed test sign-in, and cleanup.
- Promotion of a tested preview commit, plus a short production-release skill.
- Live verification with a trusted PR, an untrusted PR, and a manual promotion.

No PR previews or automatic main-to-preview deployment are active yet. The existing
manual production command still targets current main; tested-commit promotion
must be implemented before calling the new workflow complete.
