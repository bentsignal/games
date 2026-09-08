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
    (window as any).sounds = { claps: 0, voices: 0 };
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      (window as any).sounds.claps++;
      return original.call(this);
    };
    const oscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      (window as any).sounds.voices++;
      return oscillator.call(this);
    };
  });
  const url = server.resolvedUrls!.local[0] + "tests/fixtures/game-events.html";
  await page.goto(url);
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
  const route = page.locator(`[data-route="${orange.id}"]`);
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
    .poll(() => page.evaluate(() => (window as any).sounds.claps))
    .toBeGreaterThan(90);
  await page.screenshot({ path: "/tmp/ticket-winner.png" });
  await expect(page.locator(".winner-confetti")).toBeHidden({ timeout: 6500 });
  await page.reload();
  await page.getByRole("button", { name: "Lose", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).sounds.voices))
    .toBe(7);
  await expect(page.locator(".winner-confetti")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: "Win", exact: true }).click();
  await expect(page.locator(".winner-confetti")).toBeHidden();
  assert.deepEqual(errors, []);
  console.log(
    "Passed: colored blocked lane, rainbow card, timed centered final round, winner claps/full-screen confetti, loser boos, reduced motion.",
  );
} finally {
  await browser.close();
  await server.close();
}
