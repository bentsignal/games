import { test, expect } from "@playwright/test";
import { signIn } from "./auth";
test("host timer counts down for both players and completes a partial draw after disconnect", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(80000);
  const ca = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const cb = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await a.goto(baseURL! + "/ticket");
    await signIn(a, "Timer_Host_QA");
    await a.getByRole("button", { name: "Create a game", exact: true }).click();
    await expect(a.getByLabel("TURN TIMER", { exact: true })).toHaveValue("0");
    await a.getByLabel("TURN TIMER", { exact: true }).selectOption("30");
    await b.goto(a.url());
    await signIn(b, "Timer_Friend_QA");
    await b.getByRole("button", { name: "Join game", exact: true }).click();
    await expect(b.getByLabel("TURN TIMER", { exact: true })).toHaveValue("30");
    await expect(b.getByLabel("TURN TIMER", { exact: true })).toBeDisabled();
    await a.getByRole("button", { name: "Start game", exact: true }).click();
    for (const p of [a, b]) {
      const dialog = p.getByRole("dialog", {
        name: "Choose destination tickets",
      });
      await expect(dialog).toBeVisible();
      await expect(p.getByRole("timer")).toHaveCount(0);
      for (let i = 0; i < 3; i++)
        await dialog.locator(".ticket-tile").nth(i).click();
      await dialog.getByRole("button", { name: "Keep 3 tickets" }).click();
    }
    await expect(a.getByRole("timer")).toBeVisible();
    await expect(b.getByRole("timer")).toBeVisible();
    await expect(a.getByRole("timer")).toHaveText(/0:(2\d|30)/);
    await a.getByRole("button", { name: "Draw from hidden deck" }).click();
    await expect(a.getByText("Choose one more train card.")).toBeVisible();
    await a.screenshot({ path: "/tmp/ticket-turn-timer.png" });
    const url = a.url();
    await ca.close();
    await expect(b.getByText("Your turn", { exact: true })).toBeVisible({
      timeout: 35000,
    });
    await expect(b.getByRole("timer")).toHaveText(/0:(2\d|30)/);
    const reconnected = await browser.newPage();
    await reconnected.goto(url);
    await signIn(reconnected, "Timer_Host_QA");
    await expect(reconnected.locator(".hand-title h3")).toContainText("6");
    await reconnected.close();
  } finally {
    await ca.close();
    await cb.close();
  }
});
