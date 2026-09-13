# Deployment access handoff

Status as of 2026-09-13. This handoff prepares credentials for stage 3. The release
workflow and frontend migration are still pending.

## Already done

- Local Wrangler and Vercel logins work on Shawn's NixOS machine. Convex and
  GitHub CLI access also work.
- GitHub repository: `bentsignal/games`, public, with six required PR checks.
- Existing GitHub environment `Production` now allows protected branches only.
  `main` is protected. Future release jobs must use `environment: Production`.
- Created Convex key `games-github-actions-production`, scoped to
  `BSX:ticket-to-ride:prod`, and stored it as the `Production` environment secret
  `CONVEX_DEPLOY_KEY`. The temporary local key file was removed.
- Stored `CLOUDFLARE_ACCOUNT_ID` as a `Production` environment **variable**.
  Workflows must read `vars.CLOUDFLARE_ACCOUNT_ID`.
- Cloudflare account ID: `12f3bac77e8f2b140391cd4f79c766ad`.
- Existing Grams Worker: `games-grams`, with `GramsRoom` Durable Objects.
- Vercel project: `railbound-1910`, team scope `bsx-sh`. It currently serves
  `games.bentsignal.com` and still deploys GitHub previews and production.

## Computer-use agent task

Pull the latest `main` in this repository, preserving unrelated local changes.
Read `AGENTS.md` and this document. Shawn authorizes the credential setup below.
Use the logged-in Cloudflare dashboard to create the token and GitHub CLI or the
GitHub dashboard to store it. No credential needs to appear in chat.

1. Check whether `CLOUDFLARE_API_TOKEN` already exists in GitHub's `Production`
   environment. If it does, inspect the completion notes before creating another.
2. In the Cloudflare account above, open Account API tokens. Create a token named
   `games-github-actions-production` using the **Edit Cloudflare Workers** policy
   template. Scope it to this account. The original request also named the
   `bentsignal.com` zone; the completion notes below explain why zone permissions
   were omitted. Record the
   actual permission names and expiration below. If account-owned tokens are
   unavailable to this login, use a user-owned token with the same scope.
3. Transfer the token directly into GitHub repository `bentsignal/games`,
   environment `Production`, secret `CLOUDFLARE_API_TOKEN`. With `gh`, use
   `gh secret set CLOUDFLARE_API_TOKEN --repo bentsignal/games --env Production`
   and supply the value through its hidden prompt or standard input. Do not put
   the value in a shell command argument, tracked file, screenshot, or report.
4. Verify the token with a read-only Cloudflare request or Wrangler account check
   while it is available, capturing only success and account identity. Confirm
   GitHub lists the secret name. Remove any temporary credential file and clear
   the clipboard after transfer.
5. Update the completion notes and roadmap, then follow the repository's checks,
   commit, push, and PR process. Report the PR and any remaining blocker.

Use the scoped deployment token directly. A global API key or a token that can
mint other tokens is unnecessary. Do not add DNS editing privileges for this
credential-preparation task; assess those separately during domain cutover.

Do not deploy code, change DNS or Google OAuth, replace Durable Object namespaces,
rotate application secrets, or disconnect Vercel as part of this handoff. The
replacement frontend must be tested before its production domain moves.

## Verification commands

These print names and public configuration, not secret values:

```sh
gh secret list --repo bentsignal/games --env Production
gh variable list --repo bentsignal/games --env Production
gh api repos/bentsignal/games/environments/Production \
  --jq '.deployment_branch_policy'
```

Expected secrets after the handoff: `CONVEX_DEPLOY_KEY`, `CLOUDFLARE_API_TOKEN`.
Expected variable: `CLOUDFLARE_ACCOUNT_ID`. GitHub cannot return saved secret
values; listing proves storage, not deployment permission. The future release
workflow still needs end-to-end validation.

## Completion notes

- Completed 2026-09-13 using Computer Use in Helium. Created account-owned token
  `games-github-actions-production` in account
  `12f3bac77e8f2b140391cd4f79c766ad` and stored it through GitHub CLI standard input
  as `Production` secret `CLOUDFLARE_API_TOKEN`.
- Used the Edit Cloudflare Workers template with its zone policy removed. Actual
  account permissions: Workers KV Storage Write, Workers Scripts Write, Account
  Settings Read, Workers Tail Read, Workers R2 Storage Write, Pages Write, Workers
  CI Write, CF Agents Write, Workers Observability Write, Workers Containers Write.
- Expiration: none. No client IP restriction. No zone, DNS editing, or token
  creation permissions.
- The account's domain selector listed only `bsx.sh`; searching `bentsignal.com`
  returned no zones. Shawn clarified that `bentsignal.com` is registered and
  managed at Vercel and must remain registered there. The deployment token is
  account-only; domain routing and any needed permissions await the cutover plan.
- Read-only `GET /accounts/12f3bac77e8f2b140391cd4f79c766ad/tokens/verify`
  succeeded with status `active`. A read-only account request confirmed the same
  account ID and Shawn's account identity.
- GitHub lists both expected environment secrets and the account ID variable.
  `Production` still permits protected branches only. Saved secret listings do
  not prove deployment permission; release validation remains pending.
- Transferred the token in memory without a credential file or shell argument.
  Removed transient Computer Use captures of the creation dialog, closed that
  dialog, and cleared the clipboard after transfer. No credential value appears
  in these notes.
- No production code or domain changes were made during credential preparation.

## Next implementation

GitHub Actions will coordinate Convex and Cloudflare releases after the required
checks. Move the Vite frontend to Cloudflare Workers Static Assets, preserve the
existing Grams Durable Object state, and test routing, Google auth, and both games
before cutting over the domain and disabling Vercel's automatic deployments.
Keep `bentsignal.com` registered at Vercel. Confirm a supported Cloudflare hosting
and domain-routing configuration before changing DNS; the domain is not currently
a zone in this Cloudflare account. Credential preparation did not validate that
configuration.
Ticket to Ride's live-state migration remains deferred. Backend changes must stay
compatible across partial releases; reverting code does not revert database data.

References: [Cloudflare GitHub Actions authentication](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[Cloudflare token creation prerequisites](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/),
[Convex deploy-key CLI](https://docs.convex.dev/cli/reference/deployment).
