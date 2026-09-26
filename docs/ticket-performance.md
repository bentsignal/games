Ticket performance checks and diagnostics

Chat owns its draft and subscribes to a room-specific message store. The game
screen does not subscribe to chat messages. Outgoing messages appear immediately
at half opacity without a timestamp. Confirmation fades the message to full
opacity and reveals its timestamp. Failed messages keep their recovery controls.
Each message can remain pending independently; sending
another message does not wait for earlier acknowledgements. Server broadcasts and replies reconcile the same client
message ID, including after reconnection. A failed or interrupted send remains
visible as unconfirmed. Copy to draft lets the player recover its text without
overwriting a newer draft. Interrupted sends are never replayed automatically.

The drag handler performs one geometric hit test per animation frame. Pointer
coordinates update the ghost's CSS translate directly. Route labels update the
ghost component, and route highlights toggle the opacity of prebuilt, cropped
SVG surfaces. Highlight changes do not rewrite path geometry or resize the
overlay. A ResizeObserver matches the map's centered aspect ratio, and the
overlay shares its zoom and pan transform. Crossing
routes does not update game-screen state. The board updates when dragging starts
or ends to show eligible routes. The map and absolute highlight overlay share a
contained viewport. The detailed map has its own composited surface, and highlight
geometry cannot participate in the parent grid sizing. A relative SVG grid item
previously repainted the underlying map as the drag crossed routes.

Result delivery to Convex runs outside the Durable Object's command lock. The
persistent outbox still retries failed deliveries and survives restarts. Commands
can change the room during delivery, so completion removes only the matching
outbox entry and preserves the latest room state.

Run `pnpm run check:react-compiler` to verify the installed compiler against the
actual Vite production pipeline. `pnpm run check` and the React Compiler CI job
include it. App, Board, CardDragGhost, DragHighlights, TicketChat, and useTicketRoom must
compile.
The check rejects increased skip counts elsewhere. The checked-in baseline records
existing skips in account/sign-in, Grams, Music, and Scoreboard, so unrelated
limitations remain visible without hiding regressions in Ticket's critical path.
Reduce baseline counts when resolving those skips. Do not add critical Ticket
components to the baseline to make a failed check pass.

Babel core is pinned to 7.29.7 because Compiler 1.0.0 skips default props under
Babel 8. The check verifies compilation after dependency changes. Installing the
compiler alone is not sufficient. The upstream compatibility report is
<https://github.com/react/react/issues/36868>.

Run `pnpm run test:e2e:smoke` with the configured development services running.
The Ticket performance test checks zero board renders during typing, incoming
chat, delayed acknowledgements, and rejected messages. It also checks draft
preservation, multiple sends before acknowledgement, one hit test per pointer movement, bounded board renders during a
continuous drag, and p95 drag frame intervals below 50 ms at 4x CPU slowdown.
This threshold catches severe regressions; it is not a claim of 60 FPS on every
machine. Worker integration holds result delivery open while sending chat to
verify that the room remains responsive.

Windows rendering diagnostics

Install Node 24 and the repository's pnpm version, then run these commands from
this branch's checkout in PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm run diagnostics:ticket
```

Open the localhost link printed by the command in Windows Chrome. This standalone
fixture uses the actual Ticket UI and a populated map. It needs no Convex account,
backend setup, hosts-file change, or Portless proxy. All game state is temporary.
Reload to reset the game. Chat replies are deliberately delayed by 1,200 ms so you
can check immediate local feedback and preservation of the next draft. The banner
and exported report identify these timings as simulated. They do not measure
production network latency.

Click Reset recording after the map loads. Drag a card slowly through the areas
that previously stuttered, then type and send several chat messages. Click Download
diagnostics to save `ticket-diagnostics.json`. Record your Chrome version, display
resolution, Windows scaling, and whether Chrome reports hardware acceleration
under `chrome://gpu`. A Chrome Performance recording of the same interaction can
separate JavaScript work, layout, paint, and GPU/raster delays if frame spikes
remain. Test once without DevTools recording too, because profiling adds overhead.

Live local-game diagnostics

For real development WebSocket timing, use the normal setup documented in
[development.md](development.md), start `pnpm run dev`, and append
`?diagnostics=1` to the Ticket page URL. Enabling diagnostics persists for that
browser tab as you enter a room. The controls appear at the bottom left. Append
`?diagnostics=0` and reload to disable them.

The report contains browser and viewport metadata, board-render and hit-test
counts, drag frame intervals, hit-test duration, chat input delay, time to the
next frame after pending-message insertion, and acknowledgement duration. Chrome
long-task and Event Timing samples are included when supported. Each sample series
is capped at 3,000 entries; reset between experiments. Acknowledgement duration
includes transport, server processing, and browser delivery. It is not a pure
network measurement. The next animation frame is an approximation of visual
feedback, not proof of GPU presentation.

No chat text, player identity, room code, credentials, or WebSocket payloads are
recorded. Diagnostics never upload automatically and are disabled in ordinary
production builds. The offline command writes its separate build under `.dev/`.

Windows follow-up, September 26

The supplied 2552 × 1345 recording contained 1,420 hit tests and 14 board
renders. Hit testing took at most 0.5 ms, while drag frame p95 was 58.1 ms.
This pointed beyond React render frequency. Local Chromium traces at the same
viewport showed repeated map painting when the highlight path changed. Moving
the overlay out of grid sizing into a contained viewport and compositing the
map reduced raster work substantially in the local comparison. Windows must be
retested; local browser timings do not establish Windows GPU performance.
