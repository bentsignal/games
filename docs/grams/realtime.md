# Grams realtime server

The original Grams interface and assets run at `/grams`. Its live lobby, guesses, scoring, chat, and emotes run in the `GramsRoom` SQLite Durable Object in `services/grams`. The existing singleton friends lobby and six-player limit are preserved.

Convex handles Google accounts, usernames, short-lived connection tickets, and completed round summaries. Ticket to Ride remains on Convex. No Convex mutation or subscription is used for each Grams guess.

## Local development

Run `pnpm run setup` once per checkout, then `pnpm run dev` to start the frontend,
Convex watcher, and local Worker together. Setup provisions an isolated seven-day
Convex deployment and writes the matching Worker secret and URLs automatically.
The terminal prints checkout-specific HTTPS URLs. Local Worker persistence is
separated by Convex deployment under `.dev/worker/`.

See [development setup](../development.md) for auth, worktrees, HTTPS, and NixOS.

## Production

- Worker: `games-grams`, https://games-grams.shawnrodgers266.workers.dev
- Allowed browser origin: `https://games.bentsignal.com`
- Convex result endpoint: `https://api.games.bentsignal.com`
- Vercel production variable: `VITE_GRAMS_URL=https://games-grams.shawnrodgers266.workers.dev`

Deploy the Worker with `pnpm run grams:deploy`. Install its secret with `pnpm exec wrangler secret put GRAMS_REALTIME_SECRET --config services/grams/wrangler.jsonc --env ''`, and set the matching production Convex variable. Deploy Convex with `pnpm exec convex deploy`, then the frontend with `vercel --prod --scope bsx-sh`. The Worker origin list must explicitly include any additional frontend deployment used for testing.

## Persistence and reconnects

Connections use one-minute HMAC tickets scoped to Grams, signed only after Convex authenticates the account. Convex session tokens never go to Cloudflare. WebSocket sessions refresh hourly; browser reconnects obtain a new ticket. Commands in flight are not replayed automatically, avoiding duplicate starts/chat/actions.

Accepted guesses persist before confirmation and broadcast small score deltas. Rejected guesses return privately without a database write or room broadcast. Countdown ticks are client-side. Hibernating WebSockets auto-answer keepalive pings without waking the object. Alarms handle round deadlines and disconnected-seat cleanup; there is no repeating per-second server job. Disconnected seats are retained for 90 seconds and through an active round, then removed with host transfer.

Round completion writes the final state and a result outbox entry together. Delivery to Convex retries with exponential backoff, capped at one hour. Convex verifies the signed result and account mapping, then deduplicates by the object-instance/round ID. This keeps outcomes through temporary Convex outages. Chat/emote display retains the latest 60 events, with no lifetime message cap.

The old Convex Grams functions/tables remain for rollback and historical records; the migrated client does not use them. Roll back frontend and backend together if reverting the transport. Live DO rounds are not translated back into legacy Convex state.

## Checks

- `pnpm test`: game rules, tickets, account/result validation and idempotency.
- `pnpm run grams:test`: actual Workers runtime, two sockets, host restriction, hibernation and persistent restart recovery.
- `pnpm run grams:check`: Worker types.
- `pnpm exec playwright test tests/e2e/grams.spec.ts`: two-account browser round, chat/emotes, score updates, refresh and results. Requires local servers and development Convex.
