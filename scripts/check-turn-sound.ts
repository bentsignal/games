import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.resourceType() === "fetch" && r.url().includes("clock-tick"))
      requests.push(r.url());
  });
  await page.addInitScript(() => {
    const w = window as any;
    w.ticks = { started: 0, ended: 0 };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this),
        start = source.start.bind(source);
      source.start = (...args) => {
        if (source.loop) {
          w.ticks.started++;
          source.addEventListener("ended", () => w.ticks.ended++);
          const analyser = this.createAnalyser();
          source.connect(analyser);
          w.tickAnalyser = analyser;
        }
        start(...args);
      };
      return source;
    };
  });
  await page.goto(
    server.resolvedUrls!.local[0] + "tests/fixtures/turn-sound.html",
  );
  assert.equal(requests.length, 0);
  await page.getByText("My turn", { exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  assert.equal(await page.evaluate(() => (window as any).ticks.started), 0);
  await expect
    .poll(() => page.evaluate(() => (window as any).ticks.started))
    .toBe(1);
  const peak = await page.evaluate(async () => {
    const a = (window as any).tickAnalyser as AnalyserNode;
    const data = new Float32Array(a.fftSize);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      a.getFloatTimeDomainData(data);
      peak = Math.max(peak, ...data.map(Math.abs));
      await new Promise((r) => setTimeout(r, 10));
    }
    return peak;
  });
  assert(peak > 0.005, `Recorded ticks are audible: ${peak}`);
  await page.getByText("Update", { exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => (window as any).ticks.started), 1);
  await page.getByText("Other turn", { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).ticks.ended))
    .toBe(1);
  await page.getByText("My turn", { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).ticks.started))
    .toBe(2);
  await page.getByText("Mute", { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).ticks.ended))
    .toBe(2);
  assert.equal(requests.length, 1);
  await page.reload();
  await page.getByText("My turn", { exact: true }).click();
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => (window as any).ticks.started), 0);
  await page.evaluate(() => localStorage.setItem("railbound-effects", "on"));
  await page.reload();
  await page.getByText("My turn", { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).ticks.started))
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => (window as any).ticks.ended), {
      timeout: 12000,
    })
    .toBe(1);
  await expect(page.getByRole("timer")).toHaveText("0:00");
  assert.deepEqual(errors, []);
  console.log(
    "Passed: warning starts at 10 seconds, audible loop, no update restart, stops on other turn/mute, cached once, mute persists.",
  );
} finally {
  await browser.close();
  await server.close();
}
