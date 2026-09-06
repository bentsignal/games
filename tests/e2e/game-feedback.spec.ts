import { test, expect, type Page } from "@playwright/test";

test("draws fly into the hand, destination pins persist, turns stay steady, and effects can be muted", async ({
  browser,
  baseURL,
}) => {
  const first = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const second = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await first.addInitScript(() => {
    const audit = ((window as any).__sounds = { paper: 0, whistle: 0 });
    const nativeBuffer = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const node = nativeBuffer.call(this),
        start = node.start.bind(node);
      node.start = (...args) => {
        audit.paper++;
        start(...args);
      };
      return node;
    };
    const nativeOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = nativeOscillator.call(this),
        start = node.start.bind(node);
      node.start = (...args) => {
        if (node.type === "triangle") audit.whistle++;
        start(...args);
      };
      return node;
    };
  });
  const a = await first.newPage(),
    b = await second.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  b.on("pageerror", (e) => errors.push(e.message));
  try {
    await a.goto(baseURL!);
    await a.getByLabel("Name", { exact: true }).fill("Feedback QA");
    await a.getByRole("button", { name: "Create a game" }).click();
    await expect(a).toHaveURL(/\/room\//);
    await b.goto(a.url());
    await b.getByLabel("Name", { exact: true }).fill("Long player name QA");
    await b.getByRole("button", { name: "Join game" }).click();
    await a.getByRole("button", { name: "Start game" }).click();
    for (const page of [a, b]) {
      const dialog = page.getByRole("dialog", {
        name: "Choose destination tickets",
      });
      for (let i = 0; i < 3; i++)
        await dialog.locator(".ticket-tile").nth(i).click();
      await dialog.getByRole("button", { name: "Keep 3 tickets" }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(a.getByText("Your turn", { exact: true })).toBeVisible();
    await expect
      .poll(() => a.locator('[data-destination-status="incomplete"]').count())
      .toBeGreaterThan(1);
    await expect(a.locator('[data-destination-status="complete"]')).toHaveCount(
      0,
    );
    const pins = await a
      .locator("[data-destination-status]")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-city")));
    await expect
      .poll(() => a.evaluate(() => (window as any).__sounds.whistle))
      .toBe(3);
    const layout = () =>
      a.evaluate(() => ({
        height: document.querySelector(".turn-banner")!.getBoundingClientRect()
          .height,
        cardsY: document.querySelector(".market-cards")!.getBoundingClientRect()
          .y,
      }));
    const originalLayout = await layout();
    const countCards = () =>
      a
        .locator(".hand-cards .card-count")
        .evaluateAll((nodes) =>
          nodes.reduce((sum, n) => sum + Number(n.textContent), 0),
        );
    const originalHand = await countCards();
    const market = a
      .locator('.market-cards .train-card:not([data-card-color="wild"])')
      .first();
    const color = await market.getAttribute("data-card-color");
    const paperBefore = await a.evaluate(() => (window as any).__sounds.paper);
    await market.click();
    const flight = a.locator(".card-draw-flight");
    await expect(flight).toBeVisible();
    await expect(flight).toHaveAttribute("data-drawn-color", color!);
    await expect.poll(countCards).toBe(originalHand + 1);
    const end = await flight.evaluate((el) => {
      const animation = el.getAnimations()[0] as Animation;
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      return { first: frames[0].transform, last: frames.at(-1)!.transform };
    });
    expect(end.first).not.toBe(end.last);
    await expect(flight).toHaveCount(0);
    await expect(a.getByText("Choose one more train card.")).toBeVisible();
    expect(await layout()).toEqual(originalLayout);
    await expect
      .poll(() => a.evaluate(() => (window as any).__sounds.paper))
      .toBeGreaterThan(paperBefore);
    await a.getByRole("button", { name: "Draw from hidden deck" }).click();
    await expect(flight).toBeVisible();
    const hiddenColor = await flight.getAttribute("data-drawn-color");
    await expect(
      a.locator(`.hand-cards [data-card-color="${hiddenColor}"]`),
    ).toBeVisible();
    await expect.poll(countCards).toBe(originalHand + 2);
    await expect(b.getByText("Your turn", { exact: true })).toBeVisible();
    expect(await layout()).toEqual(originalLayout);
    await expect(flight).toHaveCount(0);
    expect(
      await a
        .locator("[data-destination-status]")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-city"))),
    ).toEqual(pins);

    // Messages must not repeat the turn whistle or retrigger the draw animation.
    await a.getByRole("tab", { name: /Chat/ }).click();
    await a.getByLabel("Chat message").fill("No extra whistle for chat.");
    await a.getByRole("button", { name: "Send message" }).click();
    await expect(a.getByLabel("Chat message")).toHaveValue("");
    expect(await a.evaluate(() => (window as any).__sounds.whistle)).toBe(3);
    await expect(flight).toHaveCount(0);
    const drawTwo = async (page: Page) => {
      await page.getByRole("button", { name: "Draw from hidden deck" }).click();
      await expect(page.getByText("Choose one more train card.")).toBeVisible();
      await page.getByRole("button", { name: "Draw from hidden deck" }).click();
    };
    await drawTwo(b);
    await expect(a.getByText("Your turn", { exact: true })).toBeVisible();
    await expect
      .poll(() => a.evaluate(() => (window as any).__sounds.whistle))
      .toBe(6);
    expect(await layout()).toEqual(originalLayout);
    await a
      .getByRole("button", { name: "Music and sound", exact: true })
      .click();
    await a.getByRole("button", { name: "Effects on" }).click();
    await a
      .getByRole("button", { name: "Music and sound", exact: true })
      .click();
    const mutedCounts = await a.evaluate(() => ({
      ...(window as any).__sounds,
    }));
    await a.emulateMedia({ reducedMotion: "reduce" });
    await drawTwo(a);
    await expect(flight).toHaveCount(0);
    await expect(b.getByText("Your turn", { exact: true })).toBeVisible();
    await drawTwo(b);
    await expect(a.getByText("Your turn", { exact: true })).toBeVisible();
    expect(await a.evaluate(() => (window as any).__sounds)).toEqual(
      mutedCounts,
    );
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});
