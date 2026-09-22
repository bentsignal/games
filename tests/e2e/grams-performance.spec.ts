import { test, expect } from "@playwright/test";

test("Grams typing stays local and delayed verdicts preserve the next answer", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).commands = [];
    window.addEventListener("message", (event) => {
      if (event.data?.type === "grams-ready")
        window.postMessage(
          { type: "grams-lobby", reset: true },
          location.origin,
        );
      if (event.data?.type !== "grams-command") return;
      (window as any).commands.push(event.data);
      if (event.data.args.kind === "requestJoin")
        window.postMessage(
          {
            type: "grams-reply",
            request: event.data.request,
          },
          location.origin,
        );
    });
  });
  await page.goto("/grams-assets/v1/index.html");
  await expect(page.locator("#create-lobby")).toBeEnabled();
  await page.evaluate(() => {
    window.postMessage(
      {
        type: "grams-state",
        state: {
          id: "qa",
          name: "Typing QA",
          host: "qa",
          round: 1,
          phase: "playing",
          letters: ["l", "e", "t", "t", "e", "r"],
          startAt: Date.now() - 1000,
          serverNow: Date.now(),
          endAt: Date.now() + 60000,
          seq: 0,
          players: [
            {
              id: "qa",
              name: "Typing QA",
              pfp: "ben-face-1.jpg",
              wins: 0,
              score: 0,
            },
          ],
          me: { words: [], score: 0 },
        },
      },
      location.origin,
    );
  });
  await expect(page.locator(".letter-available.filled")).toHaveCount(6);
  await page.locator("#timer").click();
  await page.evaluate(() => {
    (window as any).tiles = [
      ...document.querySelectorAll(".letter-used, .letter-available"),
    ];
  });

  await page.keyboard.type("LETTER");
  await expect(page.locator(".letter-used.filled")).toHaveText([
    "l",
    "e",
    "t",
    "t",
    "e",
    "r",
  ]);
  await page.keyboard.press("Backspace");
  await expect(page.locator(".letter-used.filled")).toHaveCount(5);
  await page.keyboard.type("r");
  await page.keyboard.press("Enter");
  await expect(page.locator(".letter-used.filled")).toHaveCount(0);
  await page.keyboard.type("let");
  await expect(page.locator(".letter-used.filled")).toHaveText(["l", "e", "t"]);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).commands.map((c: any) => c.args.kind),
      ),
    )
    .toContain("wordSubmit");
  await page.evaluate(() => {
    const command = (window as any).commands.find(
      (c: any) => c.args.kind === "wordSubmit",
    );
    window.postMessage(
      {
        type: "grams-reply",
        request: command.request,
        result: {
          accepted: true,
          word: "letter",
          points: 600,
          player: { words: ["letter"], score: 600 },
        },
      },
      location.origin,
    );
  });
  await expect(page.locator("#wordCount")).toHaveText("Words: 1");
  await expect(page.locator(".letter-used.filled")).toHaveText(["l", "e", "t"]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("tree");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).commands.filter(
            (c: any) => c.args.kind === "wordSubmit",
          ).length,
      ),
    )
    .toBe(2);
  await page.evaluate(() => {
    const command = (window as any).commands
      .filter((c: any) => c.args.kind === "wordSubmit")
      .at(-1);
    window.postMessage(
      {
        type: "grams-reply",
        request: command.request,
        result: { accepted: false },
      },
      location.origin,
    );
  });
  await expect(page.locator("#game-wrapper")).toHaveClass(/word-declined/);
  await expect(page.locator(".letter-used.filled")).toHaveText([
    "t",
    "r",
    "e",
    "e",
  ]);
  await page.keyboard.press("Space");
  await page.keyboard.press(";");
  await expect(page.locator(".letter-available.filled")).toHaveCount(6);
  expect(
    await page.evaluate(() => {
      const tiles = [
        ...document.querySelectorAll(".letter-used, .letter-available"),
      ];
      return tiles.every((tile, i) => tile === (window as any).tiles[i]);
    }),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as any).commands
        .filter((c: any) => c.args.kind === "wordSubmit")
        .map((c: any) => c.args.word),
    ),
  ).toEqual(["letter", "let"]);
  expect(
    await page
      .locator("#world")
      .evaluate((world) =>
        world
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState === "paused"),
      ),
  ).toBe(true);

  // Exercise the real key handler under CPU throttling with rendering between keys.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const samples = await page.evaluate(async () => {
    const timings = [];
    for (let i = 0; i < 60; i++) {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
      const start = performance.now();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "l", bubbles: true }),
      );
      if (document.querySelector(".letter-used.filled")?.textContent !== "l")
        throw new Error("Key did not update the tile synchronously");
      timings.push(performance.now() - start);
      await new Promise(requestAnimationFrame);
    }
    return timings.sort((a, b) => a - b);
  });
  console.log("Grams key handler at 4x CPU slowdown, p95 ms:", samples[56]);
  expect(samples[56]).toBeLessThan(16);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(errors).toEqual([]);
});
