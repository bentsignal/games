import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { signIn } from "./auth";
test("Grams preserves its interface and plays a complete round with two accounts", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(110000);
  execFileSync("npx", ["convex", "run", "testing:resetGrams", "{}"], {
    stdio: "pipe",
  });
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  b.on("pageerror", (e) => errors.push(e.message));
  try {
    await a.goto(baseURL! + "/grams");
    await signIn(a, "Grams_A_QA");
    const fa = a.frameLocator('iframe[title="Grams"]');
    await expect(fa.locator("#name-input")).toHaveValue("Grams_A_QA");
    await a.screenshot({ path: "/tmp/grams-home.png" });
    await fa.locator("#name-input").press("Enter");
    await expect(fa.locator("#start")).toBeVisible();
    await b.goto(baseURL! + "/grams");
    await signIn(b, "Grams_B_QA");
    const fb = b.frameLocator('iframe[title="Grams"]');
    await expect(fb.locator("#name-input")).toHaveValue("Grams_B_QA");
    await fb.locator("#name-input").press("Enter");
    await expect(fa.locator("#player-list-wrapper")).toContainText(
      "Grams_B_QA",
    );
    await fa.locator("#chat-input").fill("Grams is back!");
    await fa.locator("#chat-input").press("Enter");
    await expect(fb.locator("#chat")).toContainText("Grams is back!");
    expect(errors).toEqual([]);
    await fa.locator("#emote-button").click();
    await fa.locator("#ben-emote-1").click();
    await expect(
      fb.locator('img.emote[src="images/ben-emote-1.jpg"]'),
    ).toHaveCount(1);
    await fa.locator("#start").click();
    await expect(fa.locator(".letter-available.filled")).toHaveCount(6, {
      timeout: 10000,
    });
    const letters = await fa
      .locator(".letter-available.filled")
      .allTextContents();
    const dict = JSON.parse(
      readFileSync("convex/gramsData/allow.json", "utf8"),
    ) as Record<string, Record<string, string[]>>;
    const words = Object.values(dict).flatMap((groups) =>
      Object.values(groups).flat(),
    );
    const word = words.find((w) => {
      const pool = [...letters];
      return (
        w.length >= 3 &&
        [...w].every((c) => {
          const i = pool.indexOf(c);
          if (i < 0) return false;
          pool.splice(i, 1);
          return true;
        })
      );
    })!;
    expect(word).toBeTruthy();
    await fa.locator("#timer").click();
    await a.keyboard.type(word);
    await a.keyboard.press("Enter");
    await expect(fa.locator("#wordCount")).toHaveText("Words: 1");
    await expect(fb.locator("#player-list-wrapper")).toContainText(
      /Score: [1-9]/,
    );
    await a.screenshot({ path: "/tmp/grams-playing.png" });
    await a.reload();
    await expect(fa.locator("#name-input")).toHaveValue("Grams_A_QA");
    await fa.locator("#name-input").press("Enter");
    await expect(fa.locator("#wordCount")).toHaveText("Words: 1");
    await expect(fa.locator(".letter-available.filled")).toHaveCount(6);

    await expect(fa.locator("#results-wrapper")).toBeVisible({
      timeout: 70000,
    });
    await expect(fa.locator("#results-wrapper")).toContainText(word);
    await expect(fb.locator("#results-wrapper")).toContainText(word);
    await a.screenshot({ path: "/tmp/grams-results.png" });
    expect(errors).toEqual([]);
    await fa.locator("#leave").click();
    await fb.locator("#leave").click();
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("hub links to both games with one account", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "Hub_QA");
  await expect(
    page.getByRole("heading", { name: "Games", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/games-hub.png" });
  await page.getByRole("link", { name: /Ticket to Ride/ }).click();
  await expect(
    page.getByRole("button", { name: "Create a game", exact: true }),
  ).toBeVisible();
  await page.locator(".account-menu summary").click();
  await page.getByRole("link", { name: "Games", exact: true }).click();
  await page.getByRole("link", { name: /Grams/ }).click();
  await expect(page.frameLocator("iframe").locator("#name-input")).toHaveValue(
    "Hub_QA",
  );
});
