# Games

[games.bentsignal.com](https://games.bentsignal.com)

- **Ticket to Ride** — `/ticket`
- **Grams** — `/grams`

Shared Google sign-in and usernames. React/Vite on Vercel; multiplayer and accounts on Convex.

```sh
npm install
npx convex dev
npm run dev
```

Local development: **https://games.bentsignal.local**. `npm run dev` uses Portless HTTPS and LAN discovery, matching Ruby. Other devices on the same network need to trust the Portless local CA for HTTPS. Run `npm run backend` in a second terminal for Convex changes.

```sh
npm test
npm run build
```

Grams retains its original interface, artwork, and sounds. Assets live in `public/grams-assets/v1`; source credits are in [docs/grams](docs/grams/). Hosting notes: [costs and retention](docs/costs-and-retention.md).
