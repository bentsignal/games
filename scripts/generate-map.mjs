// Natural Earth public-domain coastlines, lakes and state borders.
// One global geographic projection for coastlines, lakes and state borders.
import fs from "node:fs/promises";
const layout = JSON.parse(
  await fs.readFile("src/game/atlas-layout.json", "utf8"),
);
const cities = layout.cities;
// Albers equal-area projection, followed only by a uniform scale and rotation.
// The coastline is independent of board stations and routes.
import { projectGeography as project } from "../src/game/geographic-projection.ts";
function line(points, close = false) {
  let prev = null;
  const out = [];
  for (const coord of points) {
    const p = project(coord);
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.7) {
      out.push(
        `${out.length ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`,
      );
      prev = p;
    }
  }
  return out.join("") + (close ? "Z" : "");
}
function polygon(rings) {
  return rings.map((r) => line(r, true)).join("");
}
const base =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
async function data(file) {
  const r = await fetch(base + file + ".geojson");
  if (!r.ok) throw Error(r.statusText);
  return r.json();
}
const [countries, lakes, states] = await Promise.all([
  data("ne_50m_admin_0_countries"),
  data("ne_50m_lakes"),
  data("ne_50m_admin_1_states_provinces_lines"),
]);
const land = countries.features
  .filter((f) =>
    [
      "United States of America",
      "Canada",
      "Mexico",
      "Cuba",
      "The Bahamas",
    ].includes(f.properties.ADMIN),
  )
  .map((f) => ({
    name: f.properties.ADMIN,
    path:
      f.geometry.type === "Polygon"
        ? polygon(f.geometry.coordinates)
        : f.geometry.coordinates.map(polygon).join(""),
  }));
const inRegion = (p) => p[0] > -132 && p[0] < -60 && p[1] > 22 && p[1] < 57;
const water = lakes.features
  .flatMap((f) =>
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates,
  )
  .filter((rings) => rings[0].some(inRegion))
  .map(polygon);
const borders = states.features
  .flatMap((f) =>
    f.geometry.type === "LineString"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates,
  )
  .filter((points) => points.some(inRegion))
  .map((p) => line(p));
await fs.writeFile(
  "src/game/geography.json",
  JSON.stringify({ cities, land, water, borders }),
);
console.log(
  "Generated geographic basemap; board stations and routes are unchanged.",
);
