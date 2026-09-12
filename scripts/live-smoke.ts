import { ConvexHttpClient } from "convex/browser";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { api } from "../services/convex/convex/_generated/api";
import { botAction, type Game, type View } from "../src/game/engine";
const env = parseEnv(readFileSync(".env.local", "utf8"));
const deployment = env.CONVEX_DEPLOYMENT?.match(/^dev:([a-z0-9-]+)$/)?.[1];
const url = env.VITE_CONVEX_URL;
if (
  !deployment ||
  url !== `https://${deployment}.convex.cloud` ||
  process.env.CONVEX_DEPLOY_KEY ||
  env.CONVEX_DEPLOY_KEY
)
  throw new Error(
    "Run account fixtures only on the configured development deployment.",
  );
const clients = Array.from({ length: 3 }, (_, i) => {
  const bundle = JSON.parse(
    execFileSync(
      "pnpm",
      [
        "exec",
        "convex",
        "run",
        "testing:signIn",
        JSON.stringify({ username: "Server_QA_" + i }),
        "--deployment",
        deployment,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  const client = new ConvexHttpClient(url);
  client.setAuth(bundle.accessToken);
  return client;
});
const tokens = [
  randomBytes(32).toString("hex"),
  randomBytes(32).toString("hex"),
];
const code = await clients[0].mutation(api.rooms.create, {
  token: tokens[0],
  name: "Server QA 1",
  mode: "mega",
});
await clients[1].mutation(api.rooms.join, {
  code,
  token: tokens[1],
  name: "Server QA 2",
});
const get = async (i: number) => {
  const r = await clients[i].query(api.rooms.get, { code, token: tokens[i] });
  assert(r?.game);
  return { ...r, game: r.game as View };
};
let r = await get(0);
const ids = r.game.players.map((p) => p.id);
const outsider = await clients[2].query(api.rooms.get, {
  code,
  token: randomBytes(32).toString("hex"),
});
assert.equal(outsider?.game, null);
await assert.rejects(
  clients[1].mutation(api.rooms.play, {
    code,
    token: tokens[1],
    revision: r.revision,
    action: { type: "start" },
  }),
);
await clients[0].mutation(api.rooms.play, {
  code,
  token: tokens[0],
  revision: r.revision,
  action: { type: "start" },
});
await assert.rejects(
  clients[0].mutation(api.rooms.play, {
    code,
    token: tokens[0],
    revision: r.revision,
    action: { type: "start" },
  }),
);
const offers = await Promise.all([get(0), get(1)]);
assert.equal(offers[0].revision, offers[1].revision);
await Promise.all(
  offers.map((offer, i) =>
    clients[i].mutation(api.rooms.play, {
      code,
      token: tokens[i],
      revision: offer.revision,
      action: { type: "keep", tickets: offer.game.me!.pending.slice(0, 3) },
    }),
  ),
);
console.log("Concurrent starting-ticket choices verified.");
await clients[0].mutation(api.rooms.send, {
  code,
  token: tokens[0],
  text: "Backend integration check",
});
assert.equal(
  (
    await clients[1].query(api.rooms.chat, {
      code,
      token: tokens[1],
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).page[0]?.text,
  "Backend integration check",
);
let actor = 0,
  actions = 0;
while (actions < 1800) {
  r = await get(actor);
  if (r.game.phase === "finished") break;
  actor = ids.indexOf(r.game.players[r.game.turn].id);
  if (r.game.me?.id !== ids[actor]) r = await get(actor);
  const v = r.game;
  assert(!("hand" in v.players[1 - actor]));
  assert(!("deck" in v));
  // Fill only hidden counts for the decision maker; its policy never looks at opponent cards.
  const g = {
    ...v,
    deck: Array(v.deckCount).fill("red"),
    discard: Array(v.discardCount).fill("red"),
    ticketDeck: Array(v.ticketCount).fill("hidden"),
    players: v.players.map((p) =>
      p.id === v.me!.id ? v.me! : { ...p, hand: [], tickets: [], pending: [] },
    ),
  } as Game;
  const action = botAction(g, v.me!);
  await clients[actor].mutation(api.rooms.play, {
    code,
    token: tokens[actor],
    revision: r.revision,
    action,
  });
  actions++;
  if (actions % 50 === 0) console.log(`Verified ${actions} server actions`);
}
r = await get(0);
assert.equal(r.game.phase, "finished");
assert(r.game.results.some((s) => s.winner));
assert.equal(Object.keys(r.game.revealed).length, 2);
console.log(
  JSON.stringify(
    {
      url,
      code,
      actions,
      phase: r.game.phase,
      scores: r.game.results.map((s) => s.total),
    },
    null,
    2,
  ),
);
await clients[0].mutation(api.rooms.manage, {
  code,
  token: tokens[0],
  operation: "rematch",
});
r = await get(0);
assert.equal(r.game.phase, "lobby");
assert(r.game.players.every((p) => p.score === 0 && p.trains === 45));
console.log("Rematch reset verified.");
await clients[1].mutation(api.rooms.manage, {
  code,
  token: tokens[1],
  operation: "leave",
});
await clients[0].mutation(api.rooms.manage, {
  code,
  token: tokens[0],
  operation: "leave",
});
