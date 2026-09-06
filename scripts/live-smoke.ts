import { ConvexHttpClient } from "convex/browser";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { api } from "../convex/_generated/api";
import { botAction, type Game, type View } from "../src/game/engine";
const url =
  process.env.CONVEX_TEST_URL ||
  readFileSync(".env.local", "utf8")
    .match(/VITE_CONVEX_URL=(.+)/)![1]
    .trim();
const client = new ConvexHttpClient(url);
const tokens = [
  randomBytes(32).toString("hex"),
  randomBytes(32).toString("hex"),
];
const code = await client.mutation(api.rooms.create, {
  token: tokens[0],
  name: "Server QA 1",
  mode: "mega",
});
await client.mutation(api.rooms.join, {
  code,
  token: tokens[1],
  name: "Server QA 2",
});
const get = async (i: number) => {
  const r = await client.query(api.rooms.get, { code, token: tokens[i] });
  assert(r?.game);
  return { ...r, game: r.game as View };
};
let r = await get(0);
const ids = r.game.players.map((p) => p.id);
const outsider = await client.query(api.rooms.get, {
  code,
  token: randomBytes(32).toString("hex"),
});
assert.equal(outsider?.game, null);
await assert.rejects(
  client.mutation(api.rooms.play, {
    code,
    token: tokens[1],
    revision: r.revision,
    action: { type: "start" },
  }),
);
await client.mutation(api.rooms.play, {
  code,
  token: tokens[0],
  revision: r.revision,
  action: { type: "start" },
});
await assert.rejects(
  client.mutation(api.rooms.play, {
    code,
    token: tokens[0],
    revision: r.revision,
    action: { type: "start" },
  }),
);
for (let i = 0; i < 2; i++) {
  r = await get(i);
  await client.mutation(api.rooms.play, {
    code,
    token: tokens[i],
    revision: r.revision,
    action: { type: "keep", tickets: r.game.me!.pending.slice(0, 3) },
  });
}
await client.mutation(api.rooms.send, {
  code,
  token: tokens[0],
  text: "Backend integration check",
});
assert.equal(
  (await client.query(api.rooms.chat, { code, token: tokens[1] })).at(-1)?.text,
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
  await client.mutation(api.rooms.play, {
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
await client.mutation(api.rooms.manage, {
  code,
  token: tokens[0],
  operation: "rematch",
});
r = await get(0);
assert.equal(r.game.phase, "lobby");
assert(r.game.players.every((p) => p.score === 0 && p.trains === 45));
console.log("Rematch reset verified.");
await client.mutation(api.rooms.manage, {
  code,
  token: tokens[1],
  operation: "leave",
});
await client.mutation(api.rooms.manage, {
  code,
  token: tokens[0],
  operation: "leave",
});
