# Grams migration

Original: https://github.com/bentsignal/Grams (MIT). The original HTML/CSS, background animation, client game logic, artwork, and sound files are retained under `public/grams-assets/v1`. The missing sound/icon files were restored from the owner's `grams.rar` archive. Assets are committed to the private Games repository.

Character design and illustration: Ben Holzman. Music: “George Street Shuffle” by Kevin MacLeod, as credited in the original project. Icons: SVG Repo. The original third-party popup library is vendored at version 1.4.2.

The original single shared lobby and six-player limit remain. The Socket.IO transport is replaced by `transport.js`, which communicates with the authenticated React parent; Convex owns players, word validation, scoring, chat, emotes, and round deadlines. A submitted word must use the available letters and cannot be played twice by the same player. Other players' words remain hidden until results.

Usernames come from the shared account. Click your name or press Enter to join. Rejoining a running round restores your words and remaining time. Empty seats are reclaimed after 90 seconds without a heartbeat; the next player becomes host. The clock and animations run locally. Completed rounds retain account IDs in `gramsRounds`.

The original CSS and assets are not restyled. The parent frame isolates Grams from Ticket to Ride's CSS. There is a small Games link outside the original interface for returning to the hub.

## Verification

`tests/grams.test.ts` covers authorization, scoring, duplicate words, private word lists, ties, and saved results. `tests/e2e/grams.spec.ts` plays a full two-account round using the original keyboard controls.
