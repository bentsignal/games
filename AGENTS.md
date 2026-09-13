# Games

- Keep standing instructions brief. Setup, architecture, and release details live
  in `docs/`; task-specific guidance lives in `.agents/skills/`. Consult as needed.
- Run `pnpm run format` and `pnpm run check` before pushing changes. Fix failures
  and confirm all required PR checks pass before reporting the work complete.
- Own Git: commit and push verified changes without reminders. Open a PR to
  `main` once the first verified changes are pushed, then keep updating that PR.
  Merge only after required checks pass. Keep unrelated work out of commits.
- Agents can use Development sign-in with a test username, without Google.
  Run `pnpm run test:e2e:smoke` for sign-in, gameplay, or networking changes.
- GitHub Actions handles deployments. Production requires an explicit release
  request from Shawn; ordinary development should not require provider deployments.
