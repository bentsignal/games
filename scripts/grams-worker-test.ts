import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { signTicket } from "../shared/realtimeAuth";
const dir = await mkdtemp(`${tmpdir()}/grams-worker-`);
execFileSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "deploy",
    "-c",
    "services/grams/wrangler.jsonc",
    "--env",
    "",
    "--dry-run",
    "--outdir",
    dir,
  ],
  { stdio: "pipe" },
);
const options = {
  resourcePersistencePath: `${dir}/storage`,
  workers: [
    {
      name: "test-grams",
      modules: true,
      modulesRoot: dir,
      scriptPath: `${dir}/index.js`,
      compatibilityDate: "2026-09-09",
      durableObjects: { GRAMS: { className: "GramsRoom", useSQLite: true } },
      bindings: {
        GRAMS_REALTIME_SECRET: "local-test-secret",
        CONVEX_URL: "https://unused.invalid",
        ALLOWED_ORIGINS: "https://games.test",
      },
    },
  ],
};
let mf = new Miniflare({
  ...convertV4MiniflareOptions({ workers: options.workers }),
  resourcePersistencePath: options.resourcePersistencePath,
});
const sockets: any[] = [];
async function connect(id: string, code = "friends", create = false) {
  const token = signTicket(
    {
      iss: "games-realtime",
      aud: `grams:${code}`,
      create,
      exp: Date.now() / 1000 + 60,
      id,
      userId: id,
      name: id,
    },
    "local-test-secret",
  );
  const response = await mf.dispatchFetch(
    `https://worker.test/grams${code === "friends" ? "" : `/${code}`}`,
    {
      headers: {
        Upgrade: "websocket",
        Origin: "https://games.test",
        "Sec-WebSocket-Protocol": `grams, ${token}`,
      },
    },
  );
  assert.equal(response.status, 101);
  const ws = response.webSocket!;
  const messages: any[] = [];
  ws.addEventListener("message", (e) => {
    if (e.data !== "pong") messages.push(JSON.parse(String(e.data)));
  });
  ws.accept();
  sockets.push(ws);
  const wait = async (predicate: (x: any) => boolean) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const item = messages.find(predicate);
      if (item) return item;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("Expected WebSocket message missing");
  };
  let seq = 0;
  return {
    ws,
    messages,
    wait,
    async command(args: unknown) {
      const request = ++seq;
      ws.send(JSON.stringify({ type: "grams-command", request, args }));
      return wait((m) => m.type === "grams-reply" && m.request === request);
    },
  };
}
try {
  const roomA = "ABCD2345",
    roomB = "EFGH6789";
  const missing = await connect("Missing", roomA);
  assert.match(
    (await missing.wait((m) => m.type === "grams-error")).error,
    /not found/,
  );
  const hostA = await connect("HostA", roomA, true);
  const hostB = await connect("HostB", roomB, true);
  const initialA = (await hostA.wait((m) => m.type === "grams-state")).state;
  const initialB = (await hostB.wait((m) => m.type === "grams-state")).state;
  assert.equal(initialA.host, "HostA");
  assert.equal(initialB.host, "HostB");
  assert.deepEqual(
    initialA.players.map((p: any) => p.id),
    ["HostA"],
  );
  assert.deepEqual(
    initialB.players.map((p: any) => p.id),
    ["HostB"],
  );
  const collision = await connect("OtherHost", roomA, true);
  assert.match(
    (await collision.wait((m) => m.type === "grams-error")).error,
    /already taken/,
  );
  const friend = await connect("Friend", roomA);
  await friend.command({ kind: "requestJoin" });
  await hostA.wait(
    (m) => m.type === "grams-state" && m.state.players.length === 2,
  );
  await hostA.command({ kind: "chatSent", message: "Only room A" });
  await friend.wait(
    (m) =>
      m.type === "grams-feed" &&
      m.feed.events.some((e: any) => e.data.message === "Only room A"),
  );
  await hostB.command({ kind: "chatSent", message: "Only room B" });
  assert.equal(
    hostB.messages.some(
      (m) =>
        m.type === "grams-feed" &&
        m.feed.events.some((e: any) => e.data.message === "Only room A"),
    ),
    false,
  );
  await hostA.command({ kind: "requestStart", size: 6 });
  const playingA = (
    await hostA.wait(
      (m) => m.type === "grams-state" && m.state.phase === "playing",
    )
  ).state;
  assert.equal(
    hostB.messages.some(
      (m) => m.type === "grams-state" && m.state.phase === "playing",
    ),
    false,
  );
  assert.match(
    (await friend.command({ kind: "requestStart", size: 6 })).error,
    /host/,
  );
  const tokenA = signTicket(
    {
      iss: "games-realtime",
      aud: `grams:${roomA}`,
      exp: Date.now() / 1000 + 60,
      id: "HostA",
      userId: "HostA",
      name: "HostA",
    },
    "local-test-secret",
  );
  const wrongRoom = await mf.dispatchFetch(
    `https://worker.test/grams/${roomB}`,
    {
      headers: {
        Upgrade: "websocket",
        Origin: "https://games.test",
        "Sec-WebSocket-Protocol": `grams, ${tokenA}`,
      },
    },
  );
  assert.equal(wrongRoom.status, 401);
  const a = await connect("Alice"),
    b = await connect("Bob");
  await a.command({ kind: "requestJoin" });
  await b.command({ kind: "requestJoin" });
  assert.match(
    (await b.command({ kind: "requestStart", size: 6 })).error,
    /host/,
  );
  await a.command({ kind: "requestStart", size: 6 });
  const started = (
    await a.wait((m) => m.type === "grams-state" && m.state.phase === "playing")
  ).state;
  await mf.unsafeEvictDurableObject("test-grams", "GramsRoom", {
    name: "friends",
    webSockets: "hibernate",
  });
  const chat = await a.command({
    kind: "chatSent",
    message: "Still connected after hibernation",
  });
  assert.equal(chat.error, undefined);
  await b.wait(
    (m) =>
      m.type === "grams-feed" &&
      m.feed.events.some(
        (e: any) => e.data.message === "Still connected after hibernation",
      ),
  );
  for (const ws of sockets) ws.close();
  await mf.dispose();
  mf = new Miniflare({
    ...convertV4MiniflareOptions({ workers: options.workers }),
    resourcePersistencePath: options.resourcePersistencePath,
  });
  const recovered = await connect("Alice");
  const state = (await recovered.wait((m) => m.type === "grams-state")).state;
  assert.equal(state.round, started.round);
  assert.equal(state.endAt, started.endAt);
  assert.equal(state.players.length, 2);
  const restoredA = await connect("HostA", roomA);
  const restoredB = await connect("HostB", roomB);
  const stateA = (await restoredA.wait((m) => m.type === "grams-state")).state;
  const stateB = (await restoredB.wait((m) => m.type === "grams-state")).state;
  assert.equal(stateA.endAt, playingA.endAt);
  assert.equal(stateA.players.length, 2);
  assert.equal(stateB.phase, "lobby");
  assert.deepEqual(
    stateB.players.map((p: any) => p.id),
    ["HostB"],
  );
  console.log(
    "Worker integration passed: independent coded lobbies, missing rooms, collision handling, scoped tickets, separate persisted state, two authenticated sockets, host rules, hibernation broadcast, persisted round recovery.",
  );
} finally {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {}
  }
  await mf.dispose();
  await rm(dir, { recursive: true, force: true });
}
