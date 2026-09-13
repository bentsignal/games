---
name: database-isolation
description: Use when making fundamental changes to the Convex schema, database, or backend behavior.
---

# Database isolation

Use a disposable Convex backend and database for changes that could disrupt other
developers' code or data. Do not create a database just because a new worktree
exists; frontend-only work can use an existing working development environment.

Convex can create separate deployments under the same project. The repo's setup
command wraps the Convex CLI and configures the frontend and local Worker to use
the selected deployment:

```sh
pnpm run setup --new
```

This creates a fresh, seven-day deployment for the current checkout. Plain
`pnpm run setup` reuses this checkout's deployment when one exists. The helper
currently manages deployments per checkout; it does not support sharing one by
copying setup state between worktrees.

For direct CLI operations, start with `pnpm exec convex deployment create --help`.
Use an explicit deployment target so schema experiments do not affect shared dev
or production. Temporary deployments support test-username sign-in with real
Convex sessions; Google sign-in testing belongs on a stable deployment.

Consult the development docs for setup details. Releasing the finished change is
handled by the normal PR and GitHub Actions workflow.
