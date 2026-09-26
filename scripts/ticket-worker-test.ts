import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { botAction, type Game } from "../src/game/engine";
import { signTicket, verifyTicket } from "../shared/realtimeAuth";
const dir = await mkdtemp(`${tmpdir()}/ticket-worker-`);
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
let acceptResults = false;
let slowResults = false;
let releaseResult: (() => void) | undefined;
const delivered: any[] = [];
const resultServer = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  assert.equal(request.path, "ticket:saveResult");
  const payload = verifyTicket(
    request.args.token,
    "local-test-secret",
    "ticket:result",
  );
  if (slowResults)
    await new Promise<void>((resolve) => {
      releaseResult = resolve;
    });
  res.setHeader("Content-Type", "application/json");
  if (!acceptResults) {
    res.writeHead(503);
    res.end(JSON.stringify({ status: "error" }));
    return;
  }
  delivered.push(payload.result);
  res.end(JSON.stringify({ status: "success", value: "saved" }));
});
await new Promise<void>((resolve) =>
  resultServer.listen(0, "127.0.0.1", resolve),
);
const resultAddress = resultServer.address() as { port: number };
const options = {
  resourcePersistencePath: `${dir}/storage`,
  workers: [
    {
      name: "test-grams",
      modules: true,
      modulesRoot: dir,
      scriptPath: `${dir}/index.js`,
      compatibilityDate: "2026-09-09",
      durableObjects: {
        GRAMS: { className: "GramsRoom", useSQLite: true },
        TICKET: { className: "TicketRoom", useSQLite: true },
      },
      bindings: {
        GRAMS_REALTIME_SECRET: "local-test-secret",
        CONVEX_URL: `http://127.0.0.1:${resultAddress.port}`,
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
const code = "ABCDEFGH";
function token(id: string, roomCode = code, create?: unknown) {
  return signTicket(
    {
      iss: "games-realtime",
      aud: "ticket:room",
      exp: Date.now() / 1000 + 60,
      id,
      userId: id,
      name: id,
      code: roomCode,
      ...(create ? { create } : {}),
    },
    "local-test-secret",
  );
}
async function raw(
  id: string,
  args: unknown,
  roomCode = code,
  creation?: unknown,
) {
  return mf.dispatchFetch(`https://worker.test/ticket/${roomCode}`, {
    method: "POST",
    headers: {
      Origin: "https://games.test",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token(id, roomCode, creation)}`,
    },
    body: JSON.stringify(args),
  });
}
async function command(
  id: string,
  args: unknown,
  roomCode = code,
  creation?: unknown,
): Promise<any> {
  const response = await raw(id, args, roomCode, creation),
    data = (await response.json()) as any;
  if (data.error) throw new Error(data.error);
  assert.equal(response.status, 200);
  return data.result;
}
async function connect(id: string) {
  const response = await mf.dispatchFetch(
    `https://worker.test/ticket/${code}`,
    {
      headers: {
        Upgrade: "websocket",
        Origin: "https://games.test",
        "Sec-WebSocket-Protocol": `ticket, ${token(id)}`,
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
  let sequence = 0;
  return {
    ws,
    messages,
    async command(args: unknown) {
      const request = ++sequence;
      ws.send(JSON.stringify({ type: "command", request, args }));
      await wait(() =>
        messages.some((m) => m.type === "reply" && m.request === request),
      );
      const reply = messages.find(
        (m) => m.type === "reply" && m.request === request,
      );
      if (reply.error) throw new Error(reply.error);
      return reply;
    },
  };
}
async function wait(predicate: () => boolean) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Expected update missing");
    await new Promise((r) => setTimeout(r, 10));
  }
}
const read = (id = "Alice") => command(id, { kind: "get" });
try {
  assert.equal(
    (
      await mf.dispatchFetch(`https://worker.test/ticket/${code}`, {
        method: "POST",
        headers: { Origin: "https://games.test" },
        body: '{"kind":"get"}',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await mf.dispatchFetch(`https://worker.test/ticket/${code}`, {
        method: "POST",
        headers: {
          Origin: "https://other.test",
          Authorization: `Bearer ${token("Alice")}`,
        },
        body: '{"kind":"get"}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await mf.dispatchFetch("https://worker.test/ticket/BCDEFGHJ", {
        method: "POST",
        headers: {
          Origin: "https://games.test",
          Authorization: `Bearer ${token("Alice")}`,
        },
        body: JSON.stringify({ kind: "get" }),
      })
    ).status,
    401,
  );
  await assert.rejects(command("Alice", { kind: "create" }), /Create a room/);
  await command("Alice", { kind: "create" }, code, { mode: "mega" });
  assert.equal(
    await command("Alice", { kind: "create" }, code, { mode: "mega" }),
    code,
  );
  await command("Bob", { kind: "join" });
  const a = await connect("Alice"),
    b = await connect("Bob"),
    spectator = await connect("Spectator");
  await a.command({
    kind: "manage",
    operation: "timer",
    turnSeconds: 30,
  });
  await assert.rejects(
    command("Bob", { kind: "manage", operation: "timer", turnSeconds: 60 }),
    /host/,
  );
  const revisionBeforeDuplicate = (await read()).revision;
  a.ws.send(
    JSON.stringify({
      type: "command",
      request: 1,
      args: { kind: "manage", operation: "bot" },
    }),
  );
  await wait(() =>
    a.messages.some((m) => m.error?.includes("already been received")),
  );
  assert.equal((await read()).revision, revisionBeforeDuplicate);
  await assert.rejects(b.command({ kind: "manage", operation: "bot" }), /host/);
  await assert.rejects(
    spectator.command({ kind: "manage", operation: "bot" }),
    /Not seated/,
  );
  await assert.rejects(
    a.command({
      kind: "play",
      revision: revisionBeforeDuplicate,
      action: { type: "claim", route: "r1", color: "red", wilds: -1 },
    }),
    /Invalid command/,
  );
  const before = await read();
  await a.command({
    kind: "play",
    revision: before.revision,
    action: { type: "start" },
  });
  const setup = await read(),
    other = await read("Bob");
  await Promise.all([
    command("Alice", {
      kind: "play",
      revision: setup.revision,
      action: { type: "keep", tickets: setup.game.me.pending.slice(0, 3) },
    }),
    command("Bob", {
      kind: "play",
      revision: other.revision,
      action: { type: "keep", tickets: other.game.me.pending.slice(0, 3) },
    }),
  ]);
  const playing = await read();
  assert.equal(playing.game.phase, "playing");
  assert(playing.game.turnDeadline);
  await wait(
    () =>
      a.messages.some((m) => m.room?.game.phase === "playing") &&
      b.messages.some((m) => m.room?.game.phase === "playing"),
  );
  const outsider = await read("Spectator");
  assert.equal(outsider.game.me, null);
  assert(!("deck" in outsider.game));
  assert(!("hand" in outsider.game.players[0]));
  await wait(() =>
    spectator.messages.some((m) => m.room?.game.phase === "playing"),
  );
  for (const m of spectator.messages) {
    if (m.room) {
      assert.equal(m.room.game.me, null);
      assert(!("deck" in m.room.game));
    }
  }
  await assert.rejects(
    command("Bob", {
      kind: "play",
      revision: playing.revision,
      action: { type: "draw", source: -1 },
    }),
    /turn/i,
  );
  await command("Alice", {
    kind: "play",
    revision: playing.revision,
    action: { type: "draw", source: -1 },
  });
  await assert.rejects(
    command("Alice", {
      kind: "play",
      revision: playing.revision,
      action: { type: "draw", source: -1 },
    }),
    /changed/,
  );
  assert.equal((await read()).game.turnDeadline, playing.game.turnDeadline);
  await mf.unsafeEvictDurableObject("test-grams", "TicketRoom", {
    name: code,
    webSockets: "hibernate",
  });
  const sent = await a.command({
    kind: "send",
    text: "After hibernation",
    clientId: "chat-after-wake",
  });
  assert.equal(sent.result.clientId, "chat-after-wake");
  await wait(() =>
    b.messages.some(
      (m) => m.type === "chat" && m.message.text === "After hibernation",
    ),
  );
  await assert.rejects(
    command("Alice", { kind: "send", text: "Too soon" }),
    /slow down/,
  );
  const page = await command("Bob", { kind: "chat" });
  assert.equal(page.messages[0].text, "After hibernation");
  assert.equal(
    (await command("Bob", { kind: "chat", before: page.messages[0]._id }))
      .messages.length,
    0,
  );
  const revision = (await read()).revision;
  assert.equal(
    (
      await raw("Alice", {
        kind: "play",
        revision,
        action: { type: "claim", route: "bad", color: "red", wilds: -1 },
      })
    ).status,
    400,
  );
  assert.equal((await read()).revision, revision);
  for (const ws of sockets) ws.close();
  await mf.dispose();
  mf = new Miniflare({
    ...convertV4MiniflareOptions({ workers: options.workers }),
    resourcePersistencePath: options.resourcePersistencePath,
  });
  const recovered = await read();
  assert.equal(recovered.revision, revision);
  assert.equal(recovered.game.drawn, 1);
  assert.equal(recovered.game.turnDeadline, playing.game.turnDeadline);
  assert.equal(
    (await command("Alice", { kind: "chat" })).messages[0].text,
    "After hibernation",
  );
  // The alarm expires the remaining draw with no players connected.
  const until = playing.game.turnDeadline - Date.now() + 500;
  if (until > 0) await new Promise((r) => setTimeout(r, until));
  assert.equal((await read()).game.turnNumber, playing.game.turnNumber + 1);
  await command("Bob", { kind: "manage", operation: "resign" });
  const turn = (await read()).game.turnNumber;
  const deadline = Date.now() + 5000;
  while ((await read()).game.turnNumber === turn) {
    assert(Date.now() < deadline, "Bot did not advance");
    await new Promise((r) => setTimeout(r, 50));
  }
  // Play a complete independent room, keeping result delivery offline through a rematch.
  slowResults = true;
  const fullCode = "BCDEFGHJ";
  await command("Alice", { kind: "create" }, fullCode, { mode: "classic" });
  await command("Bob", { kind: "join" }, fullCode);
  await command(
    "Alice",
    { kind: "play", revision: 1, action: { type: "start" } },
    fullCode,
  );
  for (const id of ["Alice", "Bob"]) {
    const state = await command(id, { kind: "get" }, fullCode);
    await command(
      id,
      {
        kind: "play",
        revision: state.revision,
        action: { type: "keep", tickets: state.game.me.pending.slice(0, 2) },
      },
      fullCode,
    );
  }
  let state = await command("Alice", { kind: "get" }, fullCode);
  for (let moves = 0; state.game.phase !== "finished"; moves++) {
    assert(moves < 1800, "Game did not finish");
    const id = state.game.players[state.game.turn].id;
    state = await command(id, { kind: "get" }, fullCode);
    const v = state.game;
    const game = {
      ...v,
      deck: Array(v.deckCount).fill("red"),
      discard: Array(v.discardCount).fill("red"),
      ticketDeck: Array(v.ticketCount).fill("hidden"),
      players: v.players.map((p: any) =>
        p.id === v.me.id ? v.me : { ...p, hand: [], tickets: [], pending: [] },
      ),
    } as Game;
    await command(
      id,
      { kind: "play", revision: state.revision, action: botAction(game, v.me) },
      fullCode,
    );
    state = await command(id, { kind: "get" }, fullCode);
  }
  const finalScores = state.game.results;
  await wait(() => !!releaseResult);
  // Chat must complete while the external result endpoint is still held open.
  const chatDuringDelivery = await Promise.race([
    command(
      "Alice",
      { kind: "send", text: "Still responsive", clientId: "delivery-test" },
      fullCode,
    ),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Result delivery blocked chat")), 1500),
    ),
  ]);
  assert.equal(chatDuringDelivery.clientId, "delivery-test");
  slowResults = false;
  releaseResult!();
  await command("Alice", { kind: "manage", operation: "rematch" }, fullCode);
  assert.equal(
    (await command("Alice", { kind: "get" }, fullCode)).game.phase,
    "lobby",
  );
  await mf.dispose();
  mf = new Miniflare({
    ...convertV4MiniflareOptions({ workers: options.workers }),
    resourcePersistencePath: options.resourcePersistencePath,
  });
  acceptResults = true;
  await wait(() => delivered.length === 1);
  assert.deepEqual(delivered[0].scores, finalScores);
  assert.equal(delivered[0].code, fullCode);
  // Leaving the last seat removes the lobby and its chat, without reviving it on ticket replay.
  await command("Alice", { kind: "send", text: "Cleanup me" }, fullCode);
  await command("Bob", { kind: "manage", operation: "leave" }, fullCode);
  await command("Alice", { kind: "manage", operation: "leave" }, fullCode);
  assert.equal(await command("Alice", { kind: "get" }, fullCode), null);
  await assert.rejects(
    command("Alice", { kind: "create" }, fullCode, { mode: "classic" }),
    /already used/,
  );
  console.log(
    "Ticket Worker passed: authentication, room authorization, private views, concurrent choices, revisions, hibernation, chat, restart, timer/bot alarms, full-round results, delivery retry across restart/rematch, and empty lobbies.",
  );
} finally {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {}
  }
  await mf.dispose();
  await new Promise<void>((resolve, reject) =>
    resultServer.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(dir, { recursive: true, force: true });
}
