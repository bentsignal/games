import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { signTicket } from "../shared/realtimeAuth";

const dir = await mkdtemp(`${tmpdir()}/room-expiry-`);
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
const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: "test-rooms",
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
          CONVEX_URL: "https://unused.invalid",
          ALLOWED_ORIGINS: "https://games.test",
          ROOM_IDLE_MS: 3000,
        },
      },
    ],
  }),
  resourcePersistencePath: `${dir}/storage`,
});
const sign = (aud: string, fields: Record<string, unknown>) =>
  signTicket(
    {
      iss: "games-realtime",
      aud,
      exp: Date.now() / 1000 + 60,
      id: "Alice",
      userId: "Alice",
      name: "Alice",
      ...fields,
    },
    "local-test-secret",
  );
async function waitFor(check: () => Promise<boolean>) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Room did not expire");
}
async function ticket(
  args: Record<string, unknown>,
  create = false,
): Promise<any> {
  const response = await mf.dispatchFetch(
    "https://worker.test/ticket/TICKET23",
    {
      method: "POST",
      headers: {
        Origin: "https://games.test",
        "Content-Type": "application/json",
        Authorization: `Bearer ${sign("ticket:room", {
          code: "TICKET23",
          ...(create ? { create: { mode: "classic" } } : {}),
        })}`,
      },
      body: JSON.stringify(args),
    },
  );
  const body = (await response.json()) as any;
  if (body.error) throw new Error(body.error);
  return body.result;
}
async function grams(create: boolean) {
  return mf.dispatchFetch("https://worker.test/grams/GRAMS234", {
    headers: {
      Upgrade: "websocket",
      Origin: "https://games.test",
      "Sec-WebSocket-Protocol": `grams, ${sign("grams:GRAMS234", { create })}`,
    },
  });
}
try {
  const first = await grams(true);
  assert.equal(first.status, 101);
  const socket = first.webSocket!;
  socket.accept();
  // A keepalive is not player activity, even while the tab remains connected.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  socket.send("ping");
  await waitFor(async () => {
    const old = await grams(false);
    if (old.status !== 101) return false;
    const ws = old.webSocket!;
    ws.accept();
    let missing = false;
    ws.addEventListener("message", (event) => {
      if (String(event.data).includes("Lobby not found")) missing = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    ws.close();
    return missing;
  });
  const recreated = await grams(true);
  assert.equal(recreated.status, 101);
  recreated.webSocket!.accept();
  recreated.webSocket!.close();
  socket.close();

  await ticket({ kind: "create" }, true);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await ticket({ kind: "send", text: "Temporary chat" });
  await new Promise((resolve) => setTimeout(resolve, 2250));
  assert((await ticket({ kind: "get" }))?.game);
  await waitFor(async () => (await ticket({ kind: "get" })) === null);
  await ticket({ kind: "create" }, true);
  assert.deepEqual((await ticket({ kind: "chat" })).messages, []);
  console.log(
    "Room expiry Worker passed: idle expiry, ping, activity reset, and chat deletion.",
  );
} finally {
  await mf.dispose();
  await rm(dir, { recursive: true, force: true });
}
