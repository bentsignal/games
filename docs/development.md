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
`BSX:ticket-to-ride` project, so a fresh clone needs no project selection. For a
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
https://<checkout-id>.games.bentsignal.local
https://<checkout-id>.grams.bentsignal.local
```

Each checkout has different URLs and a separate Convex database. Worker SQLite
state lives under `.dev/worker/<convex-deployment>/`, so replacing an expired
backend also starts with separate Worker state. Do not copy `.env.local`, `.dev/`,
or Worker secrets between worktrees. Run `pnpm install --frozen-lockfile` and `pnpm run setup` in each.

Portless uses LAN mode and advertises these `.local` names through mDNS. The
browser uses standard HTTPS port 443, so no port suffix is needed. Linux needs
Avahi with user publishing enabled; other devices need mDNS support and access to
the same LAN. The firewall must allow HTTPS on the LAN interface and mDNS.
Ctrl-C stops the app processes; the shared proxy daemon stays available.

This machine also runs Tailscale Serve on its own address at port 443. To preserve
that service, NixOS's `games-lan-https.socket` listens on `10.0.0.16:443` and
`127.0.0.1:443`, forwarding TCP to Portless on 1355. The machine configuration
`~/.config/games/network.json` contains `{"proxyPort":1355}` for this machine. Public app
origins still use 443. Portless's own internal route logs will show 1355. Other
machines default to Portless directly on 443 and need no forwarding service.
If this machine's LAN address changes, update the socket address in
`/etc/nixos/configuration.nix` and run `sudo -n nixos-rebuild switch`.

Before switching an existing proxy between localhost and LAN modes, stop the
apps and that proxy. Keep other projects using the shared proxy in mind. Then
rerun `pnpm run setup` to update this checkout's URLs and allowed auth/Worker
origins, and start it with `pnpm run dev`.

### HTTPS on another computer

Trust the serving machine's public Portless CA on each client computer. Copy it
from this machine, for example with:

```sh
scp shawn@work.local:/home/shawn/.portless/ca.pem ./games-portless-ca.pem
```

On macOS, import it into the System keychain and set it to Always Trust. On
Windows, import it into Trusted Root Certification Authorities. On Linux, add
it to the system's CA store or the browser's certificate authorities. Restart
the browser afterward. Copy only `ca.pem`, never `ca-key.pem`. This trust covers
both the frontend and Grams Worker; it does not transfer automatically when you
open the URL from another computer.

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
requires the configured HTTPS origin.

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

## HTTPS and NixOS

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

The local Worker launcher passes NixOS's system certificate bundle to Miniflare
via `NODE_EXTRA_CA_CERTS`, so result delivery to Convex can verify HTTPS. An
explicit `NODE_EXTRA_CA_CERTS` value takes precedence.

Apply with `sudo -n nixos-rebuild switch`. Generate the Portless CA and copy its
public certificate into the NixOS configuration directory:

```sh
# On this machine, add --port 1355 because the LAN listener forwards 443.
pnpm exec portless proxy start --https --lan
sudo -n cp ~/.portless/ca.pem /etc/nixos/games-portless-ca.pem
```

Add `security.pki.certificateFiles = [ ./games-portless-ca.pem ];` and rebuild
again. Copy only the public CA, never `ca-key.pem`; keep machine-specific
certificates out of Git. Browsers with a separate trust store may also need that
public CA imported there.

## Checks

- `pnpm run doctor`: checks Node, workerd, and local configuration without network
  access. It cannot detect expiration or revoked login; the next Convex push does.
- `pnpm test`: unit and setup regression tests, without cloud credentials.
- `pnpm run typecheck`: all current TypeScript projects through Turbo.
- `pnpm run grams:test`: local sockets, hibernation, and persistence.
- `pnpm run build`: root `dist/` output for Vercel; does not deploy.
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
