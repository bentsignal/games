# Games

[games.bentsignal.com](https://games.bentsignal.com)

- **Ticket to Ride** — `/ticket`
- **Grams** — `/grams`

React/Vite on Vercel; Ticket to Ride, accounts, and results on Convex; Grams gameplay on Cloudflare Durable Objects. Service packages are pnpm workspaces, coordinated by Turborepo.

```sh
pnpm install --frozen-lockfile
pnpm exec convex login
pnpm run setup
pnpm run dev
```

Use Node 24+. Choose the existing Games project when setup prompts. Setup creates an isolated Convex development deployment for this checkout, expiring in seven days, and configures local auth and the Grams Worker. No Google OAuth client or Cloudflare login is needed.

`pnpm run dev` starts all three services. Open the printed frontend URL and use **Development sign-in** with any test username. Production and stable development keep Google sign-in. Stop all three processes with Ctrl-C.

```sh
pnpm test
pnpm run typecheck
pnpm run grams:test
pnpm run build
```

Run `pnpm run doctor` to check local configuration. See [development setup](docs/development.md) for worktrees, auth, HTTPS trust, NixOS, and expiration. The [working roadmap](docs/setup-roadmap.tmp.md) tracks the four infrastructure stages.

Frontend code remains in `src/` and `public/`. Convex lives in `services/convex/convex/` and the Worker in `services/grams/`. Root `convex.json` preserves root-level Convex CLI commands; the frontend build still produces root `dist/` for Vercel.

Grams assets live in `public/grams-assets/v1`; source credits are in [docs/grams](docs/grams/). Hosting notes: [costs and retention](docs/costs-and-retention.md).

Grams server setup and deployment: [docs/grams/realtime.md](docs/grams/realtime.md).
