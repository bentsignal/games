# Contributing

Follow [development setup](docs/development.md) to install dependencies and create
an isolated Convex development deployment. Each checkout has its own database.
Use a feature branch and open a pull request targeting `main`.

Before opening or updating the PR, run:

```sh
pnpm run format
pnpm run check
```

`check` runs the same six checks as CI, in parallel:

| Check                                  | Command                 |
| -------------------------------------- | ----------------------- |
| TypeScript, frontend and both services | `pnpm run typecheck`    |
| Lint                                   | `pnpm run lint`         |
| Formatting                             | `pnpm run format:check` |
| Unit and setup regression tests        | `pnpm test`             |
| Local Grams Worker integration         | `pnpm run grams:test`   |
| Production frontend build              | `pnpm run build`        |

Oxlint enforces correctness rules for TypeScript, JavaScript, and React. Its
warnings fail CI. React effect-dependency and compiler migration rules are deferred
in `.oxlintrc.json`; adopting them needs a separate refactor of the existing UI.
Unused-variable checks exclude the imported Grams assets. Generated Convex files
are excluded from linting. Prettier exclusions are listed in `.prettierignore`.

Run `pnpm run test:e2e:smoke` with the development server running when changing
sign-in, game behavior, or networking. These browser tests use your disposable
Convex backend. They are not part of public PR CI yet: PR checks need no cloud
credentials and cannot deploy. Disposable browser-test environments are future
work.

CI runs on pull requests to `main` and pushes to `main`. All six jobs run on
standard GitHub-hosted Linux runners, use the pnpm dependency cache, and have
10-minute timeouts. A newer push cancels the previous run for that PR. There are
no paid larger runners, uploaded build artifacts, or cloud browser backends.

All six checks and resolved review conversations are required before merging.
An approving review is welcome but not mandatory, so the owner can merge solo
work. Keep PRs focused and describe the behavior changed and how you tested it.
Merge through a PR; do not push directly to `main` or force-push it.

After merging to main, the same workflow waits for the six checks and releases
Convex, the Grams Worker, and the Cloudflare Pages frontend. Vercel Git deployments
are disabled. PR previews on Cloudflare are future work; use the isolated local
environment for now. See [production releases](docs/releases.md) for release
status, credentials, smoke checks, and recovery. Release manifests are retained
for 30 days; PR checks do not upload artifacts or receive production secrets.
