# Railbound · USA 1910

A browser multiplayer railway game built with React and Convex. The illustrated 2D USA board pairs real geographic outlines with a spacious printed-board layout, bold player trains, and engraved railway cards. Create a private room, share its link, and play a complete game with 2–5 people or computer opponents.

**Play:** https://railbound-1910.vercel.app  
**Repository:** https://github.com/bentsignal/railbound-1910

Production backend: `https://proficient-porpoise-581.convex.cloud`, in the Personal Convex team. Its Free plan was confirmed in the billing dashboard on September 6, 2026. Vercel uses the existing BSX workspace. No paid subscription was added.

## Play

1. Enter a conductor name and choose Classic, USA 1910, Big Cities, or Mega.
2. Create a table and copy the room invitation. Friends join with a name; no account is required.
3. Add optional computer players, then start. Each player selects their secret tickets.
4. On your turn, draw train cards, claim a route, or draw destination tickets. Click the board or use the searchable route list.
5. The server runs the final round, reveals tickets, scores bonuses, resolves ties, and offers a rematch.

Your seat is saved in the browser. Reloading, navigating away, and reopening the room recover it. Clearing browser storage or switching devices creates a new identity. Rooms wait for disconnected humans; a player can explicitly hand their seat to a computer. Room chat and the recent activity log persist.

Use the map’s + / − buttons, scroll wheel, or pinch to zoom. Drag to pan; Reset map restores the whole board. Keyboard users can focus the map and use + / −, arrow keys, or 0 to reset, or use the route list. Claimed routes show the owner’s color and player number.

The Music button opens the classic America track in a visible YouTube player. Playback starts from its own controls, can loop, and stops when the panel closes. YouTube availability and ads are controlled by YouTube. No soundtrack is downloaded or redistributed. Sound effects can be switched off in the same panel; this preference is saved locally.

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
npm run test:live               # full game against configured live backend
```

Run the frontend before the browser tests. `PLAYWRIGHT_BASE_URL` targets a deployed frontend. `CONVEX_TEST_URL` targets a specific backend for the live smoke test. The live test creates its own temporary room, plays a complete game, checks rematch, then removes its seats.

## Architecture

- `src/game/data.ts`, `board.json`, `tickets.json`: 36 cities, 100 tracks, 69 tickets and variant metadata.
- `src/game/engine.ts`: authoritative pure game transitions, legal payments, ticket connectivity, longest edge-simple trail, scoring, private views, computer decisions.
- `convex/rooms.ts`: transactional room actions, session authorization, revision checks, chat, and scheduled computer turns.
- `src/components/Board.tsx`: accessible SVG board, curved and separated routes, numbered player trains, city labels, mouse/touch pan and zoom.
- `src/game/geography.json`: generated Natural Earth coastlines, state borders, lakes, and aligned city coordinates. `node scripts/generate-map.mjs` regenerates these public-domain layers.
- `src/components/TrainArtwork.tsx`: original train-car engravings and conductor portraits.
- `src/components/Music.tsx` and `src/audio.ts`: opt-in YouTube soundtrack player and original synthesized game cues.
- `assets/locomotive.blend`: original editable Blender source. `scripts/create_locomotive.py` recreates it inside Blender. The earlier 3D prototype and its GLB are retained as source assets; the current game uses the 2D board.

Session secrets contain 256 random bits and stay in local browser storage. The server hashes them before using public player IDs. Other players' cards, pending choices, ticket identities, and deck order are excluded from query responses until the final reveal. A revision check and Convex transactions prevent double submissions and concurrent conflicting claims. Browser actions never submit a new game state or score. Computer players use their own cards and public board information only.

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
