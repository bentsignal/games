# Ticket to Ride

A browser multiplayer railway game built with React and Convex. The illustrated 2D USA board pairs real geographic outlines with a spacious printed-board layout, bold player trains, and engraved railway cards. Create a private room, share its link, and play a complete game with 2–5 people or computer opponents.

**Play:** https://ticket.bentsignal.com

**Repository:** https://github.com/bentsignal/railbound-1910

Production backend: `https://proficient-porpoise-581.convex.cloud`, in the Personal Convex team. Its Free plan was confirmed in the billing dashboard on September 7, 2026. Vercel uses the existing BSX workspace. No paid subscription was added.

## Play

1. Sign in with Google, choose a unique username once, then select Classic, USA 1910, Big Cities, or Mega.
2. Create a table and copy the room invitation. Friends sign in with Google to join.
3. Add optional computer players, then start. Each player selects their secret tickets.
4. On your turn, draw train cards, claim a route, or draw destination tickets. Drag a colored card from your hand onto a highlighted route; the game pays with that color and the fewest necessary locomotives. You can also select a hand color and then a route, or use the searchable route list.
5. The server runs the final round, reveals tickets, scores bonuses, resolves ties, and offers a rematch.

Your seat is tied to your Google account. Sign in on another device to recover it. On first onboarding, an existing browser’s private session is linked to the account to preserve old seats. Rooms wait for disconnected humans; a player can explicitly hand their seat to a computer. Room chat and the recent activity log persist.

Use the map’s + / − buttons, scroll wheel, or pinch to zoom. Drag to pan; Reset map restores the whole board. Keyboard users can focus the map and use + / −, arrow keys, or 0 to reset, or use the route list. Claimed routes use larger, saturated train pieces. Parallel routes use compact, constant spacing, hand-shaped station approaches, and collision-checked train footprints. Dropping on either lane automatically chooses an available matching lane and continues the side of your existing track where possible.

Music attempts to start automatically and loops the classic America track. Browser autoplay restrictions may require the first interaction or a click on Play music. The header button pauses/resumes playback; the adjacent settings button opens the YouTube player, volume slider, and sound-effects toggle. Closing settings preserves the player and its playback position. YouTube availability and ads are controlled by YouTube. No soundtrack is downloaded or redistributed. Sound effects can be switched off in the same panel; this preference is saved locally.

Starting and mid-game destination choices sit beside the board. Hover or focus a ticket to preview its endpoints and a suggested connection; select several to keep their previews visible together. Suggestions prefer your existing rails and avoid opponents’ claims, but are not prescribed routes. During play, tickets can also be pinned for comparison.

Dragging supports mouse and touch. Escape or releasing outside the map cancels without spending cards. A dropped locomotive contributes at least one wild card; the drag preview shows the resulting payment.

## Local development

Node 22.12+ (Node 24 recommended).

```sh
npm ci
npx convex dev       # configure your own project on first run
npm run dev          # second terminal, http://localhost:5173
```

Convex writes `.env.local` with `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`. These values are environment specific and are not committed. `.env.example` documents the required frontend variable.

```sh
npm test                       # game rules + complete simulated matches
npm run build                  # TypeScript + production build
npx playwright install chromium
npm run test:e2e                # isolated multiplayer sessions and mobile UI
npm run test:map                # approved track layout and natural basemap
npm run test:feedback           # completion animation, bell and viewer colors
npm run test:live               # full game against configured live backend
```

Run the frontend before the browser tests. Automated signed-in fixtures require the developer’s Convex CLI login and run only against the development deployment; production OAuth is verified in Helium. The live test creates its own temporary room, plays a complete game, checks rematch, then removes its seats.

## Architecture

- `src/game/data.ts`, `board.json`, `tickets.json`: 36 cities, 100 tracks, 69 tickets and variant metadata.
- `src/game/engine.ts`: authoritative pure game transitions, legal payments, ticket connectivity, longest edge-simple trail, scoring, private views, computer decisions.
- `convex/rooms.ts`: transactional account-authorized room actions, revision checks, paginated chat, and scheduled computer turns.
- `convex/users.ts`, `auth.ts`: Google-only OAuth, unique usernames, legacy-seat linking.
- `convex/results.ts`: completed round records and per-account results that survive rematches.
- `src/components/Board.tsx`: accessible SVG board, curved and separated routes, vibrant player trains, ticket previews, city labels, mouse/touch pan and zoom.
- `src/game/geography.json`: generated Natural Earth coastlines, state borders, lakes, and board city coordinates. `npx tsx scripts/generate-map.mjs` regenerates these public-domain layers.
- `src/components/TrainArtwork.tsx`: original train-car engravings and conductor portraits.
- `src/components/Music.tsx` and `src/audio.ts`: persistent YouTube soundtrack player, synthesized game cues, and small cached crowd recordings (see `src/assets/audio/CREDITS.md`).
- `assets/locomotive.blend`: original editable Blender source. `scripts/create_locomotive.py` recreates it inside Blender. The earlier 3D prototype and its GLB are retained as source assets; the current game uses the 2D board.

Convex Auth v2 (pinned to 2.0.0-alpha.1) verifies Google OAuth and issues sessions. All room queries and mutations require a signed-in, onboarded account. Client-supplied names and legacy tokens never authorize a move. Other players' cards, pending choices, ticket identities, and deck order are excluded from query responses until the final reveal. A revision check and Convex transactions prevent double submissions and concurrent conflicting claims. Browser actions never submit a new game state or score. Computer players use their own cards and public board information only.

There are no idle workers, polling jobs, or recurring cron tasks. A scheduled mutation runs only when a computer player needs to act. Closed tables generate no compute calls. Convex Free has hard usage limits; Starter is usage priced. No paid plan or subscription is required by this project. Persistent storage still counts toward the provider's storage allowance. Frontend assets are static on Vercel; no Vercel server functions are used.

## Deploy

```sh
npx convex deploy
# Use the PRODUCTION Convex URL from the command above, not the dev URL.
vercel env add VITE_CONVEX_URL production
vercel --prod
```

The existing project is linked locally through `.vercel/` (not committed). Vercel builds with `npm run build`. Frontend pushes can deploy automatically when the GitHub integration is connected. Backend changes require `npx convex deploy`; do that before deploying a frontend which depends on new functions.

## Rules and source notes

Classic uses the 30 original tickets with the four USA 1910 point revisions. Mega contains all 69 tickets, including four Mystery Train tickets. Big Cities uses the Anniversary rulebook's explicit no-bonus variant. This choice is shown in the in-game handbook. For an impossible market with fewer than three non-locomotive cards available, the market is returned to the draw supply so play can continue without a reshuffle loop.

See [docs/SOURCES.md](docs/SOURCES.md) for factual data verification and asset provenance. This is an unofficial independent implementation, with original interface and railway artwork. Ticket to Ride is a trademark of Days of Wonder; the original game was designed by Alan R. Moon. No official board or card artwork is bundled.

React Compiler runs in both development and production through the Vite React compiler preset. Chat has an independent sending state, so messages do not disable or dim game controls.

For an all-routes-occupied visual proof, run `npx tsx scripts/map-proof.tsx` and open `/tmp/railbound-map-proof.html`. The interaction suite checks every pair of occupied train footprints, including stroke, wheels and shadow.

Lobby controls have independent pending states, and game mode changes update optimistically. Five fixed player slots keep chat stationary. Chat errors appear as local Server messages and are never broadcast. The custom production domain is `ticket.bentsignal.com`; the original Vercel project alias remains available.

All route spaces use the same 36-unit width, with aligned parallel pieces. `src/game/atlas-layout.json` holds the Classic-board station arrangement and fitted curves; no route stretches or shrinks its pieces. Closed parallel lanes display a cross and explain the standard 2–3 player restriction. Four- and five-player tables still allow different players to claim opposite sides.

Card dragging moves the floating card through an animation-frame transform and uses geometric map hit testing. It does not update React with every pointer coordinate; the browser regression checks 120 movements without a React commit or map DOM mutation. Static train artwork is memoized.

The basemap uses a single Albers geographic projection with uniform scale and rotation. It is independent of the board’s station positions and fixed route layout; coastal rails may cross water. Destination cities glow blue while any of your tickets involving that city remain unfinished, and green when all are complete. Confirmed card draws animate into your hand, with reduced-motion support. Paper-card sounds and a short turn whistle follow the existing Effects toggle.

Your own trains and player badge are always gold in your view; opponents use distinct room-seeded colors. Completed destinations briefly pulse and show a local completion notice with a railway bell, without replaying on reconnect. Face-up cards refill in their existing physical slots; empty positions stay empty when the deck is exhausted. Three visible locomotives still reset the full market under standard rules.

## End-game reveal

Scores are hidden during play. At the end, the local reveal counts route points, each completed or missed destination, Longest trail, and Globetrotter before showing ranked results. Scoreboard, Tickets, Chat, and Activity remain available under the top Play again / Leave table controls. Pause, skip, and replay affect only your own presentation; authoritative scores and other players are unchanged. Completed reveal steps are remembered in the current browser tab, including across reloads. Sound effects follow the existing Effects toggle.

[Create an ending preview](https://ticket.bentsignal.com/ending-preview) to get a separate four-player Mega game with one final turn remaining. Draw two hidden cards to finish it, then use Replay on the scoreboard to repeat the reveal. The preview is a fixed legal game snapshot; it cannot alter existing rooms. It requires Google sign-in and uses the normal account room-creation limit. Preview tables and their rematches are excluded from stored competitive results.

## Google OAuth and retention

Auth v2 is an alpha; its maintainers advise against production use. This private app uses the explicitly requested version, pinned in the lockfile. Google Cloud project: `ticket-to-ride-507915`. Register the exact `https://<deployment>.convex.site/oauth/google/callback` redirect for each deployment. Set `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET` through the Convex CLI. Generate independent `AUTH_PRIVATE_KEY` / `AUTH_JWKS` pairs per deployment; never put these in frontend variables or Git.

Production redirects return only to `https://ticket.bentsignal.com`; localhost:5173 is also allowed for development. Google requests basic identity scopes only. No passwords, email links, or anonymous login provider is enabled. The internal `testing` helpers require CLI admin access and explicitly reject the production deployment.

Usernames use 3–24 letters, digits, or underscores and are case-insensitively unique. Room creation has a transactional 10-second cooldown and a 20-per-account UTC-day limit. Chat has a 750ms cooldown and 500-character message limit, with no message-count retention cap. Queries load 50 messages at a time; older messages remain available. Only an empty lobby abandoned by its last player is deleted, with its chat cleaned in bounded batches. Active/finished games remain saved; completed real rounds get separate permanent results before any rematch.

See [cost and retention audit](docs/costs-and-retention.md) for measured usage and spend-control limitations.

## Spectators and playtest feedback

Signed-in friends can open a room code and choose **Watch game**, including after play starts or all five seats are filled. Spectators receive the public board, card counts, market, chat, activity, and final scoring. They cannot see hands or uncompleted ticket choices, make moves, or manage seats. Watching links retain `?watch=1` across refresh; spectators may take an open seat before the game starts.

Blocked double lanes keep their printed color under the cross-out marks. Rainbow cards use a brighter spectrum. A brief centered final-round notice plays a whistle; finishing the scoring reveal plays applause and full-viewport confetti for winners, a polite golf clap for second and third place, or recorded crowd boos for last place. Last place takes precedence over the polite clap; other middle places are silent. Spectators get neither personal outcome effect. Effects respect mute and reduced-motion preferences. `npx tsx scripts/check-game-events.ts` checks these visual and sound behaviors with local fixtures.

Card dragging uses geometric hit testing and a separate composited SVG highlight layer. Crossing routes does not modify the underlying map/train elements; layout reads precede ghost movement writes.

Hosts can choose an optional 30-, 60-, 90-, or 120-second turn timer in the lobby (default Off). The shared countdown appears in the turn panel, larger on your turn. The server enforces expiry even when the active player disconnects: it draws up to two face-down cards, finishes a partial draw, or keeps the required minimum if destination selection is pending. Initial ticket selection is untimed. Rematches retain the chosen timer setting.

During your final 10 seconds, a small cached clock recording loops until the deadline or your move ends the turn. It respects the sound-effects mute setting. `npx tsx scripts/check-turn-sound.ts` checks timing, playback, cancellation, and caching.
