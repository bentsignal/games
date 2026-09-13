# Stable preview access handoff

The stable preview infrastructure and pipeline are configured in `bentsignal/games`.
Google callback setup and Cloudflare credential correction are complete. The
implementation agent can re-enable automatic preview deployment and verify CI.
Do not deploy production or change its resources.

## Required correction after CI verification

Completed 2026-09-13. Rolled the existing account-owned
`games-github-actions-preview` token without changing its account scope or
permissions. Before replacing the GitHub secret, verified the exact new token:

| API GET endpoint within the specified account   | HTTP status | success |
| ----------------------------------------------- | ----------- | ------- |
| `/pages/projects/bentsignal-games-preview`      | 200         | true    |
| `/workers/scripts/games-grams-preview/settings` | 200         | true    |

Saved the verified token value in GitHub's `Preview` environment after passkey
reauthentication. GitHub's secret metadata confirms `CLOUDFLARE_API_TOKEN` was
updated at `2026-09-13T22:38:08Z`. The prior transfer appears to have used
Cloudflare's token ID copy control instead of its separate token value control.
Use the actual bearer token value for future transfers.

Preview remains restricted to protected branches with no required reviewers.
`STABLE_PREVIEW_ENABLED` remains `false`; the implementation agent should now
re-enable it and verify a complete main run. Google and production were unchanged.

### Failure and correction requirements

The automatic main run [34781782265](https://github.com/bentsignal/games/actions/runs/34781782265)
passed all six checks and Convex preflight, then Cloudflare returned HTTP 400,
error code `9106`, for this request:

```text
GET https://api.cloudflare.com/client/v4/accounts/12f3bac77e8f2b140391cd4f79c766ad/pages/projects/bentsignal-games-preview
Authorization: Bearer <API token>
```

This endpoint succeeds with the implementation machine's local OAuth login. The
CI token is present and outer whitespace is trimmed, but Cloudflare rejects its
authentication. No provider deployment was changed by the failed runs.

Verify the actual token value and account scope. Replace the GitHub `Preview`
environment secret `CLOUDFLARE_API_TOKEN` with a working token as needed. Use the
API token value, not its name, ID, global API key, or a full Authorization header.
Before saving it, make the GET request above with that exact token and require
HTTP 200 with `success: true`. Also verify GET on the same account's
`/workers/scripts/games-grams-preview/settings`. Never print the token or the
settings response, which can contain binding values; report only status/success.

Retain the original account-scoped Pages Write, Workers Scripts Write, and
Account Settings Read permissions. Do not broaden permissions without evidence
that they are needed. Google needs no further changes.

`STABLE_PREVIEW_ENABLED` is paused at `false` to avoid repeated failed deployments.
After the secret is corrected and verified, report completion without credentials.
The implementation agent will re-enable preview and verify a complete main run.

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
