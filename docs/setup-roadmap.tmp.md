# Development workflow roadmap

Working plan, 2026-09-12. Keep this file updated across sessions; fold it into
permanent contributor/release documentation as the work lands.

## 1. Fresh-clone local development (in progress)

- Introduce a minimal Turborepo workspace layout, using ../ruby as a reference.
- One command starts the frontend, Convex watcher, and local Grams Worker.
- Each checkout gets an isolated cloud dev deployment with seven-day expiration.
- Temporary deployments use dummy test sign-in with real Convex sessions. Stable
  development and production retain real Google OAuth; no wildcard callbacks.
- Document deployment selection, environment variables, local HTTPS, and secrets.
- Diagnose missing setup clearly and fix the NixOS workerd runtime.
- Preserve existing builds, tests, and production deployment behavior.
- Defer splitting individual game packages and Ruby's full lint rules until later.

## 2. Reliable PR checks

- Unified local check command; CI includes frontend/Convex and Worker checks.
- Require checks on main and establish review/contribution guidance.
- Add reproducible browser tests with a development-only environment.
- Keep architecture, commands, and release rules in repository AGENTS.md.

## 3. Automated production releases

- GitHub Actions coordinates verified main commits: Convex, Worker, frontend.
- Configure production credentials, serialized releases, and smoke checks.
- Reconcile provider auto-deploy settings to avoid duplicate releases.
- Document compatible backend rollouts and recovery after partial releases.

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

Outstanding to finish step 1:

- This machine has not completed Convex CLI login. The device flow expired.
- Run pnpm exec convex login, then pnpm run setup and choose the existing BSX Games
  project; verify the real project slugs and record them if useful.
- Validate actual deployment creation/provisioning, the combined dev command,
  browser development sign-in, and both games against that temporary backend.
- Full live verification is pending; mocked CLI/HTTP tests do not substitute for it.

No production deployments, project defaults, Google settings, or GitHub settings
have been changed. Stages 2–4 remain planned, apart from shared documentation and
local test additions needed for stage 1.

## Follow-up changes

- Switched to pnpm 10.34.5, imported the dependency lock, and updated workspace
  commands, CI, Vercel configuration, scripts, and setup documentation.
- Clean frozen pnpm installation, all 65 tests, type checks, frontend build, and
  Worker integration pass. Convex login remains pending for live verification.
- Added a short AGENTS.md instruction to commit verified work and push without
  reminders.
- Vendored Cursor's pstack unslop skill into .agents/skills/unslop, with its
  upstream commit and MIT license.
