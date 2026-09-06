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
  await expect(a.locator('[data-route="r1"]')).toHaveAttribute(
    "aria-label",
    /claimed by Alice QA/,
  );
  await expect(b.locator('[data-route="r1"]')).toHaveAttribute(
    "data-owner",
    (await a.locator('[data-route="r1"]').getAttribute("data-owner")) as string,
  );
  await a.screenshot({
    path: "test-results/multiplayer-desktop.png",
    fullPage: true,
  });
  await expect(a.getByText("Map unavailable")).toHaveCount(0);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

test("the 2D atlas supports keyboard route selection, pan, zoom, and optional sound", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Music and sound", exact: true })
    .click();
  const player = page.getByTitle(
    "Ticket to Ride America soundtrack on YouTube",
  );
  await expect(player).toHaveAttribute(
    "src",
    /youtube-nocookie.com\/embed\/jBZochITFMs/,
  );
  await page.getByRole("button", { name: "Effects on" }).click();
  await expect(
    page.getByRole("button", { name: "Effects off" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Close music player" }).click();
  await expect(player).toHaveCount(0);
  await page.getByLabel("YOUR CONDUCTOR NAME").fill("Atlas QA");
  await page.getByRole("button", { name: "Create a private table" }).click();
  const map = page.getByRole("group", { name: "USA railway map" });
  await expect(map).toBeVisible();
  await expect(map.getByRole("button")).toHaveCount(100);
  await expect(page.locator("canvas")).toHaveCount(0);
  const route = page.locator('[data-route="r16"]');
  await route.focus();
  await page.keyboard.press("Enter");
  await expect(route).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".map-zoom")).toContainText("130%");
  await map.focus();
  await page.keyboard.press("ArrowRight");
  // A drag across the map must not accidentally choose a different route.
  const rect = await map.boundingBox();
  await page.mouse.move(
    rect!.x + rect!.width * 0.4,
    rect!.y + rect!.height * 0.6,
  );
  await page.mouse.down();
  await page.mouse.move(
    rect!.x + rect!.width * 0.55,
    rect!.y + rect!.height * 0.65,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(route).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Reset map", exact: true }).click();
  await expect(page.locator(".map-zoom")).toContainText("100%");
  await map.focus();
  await page.keyboard.press("+");
  await expect(page.locator(".map-zoom")).toContainText("130%");
  await page.keyboard.press("0");
  await expect(page.locator(".map-zoom")).toContainText("100%");
  await page.getByRole("button", { name: "Leave table", exact: true }).click();
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
  await expect(page.getByText("Map unavailable")).toHaveCount(0);
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
  await expect(
    page.getByText("Conductor QA (you)", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Remove / }).click();
  await page.getByRole("button", { name: "Leave table", exact: true }).click();
  expect(errors).toEqual([]);
});
test("mobile landing, catalog, and room remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Railbound USA · 1910" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View the tickets" }).click();
  await expect(page.getByRole("dialog").locator(".ticket-tile")).toHaveCount(
    69,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("YOUR CONDUCTOR NAME").fill("Mobile QA");
  await page.getByLabel("Room code").fill("ZZZZZZZZ");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "That room does not exist.",
  );
  await page.getByRole("button", { name: "Dismiss error" }).click();
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
  const map = page.getByRole("group", { name: "USA railway map" });
  await map.scrollIntoViewIfNeeded();
  const rect = (await map.boundingBox())!;
  const cx = rect.x + rect.width / 2,
    cy = rect.y + rect.height / 2;
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: cx - 25, y: cy, id: 1 },
      { x: cx + 25, y: cy, id: 2 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: cx - 50, y: cy, id: 1 },
      { x: cx + 50, y: cy, id: 2 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".map-zoom")).toContainText("200%");
  await page.getByRole("button", { name: "Reset map", exact: true }).click();
  await expect(page.locator(".map-zoom")).toContainText("100%");
  await touch.detach();
  await page.screenshot({
    path: "test-results/multiplayer-mobile.png",
    fullPage: true,
  });
});
