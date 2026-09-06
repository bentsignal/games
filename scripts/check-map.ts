import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { cities, tracks } from "../src/game/map-layout";
import { projectGeography } from "../src/game/geographic-projection";

// Basemap changes must never disturb the approved board geometry.
const signature = createHash("sha256")
  .update(
    JSON.stringify({
      cities,
      tracks: tracks.map((t) => ({
        id: t.route.id,
        cars: t.cars.map((c) =>
          [c.x, c.y, c.angle, c.width].map(
            (n) => Math.round(n * 10000) / 10000,
          ),
        ),
      })),
    }),
  )
  .digest("hex");
assert.equal(
  signature,
  "0fc3548449fae7e7df825c6ea95567ed7a46eb94f4544408e1b5daa116feb3f5",
);

const landmarks = [
  { name: "Orlando", geo: [-81.38, 28.54], land: true },
  { name: "Tallahassee", geo: [-84.28, 30.44], land: true },
  { name: "Atlantic east of Florida", geo: [-80, 30], land: false },
  { name: "Gulf west of Florida", geo: [-84, 28], land: false },
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = fn => fn");
  await page.goto("file:///tmp/railbound-map-proof.html");
  const results = await page.evaluate(
    (points) => {
      const land = [
        ...document.querySelectorAll(".atlas-geography > path"),
      ].filter((p) => p.getAttribute("fill") !== "none") as SVGPathElement[];
      return points.map((p) => ({
        name: p.name,
        land: land.some((path) =>
          path.isPointInFill(new DOMPoint(...p.position)),
        ),
      }));
    },
    landmarks.map((p) => ({ name: p.name, position: projectGeography(p.geo) })),
  );
  assert.deepEqual(
    results,
    landmarks.map(({ name, land }) => ({ name, land })),
  );
} finally {
  await browser.close();
}
console.log(
  "Approved track geometry unchanged; Florida land/water landmarks pass.",
);
