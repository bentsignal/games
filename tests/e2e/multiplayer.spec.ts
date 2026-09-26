import { signIn } from "./auth";
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
  await a.goto(baseURL! + "/ticket");
  await signIn(a, "Alice_QA");
  await a.getByRole("button", { name: "Create a game" }).click();
  await expect(a).toHaveURL(/\/room\/[A-Z2-9]{8}/);
  const url = a.url();
  await b.goto(url);
  await signIn(b, "Bob_QA");
  await b.getByRole("button", { name: "Join game" }).click();
  await expect(a.getByText("Bob_QA", { exact: true }).first()).toBeVisible();
  await a.getByRole("tab", { name: /Chat/ }).click();
  const composerY = (await a.getByLabel("Chat message").boundingBox())!.y;
  await a.getByLabel("Chat message").fill("All aboard, Bob!");
  await a.getByRole("button", { name: "Send message" }).click();
  await expect
    .poll(async () => (await a.getByLabel("Chat message").boundingBox())!.y)
    .toBeCloseTo(composerY, 0);
  await b.getByRole("tab", { name: /Chat/ }).click();
  await expect(b.getByText("All aboard, Bob!", { exact: true })).toBeVisible();
  await a.getByRole("button", { name: "Start game" }).click();
  for (const page of [a, b]) {
    const dialog = page.getByRole("dialog", {
      name: "Choose destination tickets",
    });
    await expect(dialog).toBeVisible();
    await dialog.locator(".ticket-tile").first().hover();
    await expect(page.locator("[data-ticket-preview]")).toHaveCount(1);
    for (let i = 0; i < 3; i++)
      await dialog.locator(".ticket-tile").nth(i).click();
    await page.mouse.move(100, 100);
    await expect(page.locator("[data-ticket-preview]")).toHaveCount(3);
    await dialog.locator(".ticket-tile").nth(3).hover();
    await expect(page.locator("[data-ticket-preview]")).toHaveCount(4);
    await expect(
      page.getByRole("group", { name: "USA railway map" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Keep 3 tickets" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(a.getByText("Your turn", { exact: true })).toBeVisible();
  // Chat must not briefly disable, replace, or animate any draw controls.
  await a.getByRole("tab", { name: /Chat/ }).click();
  await a.evaluate(() => {
    const root =
      document.querySelector(".sidebar") ?? document.querySelector("aside")!;
    const controls = [
      ...document.querySelectorAll(".market-cards button,.draw-piles button"),
    ];
    (window as any).__chatControls = controls;
    (window as any).__chatMutations = [];
    const observer = new MutationObserver((records) => {
      for (const r of records)
        if (controls.includes(r.target as Element))
          (window as any).__chatMutations.push(r.attributeName);
    });
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "class", "style"],
    });
    (window as any).__chatObserver = observer;
  });
  await a.getByLabel("Chat message").fill("Cards should stay steady.");
  await a.getByRole("button", { name: "Send message" }).click();
  await expect(a.getByLabel("Chat message")).toHaveValue("");
  expect(
    await a.evaluate(() => {
      (window as any).__chatObserver.disconnect();
      return {
        changes: (window as any).__chatMutations,
        same: (window as any).__chatControls.every(
          (el: Element) => el.isConnected,
        ),
      };
    }),
  ).toEqual({ changes: [], same: true });
  await expect(
    b.getByRole("button", { name: "Draw from hidden deck" }),
  ).toBeDisabled();
  await a.getByRole("button", { name: "Draw from hidden deck" }).click();
  await expect(a.getByText("Choose one more train card.")).toBeVisible();
  await a.getByRole("button", { name: "Draw from hidden deck" }).click();
  await expect(b.getByText("Your turn", { exact: true })).toBeVisible();
  await b.reload();
  await expect(b.getByText("Your turn", { exact: true })).toBeVisible();
  await expect(b.getByText("Bob_QA (you)", { exact: true })).toBeVisible();
  await expect(b.getByRole("dialog")).toHaveCount(0);
  await b.getByRole("button", { name: "Draw destination tickets" }).click();
  const dialog = b.getByRole("dialog", { name: "Choose destination tickets" });
  await expect(dialog.locator(".ticket-tile")).toHaveCount(4);
  await dialog.locator(".ticket-tile").first().click();
  await dialog.getByRole("button", { name: "Keep 1 tickets" }).click();
  await expect(a.getByText("Your turn", { exact: true })).toBeVisible();
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
  await expect(a.locator("#payment")).toHaveCount(0);
  const card = a.locator(".hand-cards .train-card:not(:disabled)").first();
  const hand = await card.boundingBox(),
    target = await a.locator('[data-route="r2"] path').first().boundingBox();
  await a.mouse.move(hand!.x + hand!.width / 2, hand!.y + hand!.height / 2);
  await a.mouse.down();
  await a.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 18 },
  );
  await expect(a.locator(".card-drag-ghost")).toBeVisible();
  await expect(a.locator('[data-route="r1"]')).toHaveAttribute(
    "data-droppable",
    "true",
  );
  await a.keyboard.press("Escape");
  await a.mouse.up();
  await expect(a.locator('[data-route="r1"]')).not.toHaveAttribute(
    "data-owner",
    /./,
  );
  await a.mouse.move(hand!.x + hand!.width / 2, hand!.y + hand!.height / 2);
  await a.mouse.down();
  await a.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 18 },
  );
  await a.mouse.up();
  await expect(b.getByText("Your turn", { exact: true })).toBeVisible();
  await b.getByRole("tab", { name: "Activity" }).click();
  await expect(
    b.getByText("Alice_QA claimed Vancouver → Seattle (+1).", { exact: true }),
  ).toBeVisible();
  await expect(a.locator('[data-route="r1"]')).toHaveAttribute(
    "aria-label",
    /claimed by Alice_QA/,
  );
  await expect(a.locator('[data-route="r1"]')).toHaveAttribute(
    "data-owner-color",
    "#ffc629",
  );
  await expect(b.locator('[data-route="r1"]')).not.toHaveAttribute(
    "data-owner-color",
    "#ffc629",
  );
  for (const page of [a, b]) {
    await expect(
      page.locator(".player-pill").filter({ hasText: "(you)" }),
    ).toHaveCSS("--player", "#ffc629");
  }
  await expect(b.locator('[data-route="r1"]')).toHaveAttribute(
    "data-owner",
    (await a.locator('[data-route="r1"]').getAttribute("data-owner")) as string,
  );
  // The untouched parallel lane is visibly closed under the two-player rule.
  const closed = b.locator('[data-route="r2"]');
  await expect(closed).toHaveClass(/closed/);
  await closed.focus();
  await expect(b.locator(".map-hover")).toContainText("2–3 player games");
  const held = (await b
    .locator(".hand-cards .train-card:not(:disabled)")
    .first()
    .boundingBox())!;
  const closedSlot = (await closed.locator("rect").first().boundingBox())!;
  await b.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
  await b.mouse.down();
  await b.mouse.move(
    closedSlot.x + closedSlot.width / 2,
    closedSlot.y + closedSlot.height / 2,
    { steps: 12 },
  );
  await expect(b.locator(".map-hover")).toContainText("2–3 player games");
  await b.mouse.up();
  await expect(b.locator(".route-popover")).toContainText(
    "only one side of a double route",
  );
  await expect(closed).not.toHaveAttribute("data-owner", /./);
  await expect(b.getByText("Your turn", { exact: true })).toBeVisible();
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
  await page.goto("/ticket");
  await signIn(page, "Atlas_QA");
  await page.getByRole("button", { name: "Create a game" }).click();
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
  await page.goto("/ticket");
  await signIn(page, "Conductor_QA");
  await page.getByRole("button", { name: "Create a game" }).click();
  await page.getByRole("button", { name: "Add computer opponent" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  const tickets = page.getByRole("dialog", {
    name: "Choose destination tickets",
  });
  for (let i = 0; i < 3; i++)
    await tickets.locator(".ticket-tile").nth(i).click();
  await tickets.getByRole("button", { name: "Keep 3 tickets" }).click();
  await page.getByRole("button", { name: "Leave table" }).click();
  const gameUrl = page.url();
  await page
    .getByRole("button", { name: "Hand over my seat", exact: true })
    .click();
  await expect(page).toHaveURL(/\/ticket$/);
  await page.goto(gameUrl);
  await expect(
    page.getByRole("tab", { name: "Scoreboard", exact: true }),
  ).toBeVisible({ timeout: 210000 });
  await expect(page.locator(".result-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Skip to final scores" }).click();
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
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
  await expect(
    page.locator(".seat-list").getByText("Conductor_QA", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Remove / }).click();
  await page.getByRole("button", { name: "Leave table", exact: true }).click();
  expect(errors).toEqual([]);
});
test("mobile landing, catalog, and room remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ticket");
  await signIn(page, "Mobile_QA");
  await expect(
    page.getByRole("heading", { name: "Ticket to Ride" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View the tickets" }).click();
  await expect(page.getByRole("dialog").locator(".ticket-tile")).toHaveCount(
    69,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Room code").fill("ZZZZZZZZ");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "That table couldn’t be found." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to home" }).click();
  await page.getByRole("button", { name: "Create a game" }).click();
  await page.getByRole("button", { name: "Add computer opponent" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Choose destination tickets",
  });
  for (let i = 0; i < 3; i++)
    await dialog.locator(".ticket-tile").nth(i).click();
  await dialog.getByRole("button", { name: "Keep 3 tickets" }).click();
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible();
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
  const hand = (await page
    .locator(".hand-cards .train-card:not(:disabled)")
    .first()
    .boundingBox())!;
  const target = (await page
    .locator('[data-route="r1"] path')
    .first()
    .boundingBox())!;
  const from = {
    x: hand.x + hand.width / 2,
    y: hand.y + hand.height / 2,
    id: 1,
  };
  const to = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
    id: 1,
  };
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [from],
  });
  for (let i = 1; i <= 12; i++)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / 12,
          y: from.y + ((to.y - from.y) * i) / 12,
          id: 1,
        },
      ],
    });
  await expect(page.locator(".card-drag-ghost")).toBeVisible();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator('[data-route="r1"]')).toHaveAttribute(
    "aria-label",
    /claimed by Mobile_QA/,
  );
  await touch.detach();
  await page.screenshot({
    path: "test-results/multiplayer-mobile.png",
    fullPage: true,
  });
});

// Mock only the external YouTube service; verify our real lifecycle and controls.
test("music starts once, survives closing settings, and pauses without recreating the player", async ({
  page,
}) => {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    window.musicTest={plays:0,pauses:0,created:0,volume:0};
    window.YT={Player:class {
      constructor(el,o){this.o=o;this.iframe=document.createElement('iframe');this.iframe.src='about:blank';el.replaceWith(this.iframe);window.musicTest.created++;setTimeout(()=>o.events.onReady({target:this}),0);}
      getIframe(){return this.iframe;}
      setVolume(v){window.musicTest.volume=v;}
      playVideo(){window.musicTest.plays++;this.o.events.onStateChange({target:this,data:1});}
      pauseVideo(){window.musicTest.pauses++;this.o.events.onStateChange({target:this,data:2});}
      destroy(){this.iframe.remove();}
    }};window.onYouTubeIframeAPIReady();
  `,
    }),
  );
  await page.goto("/ticket");
  await signIn(page, "Music_QA");
  const pause = page.getByRole("button", { name: "Pause music", exact: true });
  await expect(pause).toBeVisible();
  await page
    .getByRole("button", { name: "Music and sound", exact: true })
    .click();
  const player = page.getByTitle(
    "Ticket to Ride America soundtrack on YouTube",
  );
  await expect(player).toBeVisible();
  await page.getByRole("button", { name: "Effects on" }).click();
  await page.getByRole("button", { name: "Close music settings" }).click();
  await expect(player).toHaveCount(1);
  await expect(pause).toBeVisible();
  expect(await page.evaluate(() => (window as any).musicTest.pauses)).toBe(0);
  await pause.click();
  await expect(
    page.getByRole("button", { name: "Play music", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).musicTest.pauses)).toBe(1);
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await expect(pause).toBeVisible();
  expect(await page.evaluate(() => (window as any).musicTest.created)).toBe(1);
  await page
    .getByRole("button", { name: "Music and sound", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Effects off" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("lobby controls stay put as opponents join, and only chat is shown", async ({
  page,
}) => {
  await page.goto("/ticket");
  await signIn(page, "Lobby_QA");
  await page.getByRole("button", { name: "Create a game" }).click();
  const add = page.getByRole("button", { name: "Add computer opponent" });
  await expect(add).toBeVisible();
  const initial = (await add.boundingBox())!;
  await expect(page.getByRole("tab", { name: /Tickets/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveCount(0);
  await expect(page.getByLabel("Chat message")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Leave table", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await add.click();
    await expect(page.locator(".seat-list > div:not(.open-seat)")).toHaveCount(
      i + 2,
    );
    expect((await add.boundingBox())!.y).toBeCloseTo(initial.y, 0);
  }
  await expect(add).toBeDisabled();
  await page.screenshot({
    path: "test-results/lobby-desktop.png",
    fullPage: true,
  });
});

test("setup actions keep unrelated controls enabled and chat stays in place", async ({
  page,
}) => {
  await page.goto("/ticket");
  await signIn(page, "Setup_QA");
  await expect(
    page.getByRole("heading", { name: "Ticket to Ride", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(
      ".postmark,.edition-label,.hero-caption,.home-footer,.resume,.nav-center,.hero-tags",
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Create a game" }).click();
  const add = page.getByRole("button", { name: "Add computer opponent" });
  await add.click();
  await expect(page.locator(".seat-list > div:not(.open-seat)")).toHaveCount(2);
  const start = page.getByRole("button", { name: "Start game" });
  const leave = page.getByRole("button", { name: "Leave table", exact: true });
  const mode = page.getByLabel("GAME MODE");
  const chatY = (await page.getByLabel("Chat message").boundingBox())!.y;
  expect((await start.boundingBox())!.y).toBeLessThan(
    (await leave.boundingBox())!.y,
  );
  expect((await leave.boundingBox())!.y).toBeLessThan(
    (await mode.boundingBox())!.y,
  );
  await page.evaluate(() => {
    (window as any).__disabledChanges = [];
    const observer = new MutationObserver((records) => {
      for (const record of records)
        if (record.attributeName === "disabled")
          (window as any).__disabledChanges.push(
            (record.target as HTMLElement).textContent,
          );
    });
    for (const el of [
      document.querySelector(".table-actions .primary"),
      document.querySelector(".leave-table"),
      document.querySelector("#table-mode"),
    ])
      observer.observe(el!, {
        attributes: true,
        attributeFilter: ["disabled"],
      });
    (window as any).__setupObserver = observer;
  });
  await add.click();
  await expect(page.locator(".seat-list > div:not(.open-seat)")).toHaveCount(3);
  await mode.selectOption("classic");
  await expect(mode).toHaveValue("classic");
  await expect(page.locator(".mode-description")).toContainText("30 tickets");
  await mode.selectOption("1910");
  await expect(mode).toHaveValue("1910");
  await expect(mode).toHaveAttribute("aria-busy", "false");
  await expect(start).toBeEnabled();
  await expect(leave).toBeEnabled();
  expect((await page.getByLabel("Chat message").boundingBox())!.y).toBeCloseTo(
    chatY,
    0,
  );
  expect(
    await page.evaluate(() => {
      (window as any).__setupObserver.disconnect();
      return (window as any).__disabledChanges;
    }),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/setup-stable.png",
    fullPage: true,
  });
});

test("chat rate errors are private Server messages, never page toasts", async ({
  browser,
  baseURL,
}) => {
  const first = await browser.newContext(),
    second = await browser.newContext();
  const a = await first.newPage(),
    b = await second.newPage();
  await a.goto(baseURL! + "/ticket");
  await signIn(a, "Chat_QA");
  await a.getByRole("button", { name: "Create a game" }).click();
  await expect(a).toHaveURL(/room/);
  await b.goto(a.url());
  await signIn(b, "Friend_QA");
  await b.getByRole("button", { name: "Join game" }).click();
  await expect(b.getByLabel("Chat message")).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await a.getByLabel("Chat message").fill(`Quick message ${i}`);
    await a.getByRole("button", { name: "Send message" }).click();
    await expect(
      a.getByRole("button", { name: "Send message" }),
    ).not.toHaveAttribute("aria-busy", "true");
    if (await a.locator(".server-message").count()) break;
    await expect(a.getByLabel("Chat message")).toHaveValue("");
  }
  await expect(a.locator(".server-message").first()).toContainText("Server");
  await expect(a.locator(".server-message").first()).toContainText(
    "Please slow down.",
  );
  await expect(a.locator(".toast")).toHaveCount(0);
  await expect(b.locator(".server-message")).toHaveCount(0);
  await expect(b.getByText("Please slow down.")).toHaveCount(0);
  await first.close();
  await second.close();
});

test("hovering either available lane highlights the whole connection", async ({
  page,
}) => {
  await page.goto("/ticket");
  await signIn(page, "Hover_QA");
  await page.getByRole("button", { name: "Create a game" }).click();
  for (const id of ["r1", "r2"]) {
    await page.locator(`[data-route="${id}"][role="button"]`).focus();
    await expect(page.locator('[data-route-highlight="r1"]')).toHaveAttribute(
      "data-hovered",
      "true",
    );
    await expect(page.locator('[data-route-highlight="r2"]')).toHaveAttribute(
      "data-hovered",
      "true",
    );
  }
});
