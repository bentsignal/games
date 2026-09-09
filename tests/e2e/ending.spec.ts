import { signIn } from "./auth";
import { test, expect } from "@playwright/test";

test("the final reveal keeps the winner hidden, counts all scores, and supports chat, pause, skip and replay", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as any).__golfClaps = 0;
    (window as any).__cashSounds = 0;
    (window as any).__buzzerSounds = 0;
    const nativeSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = nativeSource.call(this),
        start = source.start.bind(source);
      source.start = (...args) => {
        if (source.buffer && Math.abs(source.buffer.duration - 4) < 0.1)
          (window as any).__golfClaps++;
        start(...args);
      };
      return source;
    };
    const native = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = native.call(this),
        start = node.start.bind(node);
      node.start = (...args) => {
        if (node.type === "sine" && Math.abs(node.frequency.value - 1568) < 0.1)
          (window as any).__cashSounds++;
        if (node.type === "sawtooth") (window as any).__buzzerSounds++;
        start(...args);
      };
      return node;
    };
  });
  await page.goto("/ticket/ending-preview");
  await signIn(page, "Ending_QA");
  await page.getByRole("button", { name: "Create ending preview" }).click();
  await expect(page).toHaveURL(/\/room\//);
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible();
  await expect(page.locator(".player-score")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Scoreboard" })).toHaveCount(0);
  await page.getByRole("button", { name: "Draw from hidden deck" }).click();
  await expect(page.getByText("Choose one more train card.")).toBeVisible();
  await page.getByRole("button", { name: "Draw from hidden deck" }).click();
  const scoreboard = page.locator(".scoreboard");
  await expect(page.getByRole("tab", { name: "Scoreboard" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(scoreboard).toHaveAttribute("data-reveal-done", "false");
  await expect(page.locator(".rank-trophy")).toHaveCount(0);
  await expect(page.locator(".award-globe,.award-longest")).toHaveCount(0);
  expect(await page.locator(".result-name").allTextContents()).toEqual([
    "Ending_QA",
    "Jules",
    "Ada",
    "Miles",
  ]);
  const firstTotal = page.locator(".result-total").first();
  await expect
    .poll(async () => Number(await firstTotal.textContent()))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause scoring" }).click();
  const paused = await firstTotal.textContent();
  await page.waitForTimeout(300);
  expect(await firstTotal.textContent()).toBe(paused);
  expect(Number(paused)).toBeLessThan(57);
  const tabsY = (await page.locator(".sidebar-tabs").boundingBox())!.y;
  const play = (await page
    .getByRole("button", { name: "Play again", exact: true })
    .boundingBox())!;
  const leave = (await page
    .getByRole("button", { name: "Leave table", exact: true })
    .boundingBox())!;
  expect(play.y + play.height).toBeLessThanOrEqual(leave.y);
  expect(leave.y + leave.height).toBeLessThan(tabsY);
  await page.getByRole("tab", { name: /Chat/ }).click();
  await page.getByLabel("Chat message").fill("Keep counting after this.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByLabel("Chat message")).toHaveValue("");
  await page.getByRole("tab", { name: "Scoreboard" }).click();
  expect(await firstTotal.textContent()).toBe(paused);
  await expect(
    page.getByRole("button", { name: "Resume scoring" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip to final scores" }).click();
  await expect(scoreboard).toHaveAttribute("data-reveal-done", "true");
  expect(await page.locator(".result-name").allTextContents()).toEqual([
    "Miles",
    "Ending_QA",
    "Jules",
    "Ada",
  ]);
  expect(await page.locator(".result-total").allTextContents()).toEqual([
    "94",
    "80",
    "40",
    "23",
  ]);
  await expect(page.getByLabel("Gold trophy")).toHaveCount(1);
  await expect(page.getByLabel("Silver trophy")).toHaveCount(1);
  await expect(page.getByLabel("Bronze trophy")).toHaveCount(1);
  await expect(page.locator(".award-globe")).toHaveCount(2);
  await expect(page.locator(".award-longest")).toHaveCount(1);
  expect((await page.locator(".sidebar-tabs").boundingBox())!.y).toBe(tabsY);
  await page
    .getByText("Reveal destination tickets", { exact: true })
    .first()
    .click();
  await expect(page.locator(".revealed-ticket").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/scoreboard-final.png",
    fullPage: true,
  });
  await page.reload();
  await expect(scoreboard).toHaveAttribute("data-reveal-done", "true");
  await page.getByRole("button", { name: "Replay scoring" }).click();
  await expect(scoreboard).toHaveAttribute("data-reveal-done", "false");
  await expect(page.locator(".rank-trophy")).toHaveCount(0);
  await expect(page.locator(".score-reveal-card")).toContainText(
    "Base score (trains placed)",
  );
  await expect(page.locator(".score-reveal-card")).toContainText(
    "Destination tickets",
    { timeout: 16000 },
  );
  const ticketSubtotal = page
    .locator(".result-row")
    .first()
    .locator("dl > div")
    .nth(1)
    .locator("dd");
  await expect
    .poll(async () => Number(await ticketSubtotal.textContent()))
    .toBeGreaterThan(0);
  await expect(page.locator(".result-row").first().locator("dl")).toContainText(
    "1 complete",
  );
  await page.screenshot({
    path: "test-results/scoreboard-counting.png",
    fullPage: true,
  });
  await expect(page.locator(".score-reveal-card")).toContainText(
    "Longest trail",
    { timeout: 60000 },
  );
  await expect(page.locator(".score-reveal-card")).toContainText(
    "Globetrotter",
    { timeout: 20000 },
  );
  await expect(scoreboard).toHaveAttribute("data-reveal-done", "true", {
    timeout: 20000,
  });
  expect(await page.locator(".result-total").allTextContents()).toEqual([
    "94",
    "80",
    "40",
    "23",
  ]);
  expect(
    await page.evaluate(() => (window as any).__cashSounds),
  ).toBeGreaterThan(7);
  expect(
    await page.evaluate(() => (window as any).__buzzerSounds),
  ).toBeGreaterThan(0);
  await expect(
    page.locator(".result-row").filter({ hasText: "Longest trail" }),
  ).toHaveCount(4);
  await expect(
    page.locator(".result-row").filter({ hasText: "Globetrotter" }),
  ).toHaveCount(4);
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__golfClaps))
    .toBeGreaterThan(0);
  await expect(
    page.getByText("The final whistle. All destination tickets are revealed.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Tickets/ }).click();
  await expect(
    page.locator(".sidebar-content .ticket-tile").first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("the finished scoreboard and chat remain usable on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ticket/ending-preview");
  await signIn(page, "Mobile_ending_QA");
  await page.getByRole("button", { name: "Create ending preview" }).click();
  await page.getByRole("button", { name: "Draw from hidden deck" }).click();
  await expect(page.getByText("Choose one more train card.")).toBeVisible();
  await page.getByRole("button", { name: "Draw from hidden deck" }).click();
  await expect(page.getByRole("tab", { name: "Scoreboard" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".score-reveal-card")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.getByRole("button", { name: "Skip to final scores" }).click();
  await expect(page.locator(".scoreboard")).toHaveAttribute(
    "data-reveal-done",
    "true",
  );
  await page.getByRole("tab", { name: /Chat/ }).click();
  await page.getByLabel("Chat message").fill("Good game!");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Good game!", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Scoreboard" }).click();
  await page
    .getByRole("button", { name: "Play again", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/scoreboard-mobile.png",
    fullPage: true,
  });
});
