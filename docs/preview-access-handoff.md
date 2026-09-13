# Stable preview access handoff

The stable preview infrastructure and pipeline are configured in `bentsignal/games`.
The two access steps below are complete as of 2026-09-13.
Do not deploy production or change its resources.

## Completion evidence

- Created account-owned token `games-github-actions-preview` in the specified
  Cloudflare account, with no expiration and exactly Pages Write, Workers Scripts
  Write, and Account Settings Read. No DNS or token-management permissions.
- Copied the token directly from Cloudflare into GitHub's `Preview` environment
  secret `CLOUDFLARE_API_TOKEN`. GitHub confirmed the saved secret on 2026-09-13.
  No credential values were written to the repository or logs.
- Verified Preview remains restricted to protected branches, currently `main`,
  with required reviewers and the wait timer disabled.
- Added the exact preview callback below to the existing Google OAuth `web`
  client in project `ticket-to-ride-507915`, preserving all three existing URIs.
  Google confirmed the OAuth client was saved. No client credentials were rotated.
- Tested real Google sign-in in Helium at `https://preview.games.bentsignal.com`.
  Google returned successfully to the preview's authenticated username setup
  screen. The previous `redirect_uri_mismatch` is resolved.

The implementation agent can now perform the activation and CI verification in
the final section. Production resources and approval rules were not changed.

## Cloudflare credential for GitHub Preview

1. In Cloudflare account `12f3bac77e8f2b140391cd4f79c766ad`, create a persistent
   API token for GitHub preview deployments. It needs Cloudflare Pages Edit and
   Workers Scripts Edit, plus Account Settings Read for Wrangler account lookup.
   Restrict it to this account. Do not add DNS or account-token-management access.
2. Save it directly as secret `CLOUDFLARE_API_TOKEN` in the `Preview` environment
   of GitHub repository `bentsignal/games`. Do not put it in a PR, chat, or log.
   `CONVEX_DEPLOY_KEY` and variable `CLOUDFLARE_ACCOUNT_ID` are already configured.
3. The Preview environment must remain restricted to protected branches, with no
   manual approval requirement. Production's approval rules must remain unchanged.

This computer's Wrangler OAuth login can deploy locally, but its access expires
and it cannot create persistent tokens. GitHub does not expose stored secret
values, so the existing Production token cannot simply be read through `gh`.

## Google callback

In the Google OAuth web client already used by games production, add this exact
Authorized redirect URI, preserving all existing entries:

```text
https://chatty-okapi-416.convex.site/oauth/google/callback
```

The preview backend already has that client's ID and secret. Do not rotate them.
The frontend returns to `https://preview.games.bentsignal.com`, which is already
allowed by the preview backend. Test Google sign-in there with a real account.
If the OAuth consent screen is in testing mode, use an existing permitted tester.

## Return to this agent

Report that the GitHub Preview secret is saved and the Google callback is added.
Do not report credential values. The implementation agent will enable repository
variable `STABLE_PREVIEW_ENABLED=true`, dispatch CI on `main` with `release=false`,
watch all checks and deployment stages, and verify the resulting preview SHA.
Normal main pushes then deploy automatically. Production remains manual.
