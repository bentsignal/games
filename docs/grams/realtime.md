# Grams realtime server

The original Grams interface and assets run at `/grams`. Its live lobby, guesses, scoring, chat, and emotes run in the `GramsRoom` SQLite Durable Object in `services/grams`. Each lobby has its own object and a six-player limit.

Convex handles Google accounts, usernames, short-lived connection tickets, and completed round summaries. Ticket to Ride uses separate room Durable Objects in the same Worker. See [Ticket realtime server](../ticket-realtime.md). No Convex mutation or subscription is used for each Grams guess.

## Lobbies

At `/grams`, create a lobby or enter an eight-character code. Invitations use
`/grams/room/ABCD2345`. The browser generates codes with Web Crypto using an
alphabet that omits I, O, 0, and 1. The Worker routes `/grams/ABCD2345` WebSockets
to `GRAMS.idFromName("ABCD2345")`.

Convex authenticates the player and signs a one-minute ticket for that exact
code. A creation ticket lets the object reserve the code and seat its creator
as host before sending its first state. Creating an existing code owned by
another account fails; the player can create another lobby. Joining an unknown
code fails without creating a lobby. A code is an invitation, so anyone with an
account and the code can request a seat, subject to the player limit and round
status. There is no public lobby directory.

The original animated welcome screen shows the logo beside create/join controls.
Creating, joining, and leaving update the URL without reloading the page or iframe.
The selected button shows a spinner while connecting; the background keeps running.
Players enter a lobby automatically using their signed-in account username; there
is no name-entry step. Refresh and reconnect use the same URL and object. Leaving
a lobby returns to the welcome screen. Disconnected seats and
host transfer follow the rules below. Empty rooms keep their code and can be
used again. Room state, chat, timers, and result outboxes are separate per object;
result IDs already include a unique object-instance ID. Convex stores accounts
and completed rounds, with no new lobby table.

The legacy `/grams` Worker endpoint and tickets without a code continue to use
`friends` for clients already open during an update. The new frontend does not
join that singleton. The legacy Convex Grams implementation remains unchanged.

## Local development

Run `pnpm run setup` once per checkout, then `pnpm run dev` to start the frontend,
Convex watcher, and local Worker together. Setup provisions an isolated seven-day
Convex deployment and writes the matching Worker secret and URLs automatically.
The terminal prints checkout-specific HTTPS URLs. Local Worker persistence is
separated by Convex deployment under `.dev/worker/`.

See [development setup](../development.md) for auth, worktrees, HTTPS, and NixOS.

## Production

- Worker: `bentsignal-games-server-prod`, https://bentsignal-games-server-prod.shawnrodgers266.workers.dev
- Allowed browser origin: `https://games.bentsignal.com`
- Convex result endpoint: `https://api.games.bentsignal.com`
- Frontend build variable: `VITE_GRAMS_URL=https://bentsignal-games-server-prod.shawnrodgers266.workers.dev`

GitHub Actions deploys the Worker and frontend together through the production release workflow. The Worker and Convex deployment share `GRAMS_REALTIME_SECRET`. The Worker origin list must explicitly include any additional frontend deployment used for testing.

## Persistence and reconnects

Connections use one-minute HMAC tickets scoped to Grams, signed only after Convex authenticates the account. Convex session tokens never go to Cloudflare. WebSocket sessions refresh hourly; browser reconnects obtain a new ticket. Commands in flight are not replayed automatically, avoiding duplicate starts/chat/actions.

Accepted guesses persist before confirmation and broadcast small score deltas. Rejected guesses return privately without a database write or room broadcast. Countdown ticks are client-side. Hibernating WebSockets auto-answer keepalive pings without waking the object. Alarms handle round deadlines and disconnected-seat cleanup; there is no repeating per-second server job. Disconnected seats are retained for 90 seconds and through an active round, then removed with host transfer.

Each room expires 24 hours after its last accepted player command. Connections,
keepalive pings, automatic round completion, and result retries do not extend that
time. Expiry closes any remaining sockets and deletes the room state and chat.
Pending completed-round results must reach Convex before the room is deleted.
Rooms created before this policy receive a fresh 24 hours on their next wakeup;
Cloudflare does not enumerate dormant objects for a one-time migration.

Round completion writes the final state and a result outbox entry together. Delivery to Convex retries with exponential backoff, capped at one hour. Convex verifies the signed result and account mapping, then deduplicates by the object-instance/round ID. This keeps outcomes through temporary Convex outages. Chat/emote display retains the latest 60 events, with no lifetime message cap.

The old Convex Grams functions/tables remain for rollback and historical records; the migrated client does not use them. Roll back frontend and backend together if reverting the transport. Live DO rounds are not translated back into legacy Convex state.

## Checks

- `pnpm test`: game rules, tickets, account/result validation and idempotency.
- `pnpm run grams:test`: actual Workers runtime, two sockets, host restriction, hibernation and persistent restart recovery.
- `pnpm run grams:check`: Worker types.
- `pnpm exec playwright test tests/e2e/grams.spec.ts`: two-account browser round, chat/emotes, score updates, refresh and results. Requires local servers and development Convex.
