import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";

// Exercise real React effects with deterministic tickets, without touching a server game.
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 950 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as any).__bellStrikes = 0;
    const native = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = native.call(this),
        start = node.start.bind(node);
      node.start = (...args) => {
        if (node.frequency.value === 880) (window as any).__bellStrikes++;
        start(...args);
      };
      return node;
    };
  });
  await page.goto(
    `${server.resolvedUrls!.local[0]}tests/fixtures/destination-feedback.html`,
  );
  const notice = page.getByRole("status");
  await expect(page.locator('[data-city="Vancouver"]')).toHaveAttribute(
    "data-destination-status",
    "incomplete",
  );
  await expect(notice).toHaveCount(0);
  await page.getByRole("button", { name: "Complete Portland ticket" }).click();
  await expect(notice).toContainText("Vancouver – Portland +2");
  await expect(page.locator(".destination-complete-ring")).toHaveCount(2);
  await expect(page.locator('[data-city="Portland"]')).toHaveAttribute(
    "data-destination-status",
    "complete",
  );
  await expect(page.locator('[data-city="Vancouver"]')).toHaveAttribute(
    "data-destination-status",
    "incomplete",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__bellStrikes))
    .toBe(2);
  await expect(notice).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "/tmp/ticket-completion.png" });
  await page.getByRole("button", { name: "Unrelated update" }).click();
  await expect(notice).toHaveCount(0, { timeout: 5000 });
  await page.getByRole("button", { name: "Unrelated update" }).click();
  await expect(notice).toHaveCount(0);
  assert.equal(await page.evaluate(() => (window as any).__bellStrikes), 2);
  await page.getByRole("button", { name: "Switch viewer" }).click();
  await expect(page.locator('[data-route="r1"]')).not.toHaveAttribute(
    "data-owner-color",
    "#ffc629",
  );
  await page.getByRole("button", { name: "Switch viewer" }).click();
  await expect(page.locator('[data-route="r1"]')).toHaveAttribute(
    "data-owner-color",
    "#ffc629",
  );
  await expect(notice).toHaveCount(0); // Returning to completed tickets is not a new completion.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Complete Denver ticket" }).click();
  await expect(notice).toContainText("Vancouver – Denver +11");
  await expect(notice).toHaveCSS("animation-name", "none");
  await expect(page.locator('[data-city="Vancouver"]')).toHaveAttribute(
    "data-destination-status",
    "complete",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__bellStrikes))
    .toBe(4);
  assert.deepEqual(errors, []);
  console.log(
    "Completion animation, bell, mixed endpoints, viewer colors, and reduced motion passed.",
  );
} finally {
  await browser.close();
  await server.close();
}
