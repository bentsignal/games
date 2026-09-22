import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./auth";

async function drop(page: Page) {
  const card = page.locator(".hand-cards .train-card:not(:disabled)").first();
  await card.hover();
  const hand = (await card.boundingBox())!;
  const route = (await page
    .locator('[data-route="r1"] rect')
    .first()
    .boundingBox())!;
  await page.mouse.move(hand.x + hand.width / 2, hand.y + hand.height / 2);
  await page.mouse.down();
  await page.mouse.move(route.x + route.width / 2, route.y + route.height / 2, {
    steps: 12,
  });
  await expect(page.locator(".card-drag-ghost")).toBeVisible();
  await page.evaluate(() => {
    (window as any).__releasedAt = performance.now();
  });
  await page.mouse.up();
}

for (const outcome of [
  "confirm",
  "reject",
  "disconnect",
  "lost-reply",
] as const) {
  test(`route drops respond before the server and recover on ${outcome}`, async ({
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
    let hold = false,
      claimed = 0,
      act = outcome;
    const messages: (() => void)[] = [];
    let disconnectSocket = () => {};
    const errors: string[] = [];
    a.on("pageerror", (e) => errors.push(e.message));
    b.on("pageerror", (e) => errors.push(e.message));
    const httpCommands: string[] = [];
    a.on("request", (r) => {
      if (
        r.method() === "POST" &&
        new URL(r.url()).pathname.startsWith("/ticket/")
      )
        httpCommands.push(r.postDataJSON().kind);
    });
    await a.routeWebSocket(
      (url) => url.pathname.startsWith("/ticket/"),
      (ws) => {
        const server = ws.connectToServer();
        disconnectSocket = () => {
          ws.close({ code: 1012, reason: "Test lost reply" });
          server.close();
        };
        ws.onMessage((message) => {
          const frame = message === "ping" ? null : JSON.parse(String(message));
          if (frame?.args?.action?.type === "claim") {
            claimed++;
            if (act === "disconnect") {
              // Hold the interruption too, so the test can inspect the optimistic paint first.
              messages.push(() => {
                ws.close({ code: 1012, reason: "Test disconnect" });
                server.close();
              });
              return;
            }
            if (act === "reject") {
              frame.args.revision = -1 + frame.args.revision;
              server.send(JSON.stringify(frame));
              return;
            }
          }
          server.send(message);
        });
        server.onMessage((message) => {
          if (hold && message !== "pong") messages.push(() => ws.send(message));
          else ws.send(message);
        });
      },
    );
    try {
      const suffix = String(Date.now()).slice(-6);
      const usernameOutcome = outcome.replaceAll("-", "_");
      await a.goto(baseURL! + "/ticket");
      await signIn(a, `WsA_${usernameOutcome}_${suffix}`);
      await a.getByRole("button", { name: "Create a game" }).click();
      await expect(a).toHaveURL(/\/room\/[A-Z2-9]{8}/);
      await b.goto(a.url());
      await signIn(b, `WsB_${usernameOutcome}_${suffix}`);
      await b.getByRole("button", { name: "Join game" }).click();
      await expect(a.getByRole("button", { name: "Start game" })).toBeEnabled();
      await a.getByRole("button", { name: "Start game" }).click();
      for (const page of [a, b]) {
        const dialog = page.getByRole("dialog", {
          name: "Choose destination tickets",
        });
        await expect(dialog).toBeVisible();
        for (let i = 0; i < 3; i++)
          await dialog.locator(".ticket-tile").nth(i).click();
        await dialog.getByRole("button", { name: "Keep 3 tickets" }).click();
      }
      await expect(a.getByText("Your turn", { exact: true })).toBeVisible();
      const route = a.locator('[data-route="r1"]');
      const handBefore = await a
        .locator(".hand-cards .card-count")
        .allTextContents();
      // Slow the browser, while holding all server replies, to exercise rendering
      // as well as the network path. No server confirmation can paint the claim.
      await a.bringToFront();
      const cdp = await first.newCDPSession(a);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await a.evaluate(() => {
        new MutationObserver(() => {
          if (
            document
              .querySelector('[data-route="r1"]')
              ?.getAttribute("data-owner") &&
            (window as any).__releasedAt
          )
            requestAnimationFrame(() => {
              (window as any).__claimPaintMs =
                performance.now() - (window as any).__releasedAt;
            });
        }).observe(document.querySelector('[data-route="r1"]')!, {
          attributes: true,
          attributeFilter: ["data-owner"],
        });
      });
      hold = true;
      await drop(a);
      await expect(route).toHaveAttribute("data-owner", /./, { timeout: 750 });
      await expect.poll(() => claimed).toBe(1);
      await expect(a.getByRole("status")).toContainText("Confirming move");
      await expect
        .poll(() => a.evaluate(() => (window as any).__claimPaintMs))
        .toBeGreaterThan(0);
      const paint = await a.evaluate(() => (window as any).__claimPaintMs);
      expect(paint).toBeLessThan(750);
      console.log(
        `${outcome}: optimistic route paint ${Math.round(paint)}ms with 4x CPU throttling, before server confirmation`,
      );
      expect(
        await a.locator(".hand-cards .card-count").allTextContents(),
      ).not.toEqual(handBefore);
      await expect(
        a.getByRole("button", { name: "Draw from hidden deck" }),
      ).toBeDisabled();
      await expect.poll(() => messages.length).toBeGreaterThan(0);
      hold = false;
      if (outcome === "lost-reply") {
        messages.length = 0;
        disconnectSocket();
      } else for (const deliver of messages.splice(0)) deliver();
      if (outcome !== "confirm" && outcome !== "lost-reply") {
        await expect(a.getByRole("alert")).toContainText(
          outcome === "reject" ? "game changed" : "Connection interrupted",
        );
        await expect(route).not.toHaveAttribute("data-owner", /./);
        await expect
          .poll(() => a.locator(".hand-cards .card-count").allTextContents())
          .toEqual(handBefore);
        await expect(a.getByText(/Reconnecting… Your seat/)).toHaveCount(0);
        expect(claimed).toBe(1);
        act = "confirm";
        await a.getByRole("button", { name: "Dismiss error" }).click();
        await drop(a);
      }
      await expect(b.getByText("Your turn", { exact: true })).toBeVisible();
      await expect(route).toHaveAttribute("data-owner", /./);
      await expect(a.getByRole("status")).toHaveCount(0);
      expect(claimed).toBe(
        outcome === "confirm" || outcome === "lost-reply" ? 1 : 2,
      );
      expect(httpCommands).toEqual(["create"]);
      expect(errors).toEqual([]);
      await a.reload();
      await expect(a.locator('[data-route="r1"]')).toHaveAttribute(
        "data-owner",
        /./,
      );
    } finally {
      await first.close();
      await second.close();
    }
  });
}
