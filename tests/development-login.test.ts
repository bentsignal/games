import { afterEach, expect, test } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { developmentAuth } from "../scripts/dev-auth";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});

async function serverFor(deployment = "dev:temporary-test") {
  const dir = await mkdtemp(join(tmpdir(), "games-login-test-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, ".dev"));
  await mkdir(join(dir, "node_modules/.bin"), { recursive: true });
  await writeFile(
    join(dir, ".env.local"),
    `VITE_DEV_AUTH=1\nCONVEX_DEPLOYMENT=${deployment}\nVITE_CONVEX_URL=https://temporary-test.convex.cloud\nGAMES_WEB_ORIGIN=https://games.localhost:1355\n`,
  );
  await writeFile(
    join(dir, ".dev/setup.json"),
    JSON.stringify({ deployment: "temporary-test" }),
  );
  await writeFile(
    join(dir, "node_modules/.bin/convex"),
    `#!${process.execPath}\nconsole.log(JSON.stringify({accessToken:'test-access',refreshToken:'test-refresh'}));\n`,
    { mode: 0o700 },
  );
  const server = await createServer({
    configFile: false,
    root: dir,
    logLevel: "silent",
    plugins: [developmentAuth(dir + "/")],
    server: { port: 0, host: "127.0.0.1" },
  });
  cleanup.push(() => server.close());
  await server.listen();
  return server;
}

function url(server: ViteDevServer) {
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Expected test server port");
  return `http://127.0.0.1:${address.port}/__games/dev-login`;
}

test("local login requires same-origin JSON POST and a valid username", async () => {
  const server = await serverFor();
  const endpoint = url(server);
  expect((await fetch(endpoint)).status).toBe(403);
  expect(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: {
          Origin: "https://other.example",
          "Content-Type": "application/json",
        },
        body: '{"username":"Alice"}',
      })
    ).status,
  ).toBe(403);
  const headers = {
    Origin: "https://games.localhost:1355",
    "Content-Type": "application/json",
  };
  expect(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "X-Forwarded-For": "192.0.2.1" },
        body: '{"username":"Alice"}',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(endpoint, {
        method: "POST",
        headers,
        body: '{"username":"!"}',
      })
    ).status,
  ).toBe(400);
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: '{"username":"Alice"}',
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    accessToken: "test-access",
    refreshToken: "test-refresh",
  });
});

test("local login refuses a production deployment", async () => {
  await expect(serverFor("prod:temporary-test")).rejects.toThrow(
    /isolated development deployment/,
  );
});
