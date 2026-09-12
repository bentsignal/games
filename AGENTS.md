# Games

- Read `docs/development.md` for local setup and `docs/setup-roadmap.tmp.md` for
  the active four-stage infrastructure plan. Update roadmap progress as work lands.
- pnpm workspaces + Turbo. Frontend remains at the root; services are in
  `services/convex` and `services/grams`. Root `convex.json` selects the functions.
- `pnpm run setup` provisions an isolated, seven-day Convex dev deployment per
  checkout. `pnpm run dev` starts all three services. `pnpm run doctor` is local-only.
- Development URLs use Portless LAN mode at `http://<checkout-id>.games.bentsignal.local`.
  Read the NixOS forwarding and HTTP development notes in `docs/development.md`.
- Temporary deployments use local test sign-in; stable development/production use
  Google. Never configure `GAMES_DEV_SITE_URL` on production.
- Agents can use Development sign-in with a test username, without Google. With
  the dev server running, use `pnpm run test:e2e:smoke` to check auth and both games.
- Keep secrets in ignored environment files and Convex. Never print env values,
  session tokens, or CLI credential files into logs or documentation.
- Run `pnpm run format` and `pnpm run check` before opening or updating a PR.
  The six CI checks run in parallel; see `CONTRIBUTING.md` for their scope.
- Local builds and CI do not deploy. Vercel already deploys GitHub PR previews
  and main to production. Coordinated Convex/Worker/frontend releases are step 3.

- Own the Git workflow: commit verified changes and push them without waiting for
  reminders. Push feature branches and open PRs to `main`; all six checks must pass
  before merging. Keep unrelated work out of commits and never force-push by default.
