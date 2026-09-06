import { test, expect } from "@playwright/test";
test("two independent friends join, choose tickets, chat, draw, and reconnect", async ({
  browser,
  baseURL,
}) => {
  const first = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    second = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
  const a = await first.newPage(),
    b = await second.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  b.on("pageerror", (e) => errors.push(e.message));
  await a.goto(baseURL!);
  await a.getByLabel("YOUR CONDUCTOR NAME").fill("Alice QA");
  await a.getByRole("button", { name: "Create a private table" }).click();
  await expect(a).toHaveURL(/\/room\/[A-Z2-9]{8}/);
  const url = a.url();
  await b.goto(url);
  await b.getByLabel("YOUR CONDUCTOR NAME").fill("Bob QA");
  await b.getByRole("button", { name: "Take your seat" }).click();
  await expect(a.getByText("Bob QA", { exact: true }).first()).toBeVisible();
  await a.getByRole("tab", { name: /Chat/ }).click();
  await a.getByLabel("Chat message").fill("All aboard, Bob!");
  await a.getByRole("button", { name: "Send message" }).click();
  await b.getByRole("tab", { name: /Chat/ }).click();
  await expect(b.getByText("All aboard, Bob!", { exact: true })).toBeVisible();
  await a.getByRole("button", { name: "Start the journey" }).click();
  for (const page of [a, b]) {
    const dialog = page.getByRole("dialog", {
      name: "Choose destination tickets",
    });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 3; i++)
      await dialog.locator(".ticket-tile").nth(i).click();
    await dialog.getByRole("button", { name: "Keep 3 tickets" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(
    a.getByText("Your turn, conductor.", { exact: true }),
  ).toBeVisible();
  await expect(
    b.getByRole("button", { name: "Draw from hidden deck" }),
  ).toBeDisabled();
  await a.getByRole("button", { name: "Draw from hidden deck" }).click();
  await expect(a.getByText("Choose one more train card.")).toBeVisible();
  await a.getByRole("button", { name: "Draw from hidden deck" }).click();
  await expect(
    b.getByText("Your turn, conductor.", { exact: true }),
  ).toBeVisible();
  await b.reload();
  await expect(
    b.getByText("Your turn, conductor.", { exact: true }),
  ).toBeVisible();
  await expect(b.getByText("Bob QA (you)", { exact: true })).toBeVisible();
  await expect(b.getByRole("dialog")).toHaveCount(0);
  await b.getByRole("button", { name: "Draw destination tickets" }).click();
  const dialog = b.getByRole("dialog", { name: "Choose destination tickets" });
  await expect(dialog.locator(".ticket-tile")).toHaveCount(4);
  await dialog.locator(".ticket-tile").first().click();
  await dialog.getByRole("button", { name: "Keep 1 tickets" }).click();
  await expect(
    a.getByText("Your turn, conductor.", { exact: true }),
  ).toBeVisible();
  await a.getByRole("button", { name: "Open route list" }).click();
  await a.getByLabel("Search routes").fill("Vancouver");
  await expect(
    a.getByRole("dialog", { name: "Route list" }).locator(".route-list button"),
  ).toHaveCount(3);
  await a
    .getByRole("dialog", { name: "Route list" })
    .getByRole("button", { name: /Vancouver → Seattle/ })
    .first()
    .click();
  await a.getByRole("button", { name: "Claim route", exact: true }).click();
  await expect(
    b.getByText("Your turn, conductor.", { exact: true }),
  ).toBeVisible();
  await b.getByRole("tab", { name: "Activity" }).click();
  await expect(
    b.getByText("Alice QA claimed Vancouver → Seattle (+1).", { exact: true }),
  ).toBeVisible();
  await a.screenshot({
    path: "test-results/multiplayer-desktop.png",
    fullPage: true,
  });
  await expect(a.getByText("3D view unavailable")).toHaveCount(0);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});
test("computer takeover finishes the game, reveals scores, and rematches", async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("YOUR CONDUCTOR NAME").fill("Conductor QA");
  await page.getByRole("button", { name: "Create a private table" }).click();
  await page.getByRole("button", { name: "Add computer opponent" }).click();
  await page.getByRole("button", { name: "Start the journey" }).click();
  const tickets = page.getByRole("dialog", {
    name: "Choose destination tickets",
  });
  for (let i = 0; i < 3; i++)
    await tickets.locator(".ticket-tile").nth(i).click();
  await tickets.getByRole("button", { name: "Keep 3 tickets" }).click();
  await page
    .getByRole("button", { name: "Let a computer finish my game" })
    .click();
  await page
    .getByRole("button", { name: "Hand over my seat", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The final whistle.", exact: true }),
  ).toBeVisible({ timeout: 210000 });
  await expect(page.locator(".result-row")).toHaveCount(2);
  await expect(page.getByText("3D view unavailable")).toHaveCount(0);
  await page
    .getByText("Reveal destination tickets", { exact: true })
    .first()
    .click();
  await expect(page.locator(".revealed-ticket").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/finished-game.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Play again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A new adventure awaits." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile landing, catalog, and room remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The long way is the good way." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View the tickets" }).click();
  await expect(page.getByRole("dialog").locator(".ticket-tile")).toHaveCount(
    69,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("YOUR CONDUCTOR NAME").fill("Mobile QA");
  await page.getByRole("button", { name: "Create a private table" }).click();
  await page.getByRole("button", { name: "Add computer opponent" }).click();
  await page.getByRole("button", { name: "Start the journey" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Choose destination tickets",
  });
  for (let i = 0; i < 3; i++)
    await dialog.locator(".ticket-tile").nth(i).click();
  await dialog.getByRole("button", { name: "Keep 3 tickets" }).click();
  await expect(
    page.getByText("Your turn, conductor.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/multiplayer-mobile.png",
    fullPage: true,
  });
});
