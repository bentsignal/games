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
    await expect(a.getByRole("log").getByText("Sending…")).toBeVisible();
    await input.fill("Second message while first is pending");
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(a.getByRole("log").getByText("Sending…")).toHaveCount(2);
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
    queued[1]();
    await expect(a.getByRole("log").getByText("Sending…")).toHaveCount(0);
    await expect(
      a.getByRole("log").getByText("Typing must stay in chat", { exact: true }),
    ).toHaveCount(1);
    await expect(a.getByRole("log").getByRole("alert")).toHaveCount(0);
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
