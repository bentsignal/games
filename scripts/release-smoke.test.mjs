import { test } from "node:test";
import assert from "node:assert/strict";
import { smokeFrontend } from "./release-smoke.mjs";

const sha = "a".repeat(40);
function serve(t, overrides = {}) {
  const fixtures = {
    "/release.json": [JSON.stringify({ sha }), "application/json"],
    "/assets/main.js": [
      'const url="https://api.games.bentsignal.com"; import(`./Grams.js`)',
      "application/javascript",
    ],
    "/assets/Grams.js": [
      'const url="https://games-grams.shawnrodgers266.workers.dev";',
      "application/javascript",
    ],
    "/grams-assets/v1/images/logo_600.png": ["image", "image/png"],
    ...overrides,
  };
  t.mock.method(globalThis, "fetch", async (input) => {
    const path = new URL(input).pathname;
    const redirect = {
      "/room/SMOKE": "/ticket/room/SMOKE",
      "/ending-preview": "/ticket/ending-preview",
    }[path];
    if (redirect)
      return new Response(null, {
        status: 301,
        headers: { location: redirect },
      });
    const [body, type] = fixtures[path] ?? [
      '<div id="root"></div><script src="/assets/main.js"></script>',
      "text/html",
    ];
    return new Response(body, {
      headers: { "content-type": type, "x-content-type-options": "nosniff" },
    });
  });
}

test("release smoke follows lazy game chunks", async (t) => {
  serve(t);
  await smokeFrontend("https://candidate.example", sha);
});
test("preview smoke validates preview URLs instead of production URLs", async (t) => {
  const target = {
    convexUrl: "https://chatty-okapi-416.convex.cloud",
    workerUrl: "https://games-grams-preview.shawnrodgers266.workers.dev",
  };
  serve(t, {
    "/assets/main.js": [
      `const url="${target.convexUrl}"; import('./Grams.js')`,
      "application/javascript",
    ],
    "/assets/Grams.js": [
      `const url="${target.workerUrl}";`,
      "application/javascript",
    ],
  });
  await smokeFrontend("https://preview.example", sha, target);
  await assert.rejects(smokeFrontend("https://preview.example", sha));
});
test("deployed build excludes the actual local development login endpoint", async (t) => {
  serve(t, {
    "/assets/Grams.js": [
      'const url="https://games-grams.shawnrodgers266.workers.dev"; fetch("/__games/dev-login")',
      "application/javascript",
    ],
  });
  await assert.rejects(smokeFrontend("https://candidate.example", sha));
});
test("release smoke rejects a stale deployment", async (t) => {
  serve(t, {
    "/release.json": [JSON.stringify({ sha: "old" }), "application/json"],
  });
  await assert.rejects(smokeFrontend("https://candidate.example", sha));
});
test("release smoke rejects SPA fallback served as a missing game chunk", async (t) => {
  serve(t, { "/assets/Grams.js": ["<html>fallback</html>", "text/html"] });
  await assert.rejects(smokeFrontend("https://candidate.example", sha));
});
test("release smoke rejects development auth in a lazy game chunk", async (t) => {
  serve(t, {
    "/assets/Grams.js": [
      'const url="https://games-grams.shawnrodgers266.workers.dev"; fetch("/__dev/sign-in")',
      "application/javascript",
    ],
  });
  await assert.rejects(smokeFrontend("https://candidate.example", sha));
});
