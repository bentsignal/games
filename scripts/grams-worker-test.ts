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
async function connect(id: string) {
  const token = signTicket(
    {
      iss: "games-realtime",
      aud: "grams:friends",
      exp: Date.now() / 1000 + 60,
      id,
      userId: id,
      name: id,
    },
    "local-test-secret",
  );
  const response = await mf.dispatchFetch("https://worker.test/grams", {
    headers: {
      Upgrade: "websocket",
      Origin: "https://games.test",
      "Sec-WebSocket-Protocol": `grams, ${token}`,
    },
  });
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
  console.log(
    "Worker integration passed: two authenticated sockets, host rules, hibernation broadcast, persisted round recovery.",
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
