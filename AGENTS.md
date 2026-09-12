# Games

- Read `docs/development.md` for local setup and `docs/setup-roadmap.tmp.md` for
  the active four-stage infrastructure plan. Update roadmap progress as work lands.
- pnpm workspaces + Turbo. Frontend remains at the root; services are in
  `services/convex` and `services/grams`. Root `convex.json` selects the functions.
- `pnpm run setup` provisions an isolated, seven-day Convex dev deployment per
  checkout. `pnpm run dev` starts all three services. `pnpm run doctor` is local-only.
- Temporary deployments use local test sign-in; stable development/production use
  Google. Never configure `GAMES_DEV_SITE_URL` on production.
- Agents can use Development sign-in with a test username, without Google. With
  the dev server running, use `pnpm run test:e2e:smoke` to check auth and both games.
- Keep secrets in ignored environment files and Convex. Never print env values,
  session tokens, or CLI credential files into logs or documentation.
- Validate relevant changes with `pnpm test`, `pnpm run typecheck`, and
  `pnpm run build`; use `pnpm run grams:test` for Worker/runtime changes.
- Builds do not deploy. Automated releases are a later roadmap step; keep
  production settings and release commands explicit and documented.

- Own the Git workflow: commit verified changes and push them without waiting for
  reminders. Keep unrelated work out of commits and never force-push by default.
