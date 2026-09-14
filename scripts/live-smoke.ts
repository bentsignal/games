import { ConvexHttpClient } from "convex/browser";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import type { RoomView } from "../shared/ticketProtocol";
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
const created = await clients[0].mutation(api.ticket.create, { mode: "mega" });
const code = created.code;
async function command(i: number, args: Record<string, unknown>): Promise<any> {
  const token =
    args.kind === "create"
      ? created.token
      : await clients[i].mutation(api.ticket.connect, { code });
  const response = await fetch(`${env.VITE_GRAMS_URL}/ticket/${code}`, {
    method: "POST",
    headers: {
      Origin: env.GAMES_WEB_ORIGIN,
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error(data.error ?? "Worker request failed");
  return data.result;
}
await command(0, { kind: "create" });
await command(1, { kind: "join", code, name: "Server QA 2" });
const get = async (i: number) => {
  const r = (await command(i, { kind: "get", code })) as RoomView;
  assert(r?.game);
  return { ...r, game: r.game as View };
};
let r = await get(0);
const ids = r.game.players.map((p) => p.id);
const outsider = await command(2, { kind: "get", code });
assert.equal(outsider?.game.me, null);
await assert.rejects(
  command(1, {
    kind: "play",
    code,
    revision: r.revision,
    action: { type: "start" },
  }),
);
await command(0, {
  kind: "play",
  code,
  revision: r.revision,
  action: { type: "start" },
});
await assert.rejects(
  command(0, {
    kind: "play",
    code,
    revision: r.revision,
    action: { type: "start" },
  }),
);
const offers = await Promise.all([get(0), get(1)]);
assert.equal(offers[0].revision, offers[1].revision);
await Promise.all(
  offers.map((offer, i) =>
    command(i, {
      kind: "play",
      code,
      revision: offer.revision,
      action: { type: "keep", tickets: offer.game.me!.pending.slice(0, 3) },
    }),
  ),
);
console.log("Concurrent starting-ticket choices verified.");
await command(0, { kind: "send", code, text: "Backend integration check" });
assert.equal(
  (
    await command(1, {
      kind: "chat",
      code,
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).messages[0]?.text,
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
  await command(actor, { kind: "play", code, revision: r.revision, action });
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
await command(0, { kind: "manage", code, operation: "rematch" });
r = await get(0);
assert.equal(r.game.phase, "lobby");
assert(r.game.players.every((p) => p.score === 0 && p.trains === 45));
console.log("Rematch reset verified.");
const resultsDeadline = Date.now() + 30000;
for (;;) {
  const results = JSON.parse(
    execFileSync(
      "pnpm",
      [
        "exec",
        "convex",
        "data",
        "results",
        "--deployment",
        deployment,
        "--format",
        "json",
        "--limit",
        "100",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  const saved = results.filter(
    (result: { roomCode?: string }) => result.roomCode === code,
  );
  if (saved.length) {
    assert.equal(saved.length, 1);
    assert.equal(saved[0].scores.length, 2);
    break;
  }
  assert(
    Date.now() < resultsDeadline,
    "Completed round was not delivered to Convex",
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
}
console.log("Completed round persisted once in Convex after rematch.");

await command(1, { kind: "manage", code, operation: "leave" });
await command(0, { kind: "manage", code, operation: "leave" });
