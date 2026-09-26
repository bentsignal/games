import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { PALETTE, ROUTES } from "../src/game/data";
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).crowdPlayed = [];
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const node = original.call(this),
        start = node.start.bind(node);
      node.start = (...args) => {
        if (node.buffer && node.buffer.duration > 4) {
          const analyser = this.createAnalyser();
          node.connect(analyser);
          (window as any).crowdAnalyser = analyser;
          (window as any).crowdPlayed.push(node.buffer.duration);
        }
        start(...args);
      };
      return node;
    };
  });
  const url = server.resolvedUrls!.local[0] + "tests/fixtures/game-events.html";
  const audioRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.resourceType() === "fetch" &&
      /\.mp3(?:\?|$)/.test(request.url())
    )
      audioRequests.push(request.url());
  });
  await page.goto(url);
  assert.equal(audioRequests.length, 0);
  await expect(page.getByText("RAINBOW", { exact: true })).toBeVisible();
  const orange = ROUTES.find(
    (r) =>
      r.color === "orange" &&
      ROUTES.some(
        (o) =>
          o.a === r.a &&
          o.b === r.b &&
          o.color !== r.color &&
          o.color !== "gray",
      ),
  )!;
  const route = page.locator(`[data-artwork-route="${orange.id}"]`);
  await expect(route).toHaveClass(/closed/);
  await expect(route.locator("rect").first()).toHaveAttribute(
    "fill",
    PALETTE.orange,
  );
  await expect(route.locator(".closed-mark").first()).toBeVisible();
  await page.getByRole("button", { name: "Final round", exact: true }).click();
  await expect(page.locator(".final-round-announcement")).toBeVisible();
  const notice = await page
    .locator(".final-round-announcement > div")
    .boundingBox();
  const board = (await page.locator(".board-shell").boundingBox())!;
  assert(
    Math.abs(notice!.x + notice!.width / 2 - board.x - board.width / 2) < 2,
  );
  assert(
    Math.abs(notice!.y + notice!.height / 2 - board.y - board.height / 2) < 2,
  );
  await page.screenshot({ path: "/tmp/ticket-final-round.png" });
  await expect(page.locator(".final-round-announcement")).toBeHidden({
    timeout: 4000,
  });
  await page.getByRole("button", { name: "Win", exact: true }).click();
  await expect(page.locator("body > .winner-confetti")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).crowdPlayed.length))
    .toBe(1);
  assert(audioRequests.every((url) => url.includes("applause")));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as any).crowdAnalyser as AnalyserNode;
        const samples = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(samples);
        return Math.sqrt(
          samples.reduce((sum, n) => sum + n * n, 0) / samples.length,
        );
      }),
    )
    .toBeGreaterThan(0.01);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/ticket-winner.png" });
  await expect(page.locator(".winner-confetti")).toBeHidden({ timeout: 8000 });
  await page.reload();
  await page.getByRole("button", { name: "Lose", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).crowdPlayed.length))
    .toBe(1);
  const duration = await page.evaluate(() => (window as any).crowdPlayed[0]);
  assert(Math.abs(duration - 4.5) < 0.1);
  assert(audioRequests.at(-1)!.includes("boo"));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as any).crowdAnalyser as AnalyserNode;
        const samples = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(samples);
        return Math.sqrt(
          samples.reduce((sum, n) => sum + n * n, 0) / samples.length,
        );
      }),
    )
    .toBeGreaterThan(0.01);
  await expect(page.locator(".winner-confetti")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: "Win", exact: true }).click();
  await expect(page.locator(".winner-confetti")).toBeHidden();
  await page.getByRole("button", { name: "Mute effects" }).click();
  const count = await page.evaluate(() => (window as any).crowdPlayed.length);
  await page.getByRole("button", { name: "Reset result" }).click();
  await page.getByRole("button", { name: "Lose", exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => (window as any).crowdPlayed.length),
    count,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed: colored blocked lane, rainbow card, timed centered final round, winner claps/full-screen confetti, loser boos, reduced motion.",
  );
} finally {
  await browser.close();
  await server.close();
}
