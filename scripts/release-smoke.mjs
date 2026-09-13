import assert from "node:assert/strict";

export async function smokeFrontend(origin, sha) {
  const get = (path, options = {}) =>
    fetch(new URL(path, origin), {
      signal: AbortSignal.timeout(15000),
      ...options,
    });
  const marker = await get(`/release.json?sha=${sha}`);
  assert.equal(marker.status, 200);
  assert.equal((await marker.json()).sha, sha, "Wrong frontend release");
  for (const path of ["/", "/ticket", "/ticket/room/SMOKE", "/grams"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const html = await response.text();
    assert.match(html, /id="root"/);
    const script = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert.ok(script, "Missing frontend bundle");
    const bundle = await get(script[1]);
    assert.equal(bundle.status, 200);
    assert.match(bundle.headers.get("content-type"), /javascript/);
    let js = await bundle.text();
    // Vite splits the games into lazy chunks; their service URLs are not in the
    // entry bundle. Check those assets as well as the initial application shell.
    for (const match of js.matchAll(/import\([`"'](\.\/[^`"']+\.js)[`"']/g)) {
      const chunk = await fetch(new URL(match[1], new URL(script[1], origin)), {
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(chunk.status, 200);
      assert.match(chunk.headers.get("content-type"), /javascript/);
      js += await chunk.text();
    }
    assert.ok(js.includes("https://api.games.bentsignal.com"));
    assert.ok(js.includes("https://games-grams.shawnrodgers266.workers.dev"));
    assert.ok(!js.includes("/__dev/sign-in"), "Development auth in production");
  }
  for (const [path, target] of [
    ["/room/SMOKE", "/ticket/room/SMOKE"],
    ["/ending-preview", "/ticket/ending-preview"],
  ]) {
    const response = await get(path, { redirect: "manual" });
    assert.equal(response.status, 301);
    assert.equal(
      new URL(response.headers.get("location"), origin).pathname,
      target,
    );
  }
  const asset = await get("/grams-assets/v1/images/logo_600.png");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /image/);
}

export async function smokeBackends() {
  const health = await fetch(
    "https://games-grams.shawnrodgers266.workers.dev/health",
    { signal: AbortSignal.timeout(15000) },
  );
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    game: "grams",
    transport: "durable-object",
  });
  const query = await fetch("https://api.games.bentsignal.com/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "users:me",
      args: [{}],
      format: "convex_encoded_json",
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(query.status, 200);
  const body = await query.json();
  assert.equal(body.status, "success");
  assert.equal(
    body.value,
    null,
    "Anonymous request unexpectedly authenticated",
  );
}

export async function retry(check, attempts = 12) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await check();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
