# Ticket to Ride realtime server

Ticket to Ride stores each live room in a SQLite Durable Object named by its
invitation code. `TicketRoom` runs in the existing `games-grams` Worker, alongside
`GramsRoom`. The `TICKET` binding and `v2` migration are declared for production,
preview, and development in `services/grams/wrangler.jsonc`.

Convex keeps auth, usernames, preview access, room-creation limits, and completed
rounds in `results` and `playerResults`. It does not receive live moves or chat.
The frontend uses the existing `VITE_GRAMS_URL` for both games. No new hostname,
secret, Cloudflare dashboard setup, or separate deployment command is needed.
GitHub Actions deploys the Worker migration through the existing preview/release
workflow. Production still requires an explicit release request.

## Connection and commands

`ticket.connect` requires a signed-in, onboarded account and issues a one-minute
ticket scoped to one room. `ticket.create` also enforces the existing account
creation limits and signs permission to create a specific room with its chosen
mode. Both use the existing realtime secret with Ticket-specific audiences.
Clients cannot choose their player identity or create a room with a connection
ticket. Retrying the same creation ticket does not reset an existing room.

After the HTTP room-creation request, the browser sends moves, lobby commands,
chat, and history reads through its authenticated WebSocket at `/ticket/<code>`.
The same socket streams private room updates and replies with request IDs. Its
stored identity survives hibernation. Convex issues a ticket when the socket
connects, not during normal moves. HTTP commands remain available for older
clients and the CLI integration check.

The Worker checks the configured Origin at connection time, validates commands,
and rejects repeated request IDs on a connection. Replies to gameplay commands
include an authoritative room view so an acknowledgement can settle a move even
if its separate broadcast has not rendered yet. Repeated snapshots of the same
revision do not rerender the board. Chat messages do not broadcast another game
snapshot. Each view hides other players' hands and tickets.

The browser reconnects with backoff, refreshes room and chat state, and renews
long-lived connections. Interrupted or timed-out commands are not replayed.
Reconnection reads the server's state, including any move accepted before the
connection broke.

React's built-in `useOptimistic` projects a valid route claim immediately using
only visible information: the route, payment cards, trains, and route points.
Server revisions supersede the prediction without applying the payment twice;
rejection or interruption removes it. Drawn cards, turn advancement, final scores,
and destination celebrations wait for confirmed state. A synchronous input guard
prevents duplicate submissions, and slow acknowledgements show "Confirming move".
No additional state-management library is needed.

The room serializes commands and persists accepted changes before broadcasting.
Revisions reject stale moves; initial ticket choices can arrive concurrently.
Bots and turn deadlines share a Durable Object alarm. They continue when browsers
close and recover after hibernation or a runtime restart. Timers do not write on
each countdown tick. Chat retains its history and loads 50 messages at a time.
When the last player leaves a lobby, an alarm removes chat in bounded batches.
A small room tombstone prevents a replayed creation ticket from reviving it.

Completed real rounds enter a persistent delivery queue in the same write as the
finished game. An alarm sends signed summaries to `ticket.saveResult` in Convex
and retries failures with backoff. Convex deduplicates by room instance and round
ID, so retries cannot double-count statistics. Rematches preserve undelivered
results. Ending previews never enter statistics.

## Cutover and verification

Old test games are not imported. Old Convex room tables remain for historical
records and internal fixtures. Their former public gameplay functions are now
internal, and the browser has no fallback to them. Existing account and result
records remain valid.

Run `pnpm run setup --new` for a disposable Convex deployment, then `pnpm run dev`.
The existing Worker launcher isolates local SQLite storage by deployment.

- `pnpm run grams:test` checks both games' Workers, including Ticket room
  authorization, hidden information, concurrent choices, stale moves,
  hibernation, chat, restart recovery, timer/bot alarms, and completed-result
  delivery across an outage, rematch, and restart.
- `pnpm run test:e2e:smoke` exercises real development sign-in and two-browser
  Ticket to Ride gameplay through the Worker. It also holds socket replies to
  verify optimistic placement, rejection rollback, and recovery with or without
  server acceptance before disconnecting, with CPU throttling.
- `pnpm run test:live` plays a full game through the local Worker with Convex
  accounts, then verifies rematch and leaving the room.
- `pnpm run check` runs the repository checks, including Worker integration.

Cloudflare references: [hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
and [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).
