import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./auth";

async function resetDiagnostics(page: Page) {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    (window as any).ticketDiagnostics.reset();
  });
}
async function boardRenders(page: Page) {
  return page.evaluate(
    () =>
      (window as any).ticketDiagnostics.snapshot().counters["board-renders"] ??
      0,
  );
}

test("Ticket chat and dragging stay isolated with delayed and failed replies", async ({
  browser,
  baseURL,
}) => {
  const first = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const second = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const a = await first.newPage(),
    b = await second.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  let mode: "normal" | "hold" | "reject" = "normal";
  const held: (() => void)[] = [];
  await a.routeWebSocket(
    (url) => url.pathname.startsWith("/ticket/"),
    (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        const frame = message === "ping" ? null : JSON.parse(String(message));
        if (frame?.args?.kind === "send") {
          if (mode === "hold") {
            held.push(() => server.send(message));
            return;
          }
          if (mode === "reject") {
            ws.send(
              JSON.stringify({
                type: "reply",
                request: frame.request,
                error: "Test rejected message",
              }),
            );
            return;
          }
        }
        server.send(message);
      });
      server.onMessage((message) => ws.send(message));
    },
  );
  try {
    const suffix = String(Date.now()).slice(-6);
    await a.goto(baseURL! + "/ticket?diagnostics=1");
    await signIn(a, `PerfA_${suffix}`);
    await a.getByRole("button", { name: "Create a game" }).click();
    await expect(a).toHaveURL(/\/room\/[A-Z2-9]{8}/);
    await b.goto(a.url());
    await signIn(b, `PerfB_${suffix}`);
    await b.getByRole("button", { name: "Join game" }).click();
    await a.getByRole("button", { name: "Start game" }).click();
    for (const page of [a, b]) {
      const dialog = page.getByRole("dialog", {
        name: "Choose destination tickets",
      });
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 3; i++)
        await dialog.locator(".ticket-tile").nth(i).click();
      await dialog.getByRole("button", { name: "Keep 3 tickets" }).click();
      await page.getByRole("tab", { name: /^Chat/ }).click();
    }
    await expect(a.getByText("Your turn", { exact: true })).toBeVisible();
    await resetDiagnostics(a);
    const input = a.getByRole("textbox", { name: "Chat message" });
    await input.pressSequentially("Typing must stay in chat", { delay: 15 });
    expect(await boardRenders(a)).toBe(0);
    mode = "hold";
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(
      a.getByRole("log").locator(".message[data-pending]"),
    ).toBeVisible();
    await expect(
      a.getByRole("log").locator(".message[data-pending]"),
    ).toHaveCSS("opacity", "0.5");
    await expect(
      a.getByRole("log").locator(".message[data-pending] time"),
    ).toHaveText("");
    await input.fill("Second message while first is pending");
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(
      a.getByRole("log").locator(".message[data-pending]"),
    ).toHaveCount(2);
    await input.fill("Keep this new draft");
    await expect.poll(() => held.length).toBe(2);
    await b
      .getByRole("textbox", { name: "Chat message" })
      .fill("Incoming also stays in chat");
    await b.getByRole("textbox", { name: "Chat message" }).press("Enter");
    await expect(
      a.getByRole("log").getByText("Incoming also stays in chat"),
    ).toBeVisible();
    expect(await boardRenders(a)).toBe(0);
    mode = "normal";
    // Release held requests across the server's 750 ms anti-spam window.
    // The composer must accept both before either request reaches the server.
    const queued = held.splice(0);
    queued[0]();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await expect(a.getByRole("log").locator(".message p")).toHaveText([
      "Typing must stay in chat",
      "Second message while first is pending",
      "Incoming also stays in chat",
    ]);
    queued[1]();
    await expect(
      a.getByRole("log").locator(".message[data-pending]"),
    ).toHaveCount(0);
    await expect(
      a.getByRole("log").getByText("Typing must stay in chat", { exact: true }),
    ).toHaveCount(1);
    await expect(a.getByRole("log").getByRole("alert")).toHaveCount(0);
    await expect(a.getByRole("log").locator(".message").first()).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(
      a.getByRole("log").locator(".message time").first(),
    ).not.toBeEmpty();
    await expect(
      a
        .getByRole("log")
        .getByText("Second message while first is pending", { exact: true }),
    ).toHaveCount(1);
    await expect(input).toHaveValue("Keep this new draft");
    expect(await boardRenders(a)).toBe(0);
    mode = "reject";
    await input.press("Enter");
    await input.fill("Another draft");
    await expect(a.getByRole("log").getByRole("alert")).toContainText(
      "Test rejected message",
    );
    await expect(input).toHaveValue("Another draft");
    expect(await boardRenders(a)).toBe(0);
    // A tab switch preserves the draft and pending/failure history.
    await a.getByRole("tab", { name: /^Tickets/ }).click();
    await a.getByRole("tab", { name: /^Chat/ }).click();
    await expect(input).toHaveValue("Another draft");

    const cdp = await first.newCDPSession(a);
    let artworkPaints = 0;
    cdp.on("Tracing.dataCollected", ({ value }) => {
      for (const raw of value) {
        const event = raw as unknown as {
          name: string;
          args?: { data?: { nodeName?: string } };
        };
        if (
          event.name === "Paint" &&
          event.args?.data?.nodeName?.startsWith("svg class='map-artwork")
        )
          artworkPaints++;
      }
    });
    // Ordinary route hover and ticket previews must never rebuild the map artwork.
    await a.getByRole("tab", { name: /^Tickets/ }).click();
    await a.evaluate(() => document.fonts.ready);
    await a.locator('[data-route="r1"]').focus();
    await resetDiagnostics(a);
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline,disabled-by-default-devtools.timeline",
      transferMode: "ReportEvents",
    });
    for (const id of ["r1", "r2", "r3", "r4"]) {
      await a.locator(`[data-route="${id}"]`).focus();
      await expect(a.locator(`[data-route-highlight="${id}"]`)).toHaveAttribute(
        "data-hovered",
        "true",
      );
    }
    const tickets = a.locator(".ticket-tile");
    for (let index = 0; index < (await tickets.count()); index++) {
      await tickets.nth(index).hover();
      await expect(
        a.locator("[data-ticket-preview][data-hovered]"),
      ).toHaveCount(1);
      await a.mouse.move(5, 5);
    }
    expect(
      await a.evaluate(
        () =>
          (window as any).ticketDiagnostics.snapshot().counters[
            "map-artwork-renders"
          ] ?? 0,
      ),
    ).toBe(0);

    await a.evaluate(() => new Promise(requestAnimationFrame));
    const tracingComplete = new Promise<void>((resolve) =>
      cdp.once("Tracing.tracingComplete", () => resolve()),
    );
    await cdp.send("Tracing.end");
    await tracingComplete;
    expect(artworkPaints).toBe(0);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const card = a.locator(".hand-cards .train-card:not(:disabled)").first();
    const hand = (await card.boundingBox())!;
    const map = (await a.locator(".railway-map").boundingBox())!;
    await a.mouse.move(hand.x + hand.width / 2, hand.y + hand.height / 2);
    await resetDiagnostics(a);
    await a.mouse.down();
    for (let i = 0; i < 60; i++) {
      await a.mouse.move(
        map.x + map.width * (0.05 + (0.9 * i) / 59),
        map.y + map.height * 0.5,
      );
      await a.evaluate(() => new Promise(requestAnimationFrame));
    }
    await expect(a.locator(".card-drag-ghost")).toBeVisible();
    const diagnostics = await a.evaluate(() =>
      (window as any).ticketDiagnostics.snapshot(),
    );
    expect(diagnostics.counters["drag-hit-tests"]).toBeGreaterThan(20);
    expect(diagnostics.counters["drag-hit-tests"]).toBeLessThanOrEqual(60);
    expect(diagnostics.counters["board-renders"]).toBeLessThanOrEqual(2);
    expect(diagnostics.summary["drag-frame"].p95).toBeLessThan(50);
    console.log(
      "Ticket drag at 4x CPU slowdown:",
      JSON.stringify(diagnostics.summary),
    );
    await a.keyboard.press("Escape");
    await a.mouse.up();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    // The independent highlight surfaces must follow map zoom, pan and resizing.
    for (const width of [1440, 900]) {
      await a.setViewportSize({ width, height: 1000 });
      await a.getByRole("button", { name: "Zoom in", exact: true }).click();
      await a.locator(".railway-map").focus();
      await a.keyboard.press("ArrowRight");
      await card.scrollIntoViewIfNeeded();
      const start = (await card.boundingBox())!;
      await a.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
      await a.mouse.down();
      await a.mouse.move(start.x + start.width / 2, start.y - 10);
      await expect(a.locator(".card-drag-ghost")).toBeVisible();
      await a.locator(".railway-map").scrollIntoViewIfNeeded();
      const target = await a.evaluate(() => {
        const bounds = document
          .querySelector(".railway-map")!
          .getBoundingClientRect();
        for (const route of document.querySelectorAll<SVGGElement>(
          ".map-route[data-droppable]",
        )) {
          const path = route.querySelector("path")!;
          const point = path
            .getPointAtLength(path.getTotalLength() / 2)
            .matrixTransform(path.getScreenCTM()!);
          if (
            point.x > bounds.left + 10 &&
            point.x < bounds.right - 10 &&
            point.y > bounds.top + 10 &&
            point.y < bounds.bottom - 10 &&
            point.y < innerHeight - 10
          )
            return { id: route.dataset.route!, x: point.x, y: point.y };
        }
        throw new Error(
          "No visible payable route for the drag alignment check",
        );
      });
      await a.mouse.move(target.x, target.y);
      const highlight = a.locator(`[data-drag-highlight="${target.id}"]`);
      await expect(highlight).toHaveAttribute("data-active", "true");
      await expect
        .poll(async () =>
          highlight.locator("path").evaluate((path, target) => {
            const point = (path as SVGPathElement)
              .getPointAtLength((path as SVGPathElement).getTotalLength() / 2)
              .matrixTransform((path as SVGPathElement).getScreenCTM()!);
            return Math.hypot(point.x - target.x, point.y - target.y);
          }, target),
        )
        .toBeLessThan(1);
      await a.keyboard.press("Escape");
      await a.mouse.up();
      await expect(a.locator("[data-drag-highlight][data-active]")).toHaveCount(
        0,
      );
    }
    // Room changes must replace the chat store, including in compiler output.
    await a
      .getByRole("button", { name: "Ticket to Ride home", exact: true })
      .click();
    await a.getByRole("button", { name: "Create a game", exact: true }).click();
    await expect(
      a.getByRole("log").getByText("No messages yet."),
    ).toBeVisible();
    await expect(a.getByRole("textbox", { name: "Chat message" })).toHaveValue(
      "",
    );
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});
