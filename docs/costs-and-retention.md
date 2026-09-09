# Cost and retention audit — September 7, 2026

## Actual accounts and usage

- Convex Personal team: **Free**, no credit card required. No upgrade performed.
- Convex team dashboard (all projects and development included): 32K / 1M monthly function calls, 3.87 MB / 512 MB database storage, 97.77 MB / 1 GB database I/O, 0.004 / 20 GB-hours action compute. Dashboard usage can lag.
- Ticket production snapshot before this change: 70 rooms, 202,796 bytes of serialized JSON total; average 2,897 bytes, largest 9,471 bytes. This excludes indexes, messages, auth tables, metadata, and results. Database-billed storage is therefore higher than JSON alone.
- Vercel BSX team: existing **Pro** subscription. Dashboard showed $1.01 of $20 included usage and a $200 on-demand notification budget with automatic pausing **off**. No additional subscription was purchased.

## What causes usage

Vercel serves a static React application, CSS, fonts, and the SVG map code. No game server, SSR functions, image transformations, or AI calls run on Vercel. Hashed assets now explicitly cache for one year; HTML remains updateable. The old GLB model is about 108 KB and not loaded by the current SVG board. Music streams directly from YouTube. Most effects are synthesized in the browser; the end-of-game applause (44,556 bytes), boo (36,615 bytes), and golf clap (32,644 bytes) are short CC0 recordings. Only the player’s own outcome clip loads, during scoring. Vite gives each clip a content-hashed URL with a one-year immutable browser cache, so repeat playback can reuse the local file without a Convex call. Browsers may evict cached files. Even 10,000 uncached applause downloads transfer about 446 MB. Source attribution is in `src/assets/audio/CREDITS.md`.

Convex runs transactional actions and subscriptions when game data changes. A human who abandons a turn leaves a small stored record, not a running worker. Bots advance through finite scheduled turns and stop at a human turn or game end. Authenticated open tabs also refresh Auth v2 sessions; that is small request traffic, not an always-running server. Disconnected browsers do not refresh sessions.

At the observed average, 10,000 room snapshots would be about 29 MB of JSON before overhead. Keeping ordinary games for friends is small compared with the current storage allowance. Unlimited chat grows with messages; it is paginated so opening a room does not transfer the entire history.

## Retention and safeguards

- Preserve active and completed games; no automatic expiry of an unfinished game.
- Persist each completed real round once, including participant identifiers and scores. Per-account result records support future statistics; no stats screen is added.
- Preserve all chat messages. Load 50 at a time with “Load older messages.”
- Delete an empty lobby only when its final player leaves; remove its messages in bounded batches.
- Require Google sign-in and completed username onboarding for all game operations.
- Limit room creation to 20/account/day and one every 10 seconds. Chat cooldown: 750ms; message length: 500 characters.
- Preview games are excluded from competitive result records.
- Existing browser seats can link to the first Google account that presents that browser's private token. A name alone never grants a seat.

## Budget limitation

The requested $20/month **project-only** cap is not available in Vercel's standard infrastructure Spend Management controls. Its budget measures the whole team and its pause switch pauses all production projects. Project budgets documented for **AI Gateway** apply to AI requests, which this game does not use. Team billing settings were left unchanged because authorization was only for a project-specific cap.

Authentication reduces backend abuse, but it is not a hard hosting budget: the public sign-in page can still receive traffic. There is no guarantee of a $20 cap. The existing Vercel team notification budget remains $200 with pausing off. Isolating the app in a separate billing team would be a separate hosting decision; no transfer or new paid team was made.

## Sources

- https://www.convex.dev/pricing — Free vs usage-based Starter; published allowances and rates.
- https://vercel.com/docs/spend-management — team-wide metered-resource budgets, periodic checks, and pause behavior.
- https://vercel.com/docs/ai-gateway/observability-and-spend/budgets — AI-only project budgets.
- https://auth-v2.previews.convex.dev/getting-started — alpha status and setup.

## Optional turn timer

Off by default. With a timer enabled, the server schedules one deadline job per turn; the on-screen countdown runs locally and does not write to Convex every second. Jobs check the round, turn, and deadline before acting, so an old deadline cannot affect a later turn or rematch. Starting destination selection is untimed. Expiry draws the remaining face-down cards, or keeps the first required destination ticket if a ticket draw was already started. If no hidden cards remain, the turn ends with whatever was available. Repeated empty-deck timeouts eventually finish a stalled game.

The final-ten-second warning uses a 16553-byte clock recording, loaded on your first timed turn and reused from the same one-year immutable browser cache. Playback loops locally and makes no per-tick backend requests.

## Games hub and Grams

Both games share the existing Vercel static frontend, Convex deployment, and Google accounts. No additional paid service or always-running server was introduced. Grams mutations occur on submitted guesses and explicit actions; keystrokes, animation frames, and countdown ticks stay on the client. Chat/emotes use a separate subscription, so guesses do not retransmit their history. Presence updates occur once per 30 seconds only while seated. One scheduled job ends each round; seat expiry checks run at most once per 90 seconds per seated account.

Example, not a bill guarantee: six players each submitting 30 guesses in a round produce 180 mutations and at most about 1,080 subscribed view executions, plus joins, chat, and presence. Actual usage depends on play frequency and other projects sharing the plan. Convex Free currently includes 1 million function calls/month and has hard limits; verify the account's actual plan before assuming overages are impossible. Sources: https://www.convex.dev/pricing and https://docs.convex.dev/production/state/limits .

The restored original Grams assets total about 11 MB, including an unused old music file that is committed but not requested by the game. The active soundtrack is about 6 MB; the other sound effects total about 300 KB. They are separate static files, not JavaScript bundle payloads. Original sound bytes are preserved and cached for one year under versioned asset paths. Dictionaries stay on the backend and are not sent to players. Reusing cached audio costs no Convex calls; browser cache eviction can require downloading again.

Grams keeps only the latest 100 chat/emote events for display (there is no lifetime message cap), one live lobby, expiring presence records, and completed round summaries with user IDs for future statistics.

## BSX transfer and custom domains (2026-09-09)

The existing project was transferred from Personal to the existing BSX Pro team at the owner’s request. Production and development deployment IDs, database records, and OAuth credentials are preserved. Games now shares BSX’s usage allowances and overage billing; the earlier Personal Free hard-limit description above is historical. No new subscription was purchased.

Production endpoint setup: `api.games.bentsignal.com` for Convex API/WebSockets and `auth.games.bentsignal.com` for HTTP actions/OAuth. Both use CNAME `convex.domains` and a `_convex_domains` TXT record containing `proficient-porpoise-581`. Google’s existing OAuth client includes `https://auth.games.bentsignal.com/oauth/google/callback`; its original production and development callbacks remain available.

Both custom endpoints were verified over HTTPS, selected as the deployment system URL overrides, and deployed to production. Vercel’s production `VITE_CONVEX_URL` points at the API domain. The website has an explicit `games` A record (`76.76.21.21`) because nested DNS names suppress the former wildcard match. Google branding changes are separate from the callback domain; its current form requires a privacy-policy URL, so no replacement policy or branding-verification submission was invented.

## Grams Durable Objects migration (2026-09-09)

Grams gameplay now runs in a SQLite Durable Object on Cloudflare, while Convex keeps accounts and completed round summaries. The earlier Convex-per-guess estimates above describe the retired client transport. The Cloudflare dashboard showed the 100,000 daily request allowance and $0 billable usage; no paid upgrade was made.

For six players submitting 30 guesses each, the gameplay traffic is 180 incoming WebSocket messages, rather than 180 Convex mutations plus reactive query executions. Cloudflare applies a 20:1 billing ratio to incoming Durable Object WebSocket messages, and does not charge for outgoing WebSocket messages. Storage writes and active compute still count; this is not a promise of zero usage. Normal friend-group usage should fit the current free allowances. Hibernating connections and automatic ping/pong avoid keeping idle rooms running. Free limits are shared across the Cloudflare account.

Accepted guesses persist one bounded room snapshot; invalid/duplicate guesses do not write or broadcast. Server countdown ticks do not exist. Round-end results are queued durably and delivered to Convex with idempotent retries. Live chat/emote history retains the latest 60 events with no lifetime message cap. Empty lobbies retain only a small state record, and completed summaries remain in Convex for future stats.

Sources: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/). Setup: [Grams realtime server](grams/realtime.md).
