import { signIn } from "./auth";
import { test, expect } from "@playwright/test";

test.use({ trace: "off" });

test("card movement stays off the React render loop and keeps the map stable", async ({
  browser,
  baseURL,
}) => {
  const aContext = await browser.newContext(),
    bContext = await browser.newContext();
  await aContext.addInitScript(() => {
    (window as any).__dragCommits = 0;
    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => 1,
      onCommitFiberRoot: () => {
        (window as any).__dragCommits++;
      },
      onCommitFiberUnmount: () => {},
    };
  });
  const a = await aContext.newPage(),
    b = await bContext.newPage();
  await a.goto(baseURL! + "/ticket");
  await signIn(a, "Drag_QA");
  await a.getByRole("button", { name: "Create a game" }).click();
  await expect(a).toHaveURL(/room/);
  await b.goto(a.url());
  await signIn(b, "Second_QA");
  await b.getByRole("button", { name: "Join game" }).click();
  await a.getByRole("button", { name: "Start game" }).click();
  for (const p of [a, b]) {
    const d = p.getByRole("dialog", { name: "Choose destination tickets" });
    for (let i = 0; i < 3; i++) await d.locator(".ticket-tile").nth(i).click();
    await d.getByRole("button", { name: "Keep 3 tickets" }).click();
  }
  await expect(a.getByText("Your turn", { exact: true })).toBeVisible();
  const hand = (await a
    .locator(".hand-cards .train-card:not(:disabled)")
    .first()
    .boundingBox())!;
  const map = (await a
    .getByRole("group", { name: "USA railway map" })
    .boundingBox())!;
  await a.mouse.move(hand.x + hand.width / 2, hand.y + hand.height / 2);
  await a.mouse.down();
  const x = map.x + map.width * 0.48,
    y = map.y + map.height * 0.96;
  await a.mouse.move(x, y, { steps: 10 });
  await expect(a.locator(".card-drag-ghost")).toBeVisible();
  await a.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  await a.evaluate(() => {
    (window as any).__dragCommits = 0;
    (window as any).__mapMutations = 0;
    const observer = new MutationObserver((records) => {
      (window as any).__mapMutations += records.length;
    });
    observer.observe(document.querySelector(".railway-map")!, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    (window as any).__dragObserver = observer;
  });
  for (let i = 0; i < 120; i++) await a.mouse.move(x + (i % 16), y + (i % 3));
  await a.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  const result = await a.evaluate(() => {
    (window as any).__dragObserver.disconnect();
    return {
      commits: (window as any).__dragCommits,
      mapMutations: (window as any).__mapMutations,
    };
  });
  console.log(JSON.stringify({ baseURL, ...result }));
  expect(result.commits).toBeLessThan(8);
  expect(result.mapMutations).toBe(0);
  // Crossing routes must update only the single highlight path, not hundreds of train nodes.
  const cdp = await aContext.newCDPSession(a);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await a.evaluate(() => {
    (window as any).__trackMutations = 0;
    const observer = new MutationObserver((records) => {
      (window as any).__trackMutations += records.length;
    });
    document.querySelectorAll(".map-route").forEach((route) =>
      observer.observe(route, {
        attributes: true,
        childList: true,
        subtree: true,
      }),
    );
    (window as any).__trackObserver = observer;
  });
  await a.mouse.move(map.x + map.width * 0.15, map.y + map.height * 0.25, {
    steps: 30,
  });
  await a.mouse.move(map.x + map.width * 0.85, map.y + map.height * 0.65, {
    steps: 60,
  });
  const trackMutations = await a.evaluate(() => {
    (window as any).__trackObserver.disconnect();
    return (window as any).__trackMutations;
  });
  console.log(
    JSON.stringify({ throttledRouteCrossingMutations: trackMutations }),
  );
  expect(trackMutations).toBe(0);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await a.keyboard.press("Escape");
  await a.mouse.up();
  await expect(a.locator(".card-drag-ghost")).toHaveCount(0);
  await aContext.close();
  await bContext.close();
});
