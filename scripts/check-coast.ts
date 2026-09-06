import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { tracks } from "../src/game/map-layout";
import { trainCorners } from "../tests/helpers/map-collisions";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript("window.__name = fn => fn");
await page.goto("file:///tmp/railbound-map-proof.html");
const results = await page.evaluate(
  (data) => {
    const land = [
      ...document.querySelectorAll(".atlas-geography > path"),
    ].filter((p) => p.getAttribute("fill") !== "none") as SVGPathElement[];
    const onLand = (p: number[]) =>
      land.some((l) => l.isPointInFill(new DOMPoint(p[0], p[1])));
    return data
      .map((t) => ({
        id: t.id,
        missing: t.cars
          .map((c, i) => ({
            i,
            center: c.center,
            onLand: onLand(c.center),
            corners: c.corners.filter((p) => !onLand(p)).length,
          }))
          .filter((c) => !c.onLand || c.corners),
      }))
      .filter((t) => t.missing.length);
  },
  tracks.map((t) => ({
    id: t.route.id,
    cars: t.cars.map((c) => ({ center: [c.x, c.y], corners: trainCorners(c) })),
  })),
);
await browser.close();
// Both lanes of each requested coastal connection, plus Atlanta–Miami.
const coastalRoutes = new Set([
  "r12",
  "r13",
  "r61",
  "r85",
  "r89",
  "r93",
  "r94",
  "r95",
  "r96",
]);
assert.deepEqual(
  results.filter((r) => coastalRoutes.has(r.id)),
  [],
  "Coastal train centers and padded corners must remain on land",
);
console.log(`Shoreline check passed for ${coastalRoutes.size} coastal tracks.`);
