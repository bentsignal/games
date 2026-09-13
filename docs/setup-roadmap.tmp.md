# Development workflow roadmap

Working plan, 2026-09-12. Keep this file updated across sessions; fold it into
permanent contributor/release documentation as the work lands.

## 1. Fresh-clone local development (complete)

- Introduce a minimal Turborepo workspace layout, using ../ruby as a reference.
- One command starts the frontend, Convex watcher, and local Grams Worker.
- Each checkout gets an isolated cloud dev deployment with seven-day expiration.
- Temporary deployments use dummy test sign-in with real Convex sessions. Stable
  development and production retain real Google OAuth; no wildcard callbacks.
- Document deployment selection, environment variables, local HTTPS, and secrets.
- Diagnose missing setup clearly and fix the NixOS workerd runtime.
- Preserve existing builds, tests, and production deployment behavior.
- Defer splitting individual game packages and Ruby's full lint rules until later.

## 2. Reliable PR checks (complete)

- Unified local check command; CI includes frontend/Convex and Worker checks.
- Require checks on main and establish review/contribution guidance.
- Add reproducible browser tests with a development-only environment.
- Keep architecture, commands, and release rules in repository AGENTS.md.

## 3. Automated production releases

- GitHub Actions coordinates verified main commits: Convex, Worker, frontend.
- Move the frontend from Vercel to Cloudflare Pages in this stage.
  Defer Ticket to Ride live-state migration until after the infrastructure work.
- Configure production credentials, serialized releases, and smoke checks.
- Reconcile provider auto-deploy settings to avoid duplicate releases.
- Document compatible backend rollouts and recovery after partial releases.

Access checkpoint, 2026-09-13: local provider logins verified. GitHub's existing
`Production` environment is restricted to protected branches and contains the
Convex production deploy key, Cloudflare account ID variable, and Cloudflare CI
token. The account-owned Workers token has no expiration; read-only verification
confirmed it is active and belongs to the expected account. It has account
permissions only. `bentsignal.com` is managed at Vercel and must remain registered
there; it is not a zone in this Cloudflare account. Confirm supported domain
routing before cutover. See [deployment access handoff](deployment-access-handoff.md)
for the permission list and completion evidence. Production code, domains, and
Vercel deployment integration remain unchanged. Release validation is pending;
stage 3 is not complete.

Hosting decision: use Cloudflare Pages direct upload so registration and DNS stay
at Vercel. Only the games hostname changes. A coordinated release job and recovery
documentation are being implemented; see [releases](releases.md).

## 4. Staging and incremental refactoring

- Stable staging environment for frontend, Convex, and Grams, then PR previews.
- Environment-aware OAuth origins, Worker origins, and secrets.
- Extract game packages and shared code so Turbo can check affected packages.
- Adopt useful TypeScript/lint/tooling conventions from Ruby incrementally.

## Baseline

- pnpm install --frozen-lockfile succeeds with Node 24; 57 unit tests, frontend build, Worker types pass.
- Worker integration test fails: NixOS cannot execute downloaded workerd.
- Existing CI runs pnpm test and pnpm run build, with no deployment jobs.
- No tracked local environment configuration or production changes made yet.

## Implementation checkpoint (2026-09-12)

Implemented locally:

- pnpm workspaces in services/convex and services/grams, with Turbo startup and
  type-check tasks. Frontend remains at root pending game-package extraction.
- Root convex.json preserves CLI behavior; Vercel still builds root dist/.
- setup/doctor/dev commands, per-checkout HTTPS origins and per-deployment Worker
  storage, private local env files, isolated deployment creation with expiration.
- Local Vite-only development sign-in using internal Convex session fixtures.
  Production UI excludes it; existing stable development fixtures remain supported.
- NixOS nix-ld/OpenSSL enabled and Portless public CA trusted declaratively on
  this machine. Backup: /etc/nixos/configuration.nix.before-games-dev.
- Portless uses HTTPS 1355 with .localhost names because Tailscale occupies 443.
- Setup/auth regression tests, development docs, and repository AGENTS.md.

Validation after a clean pnpm install --frozen-lockfile:

- 62 Vitest tests and 3 setup regression tests pass.
- All three TypeScript projects pass through Turbo.
- Grams runtime integration passes (sockets, hibernation, persisted recovery).
- Production build passes with VITE_DEV_AUTH=1; built JavaScript contains neither
  the development sign-in UI nor its local endpoint.
- System certificate verification trusts the Portless CA; missing-setup commands
  fail early with setup instructions. No cloud credentials used in these checks.

## Live verification (2026-09-12)

- Convex CLI login works. Confirmed project `BSX:ticket-to-ride`; setup now uses
  that default on a fresh clone. Other installations can override it.
- Created the isolated seven-day deployment `neighborly-caribou-246`. Re-running
  setup succeeds without replacing its auth keys or realtime secret.
- All three services start together. This checkout's frontend is
  `https://44e18c71.games.bentsignal.localhost:1355`; Grams uses
  `https://44e18c71.grams.bentsignal.localhost:1355`.
- Installed Chromium and its NixOS runtime libraries. Browser tests exercise the
  actual Development sign-in form, refresh, sign-out, and invitation URLs with
  real sessions in the isolated database. No Google account is involved.
- Ticket to Ride multiplayer passes with two independent accounts, including
  joining, ticket choices, chat, drawing cards, and reconnecting.
- Found and fixed the Worker's Convex mutation HTTP encoding and NixOS outbound
  certificate configuration while testing Grams. The full-round browser test now
  checks database persistence as well as the UI.
- Added `pnpm run test:e2e:smoke` and documented it for agents.
- Current checks pass: 65 unit/setup tests, all TypeScript projects, Worker
  runtime integration, and the frontend production build.

Step 1 is complete. All five browser smoke tests pass, including completed-round
persistence in Convex. The Worker also delivered the two previously queued rounds
after the fix. Ctrl-C stops the app processes; `pnpm run dev` starts them again
against the same isolated database and Worker storage. The shared Portless proxy
keeps running. Next is step 2, reliable PR checks.

No production deployments, shared deployment auth settings, Google settings, or
GitHub settings have been changed. Stages 2–4 remain planned, apart from shared
documentation and local test additions needed for stage 1.

## Follow-up changes

- Switched to pnpm 10.34.5, imported the dependency lock, and updated workspace
  commands, CI, Vercel configuration, scripts, and setup documentation.
- Clean frozen pnpm installation, all 65 tests, type checks, frontend build, and
  Worker integration pass. Convex login and live verification followed above.
- Added a short AGENTS.md instruction to commit verified work and push without
  reminders.
- Vendored Cursor's pstack unslop skill into .agents/skills/unslop, with its
  upstream commit and MIT license.

## LAN access follow-up

- Switched generated app URLs to `.local` on standard HTTPS, with Portless LAN
  discovery. Setup updates the existing temporary backend's origins.
- Development sign-in accepts same-origin LAN requests via the loopback proxy.
- Enabled Avahi user publishing and full `.local` resolution on NixOS.
- Preserved Tailscale Serve on its existing address. A declarative TCP forwarding
  socket accepts LAN/loopback port 443 and passes it to Portless on 1355.
- Machine-specific forwarding state lives in `~/.config/games/network.json`, shared
  across worktrees; other
  machines default to Portless directly on 443. See development docs for the
  client CA trust step and the forwarding socket's LAN address dependency.
- Verified mDNS resolves both names to `10.0.0.16`, HTTPS responds on LAN port
  443, and the five browser smoke tests pass at the new origins. All 66 unit/setup
  tests, type checks, and the production build pass.

## HTTP LAN follow-up

- Changed LAN development to `http://<checkout-id>.games.bentsignal.local` and
  the matching Grams hostname. Portless uses `--no-tls`; browsers need no CA import.
- Reconfigured the NixOS forwarding socket and LAN firewall for port 80. Removed
  the previous games HTTPS listener while preserving Tailscale Serve.
- Updated the existing temporary deployment's allowed origins. Cloud Convex and
  production Google auth connections still use HTTPS.
- Replaced the frontend's HTTPS-only UUID calls with random UI IDs generated by
  `crypto.getRandomValues`. The sign-in browser test also changes mode and timer,
  then reloads to check persistence. Clipboard failures already show a manual-copy
  instruction. The previous certificate setup instructions are superseded.
- Verified the browser runs in an actual insecure HTTP context without
  `crypto.randomUUID`. All five browser smoke tests pass, including mode/timer
  persistence and Grams result delivery. All 66 unit/setup tests, type checks,
  and the build pass.

## PR checks implementation

- Made `bentsignal/games` public after scanning all 46 existing commits with
  Gitleaks; it reported no credentials. Local env and deployment keys stay ignored.
- Added six parallel, credential-free CI jobs: Typecheck, Lint, Format, Tests,
  Worker integration, and Build. Standard Linux runners, pnpm caching, 10-minute
  limits, and cancellation of superseded PR runs keep resource use bounded.
- Added `pnpm run check`, Oxlint correctness checks, Prettier check/fix commands,
  contributor docs, and a PR template. React effect/compiler migration rules and
  cloud-backed browser CI remain deferred explicitly in CONTRIBUTING.md.
- Fixed unused bindings and a Grams reset handler that reassigned a `const`.
- All six local checks and five browser smoke tests pass. PR #1 ran all six
  independent GitHub jobs successfully. Main now requires those six GitHub Actions
  checks, an up-to-date branch, and resolved conversations. PRs are mandatory,
  rules include admins, force pushes/deletion are blocked, and approving reviews
  remain optional for solo work.
- Found an existing Vercel GitHub integration that deploys previews and production.
  Earlier notes saying no automatic deployments were inaccurate. This CI adds no
  deployment jobs; step three must coordinate the existing Vercel integration with
  Convex and Cloudflare. Step two is complete once this verified PR is merged.
