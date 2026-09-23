# Development setup

## First run

Install Node 24+ (see `.nvmrc`), Git, and OpenSSL. Enable pnpm with
`corepack enable pnpm`; the repository pins pnpm 10.34.5. On NixOS, use
`corepack enable --install-directory ~/.local/bin pnpm` with `~/.local/bin`
on PATH, since the Nix store is read-only. Then:

```sh
pnpm install --frozen-lockfile
pnpm exec convex login
pnpm run setup
pnpm run dev
```

Log into an account with access to the BSX team. Setup defaults to the existing
`BSX:games` project, so a fresh clone needs no project selection. For a
separate installation, set `GAMES_CONVEX_PROJECT=team-slug:project-slug` before
running setup. Slugs are case-sensitive; the team's actual slug is `BSX`.

Setup creates a **dev** deployment with a reference based on your username,
checkout directory, and a random suffix, expiring **in seven days**. Convex
generates its API/site URLs; setup uses those URLs without custom DNS.

Setup writes ignored local configuration and the new backend's environment
variables. It never runs a production deploy. No Cloudflare login or Google OAuth
client is needed for local development.

## Daily use and worktrees

`pnpm run dev` checks configuration, completes the initial Convex development push,
then starts three persistent Turbo tasks. Open the frontend URL it prints:

```text
http://<checkout-id>.games.bentsignal.local
http://<checkout-id>.grams.bentsignal.local
```

Each checkout has different URLs and a separate Convex database. Worker SQLite
state lives under `.dev/worker/<convex-deployment>/`, so replacing an expired
backend also starts with separate Worker state. Do not copy `.env.local`, `.dev/`,
or Worker secrets between worktrees. Run `pnpm install --frozen-lockfile` and `pnpm run setup` in each.

Portless uses HTTP LAN mode and advertises these `.local` names through mDNS.
The browser uses port 80, so no port suffix or certificate installation is needed.
Linux needs Avahi with user publishing enabled; other devices need mDNS support
and access to the same LAN. The firewall must allow HTTP on the LAN interface
and mDNS. Ctrl-C stops the apps; the shared proxy daemon stays available.

This machine uses NixOS's `games-lan-http.socket` on `10.0.0.16:80` and
`127.0.0.1:80`, forwarding TCP to Portless on 1355. The machine configuration
`~/.config/games/network.json` contains `{"proxyPort":1355}`, shared by all
worktrees. Browser origins use port 80; Portless's internal route logs show 1355.
Other machines default to Portless directly on 80 and need no forwarding service.
If this machine's LAN address changes, update the socket address in
`/etc/nixos/configuration.nix` and run `sudo -n nixos-rebuild switch`.
Tailscale Serve retains its separate HTTPS listener.

When switching an existing checkout from HTTPS, stop its apps and the proxy,
then rerun `pnpm run setup` and `pnpm run dev`. This updates frontend, auth, and
Worker origins without replacing the database. Use the explicit `http://` URL.
Browser sessions are origin-specific, so sign in again after switching schemes.

HTTP is for this trusted-LAN setup with disposable test accounts. Production and
stable Google sign-in deployments remain HTTPS. Cloud Convex connections also
remain HTTPS. HTTP does not encrypt traffic between the browser and local server.
Browser clipboard access may be unavailable; the app then asks you to copy the
room link from the address bar. UI identifiers use `crypto.getRandomValues`,
which works on HTTP origins.

`pnpm run setup` reuses this checkout's deployment and repairs configuration; it
does not extend expiration. After expiration, or to start with empty data:

```sh
pnpm run setup --new
pnpm run dev
```

The previous backend is left to expire. Temporary data is disposable; keep
important data in a durable environment. The stable development deployment is
reserved for shared integration and Google sign-in testing.

Individual services: `pnpm run dev:web`, `pnpm run backend`, `pnpm run grams:dev`.
Run setup first. `pnpm run dev:direct` remains bare Vite, but development sign-in
requires the configured app origin.

## Authentication

Temporary deployments use **Development sign-in**: choose a test username to get
a real Convex Auth session in that database. The local Vite server uses your
Convex CLI authorization to call the existing internal test-session fixture.
Account lookup, session refresh, and game authorization work normally. This does
not test Google's consent screen or OAuth callback.

The helper only runs in Vite's development server. Setup writes `GAMES_DEV_LAN=1`
to allow same-origin login through the local proxy from other LAN devices. The
Vite backend still binds loopback, and the helper checks the exact configured
Origin, JSON content type, and username. Anyone who can reach this development
app can choose a test username in its disposable database. The fixture remains an internal Convex mutation, not a public login
endpoint. Setup opts in the temporary backend by setting `GAMES_DEV_SITE_URL` to
its own site URL. Never configure this variable in production. Production builds
always show Google sign-in, even if the local flag is present during the build.

Production and stable development retain Google. Google requires exact callback
URLs; wildcard callback domains are not supported. The installed Convex Auth 2
alpha derives its callback from the deployment's site URL and exposes no callback
proxy option. A shared callback service can be added later if every preview needs
real Google OAuth.

For a separate permanent installation, its owner configures
`AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_PRIVATE_KEY`, and
`AUTH_JWKS` in Convex, registers the exact site URL plus `/oauth/google/callback`
with Google, and allows the frontend origin in `auth.ts`.

Convex project environment defaults can prepopulate new dev deployments; they do
not synchronize changes into existing ones. Setup generates signing keys and a
realtime secret when absent. It uses nonfunctional Google placeholders when no
Google defaults exist, because temporary deployments do not use Google.

## Configuration inventory

| Location                               | Values                                                                                                  | Managed by               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| Root `.env.local`                      | `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`                                          | Convex selection         |
| Root `.env.local`                      | `VITE_GRAMS_URL`, `GAMES_WEB_ORIGIN`, `VITE_DEV_AUTH`, `GAMES_DEV_LAN`                                  | Setup                    |
| `.dev/setup.json`                      | Checkout/deployment identity and creation reference                                                     | Setup                    |
| `services/grams/.dev.vars.development` | `CONVEX_URL`, `ALLOWED_ORIGINS`, `GRAMS_REALTIME_SECRET`                                                | Setup                    |
| Temporary Convex environment           | Signing keys, realtime secret, `GAMES_DEV_SITE_URL`, `GAMES_DEV_WEB_ORIGIN`, Google values/placeholders | Setup / project defaults |

Only `VITE_*` variables are exposed to the browser. Never prefix a secret with
`VITE_`. Setup captures secret-bearing CLI output and writes local environment
files with owner-only permissions. Local tooling rejects production deploy-key
and self-hosted overrides.

## NixOS runtime

Portless generates a local CA at `~/.portless/ca.pem`. On supported systems it
offers to trust it; `pnpm exec portless trust` retries. OpenSSL must be on PATH. Restart
the browser after changing trust.

On NixOS, downloaded workerd needs nix-ld. Merge these settings into
`/etc/nixos/configuration.nix`:

```nix
programs.nix-ld = {
  enable = true;
  libraries = with pkgs; [
    stdenv.cc.cc zlib openssl glib nss nspr dbus atk at-spi2-atk
    at-spi2-core cups libdrm libxkbcommon libgbm mesa expat pango cairo alsa-lib
    libx11 libxcomposite libxdamage libxext libxfixes libxrandr libxcb
  ];
};
environment.systemPackages = with pkgs; [ nodejs_24 openssl git ];
```

The local Worker launcher passes the system certificate bundle to Miniflare
via `NODE_EXTRA_CA_CERTS` when `/etc/ssl/certs/ca-certificates.crt` exists, so
result delivery to Convex can verify HTTPS. An explicit `NODE_EXTRA_CA_CERTS`
value takes precedence.

Apply with `sudo -n nixos-rebuild switch`. No Portless CA or client certificate
trust is needed for HTTP development. Keep system CA certificates available for
the Worker's outbound HTTPS connection to Convex.

## Checks

- `pnpm run doctor`: checks Node, workerd, and local configuration without network
  access. It cannot detect expiration or revoked login; the next Convex push does.
- `pnpm test`: unit and setup regression tests, without cloud credentials.
- `pnpm run typecheck`: all current TypeScript projects through Turbo.
- `pnpm run grams:test`: local sockets, hibernation, and persistence.
- `pnpm run build`: root `dist/` static output; does not deploy. GitHub Actions
  publishes production to Cloudflare Pages; see [releases](releases.md).
- `pnpm run test:e2e`: requires `pnpm run dev`, Playwright browser dependencies,
  and Convex CLI login. URLs/auth storage derive from `.env.local`.

For service-only checks use `pnpm exec turbo run typecheck --filter=@games/grams` or
`--filter=@games/convex`. Shared game code still lives under `src/game` and
invalidates both services' caches. Fine-grained game checks await extraction of
game packages; Turbo alone cannot separate coupled TypeScript imports.

Sources: [Convex deployment creation](https://docs.convex.dev/cli/reference/deployment),
[environment defaults](https://docs.convex.dev/production/environment-variables),
[Google redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

## Agent browser testing

Agents use the same Development sign-in form as teammates. Enter a test username
and submit it; no Google account is needed. The session belongs to that checkout's
Convex database. Separate browser contexts can use different test usernames to
exercise multiplayer behavior. The CLI login authorizes the local test-session
helper, so each machine still needs a Convex team login once.

Install the test browser with `pnpm exec playwright install chromium`. On Ubuntu
CI, use `pnpm exec playwright install --with-deps chromium`; on NixOS use the
libraries listed above. Run the development server in one terminal, then:

```sh
pnpm run test:e2e:smoke
```

The smoke suite covers the actual form, session persistence after refresh,
sign-out, invitation URLs, a full Grams round saved to Convex, and Ticket to Ride
multiplayer. Existing game tests use the same internal session fixture through
`tests/e2e/auth.ts`. These sessions are real Convex Auth sessions, not mocked
frontend state. Google OAuth remains a separate check on stable development.

### NixOS LAN discovery

Merge these with the existing Avahi configuration, then rebuild:

```nix
services.avahi = {
  enable = true;
  nssmdns4 = true;
  nssmdnsFull = true;
  publish.enable = true;
  publish.userServices = true;
};
environment.etc."mdns.allow".text = ".local\n.local.\n";
```

The full resolver and `mdns.allow` support checkout hostnames with multiple labels.
On NixOS the launcher disables Portless's `/etc/hosts` sync, since NixOS manages
that file. Avahi provides resolution on this machine and publishes names to LAN
clients. See [Portless LAN mode](https://github.com/vercel-labs/portless#lan-mode).

## Ticket to Ride backend

Ticket to Ride now shares the local Worker with Grams, using a separate Durable
Object per room. Setup and launch commands are unchanged. Convex keeps auth and
completed-game statistics. See [Ticket realtime server](ticket-realtime.md) for
room storage, the cutover, and verification commands.
