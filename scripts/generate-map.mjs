// Natural Earth public-domain coastlines, lakes and state borders.
// A thin-plate spline gently adapts geographic coordinates to the spacious
// printed-board city layout. All layers share the same transformation.
import fs from "node:fs/promises";
const layout = JSON.parse(
  await fs.readFile("src/game/atlas-layout.json", "utf8"),
);
const geo = {
  Atlanta: [-84.39, 33.75],
  Boston: [-71.06, 42.36],
  Calgary: [-114.07, 51.05],
  Charleston: [-79.93, 32.78],
  Chicago: [-87.63, 41.88],
  Dallas: [-96.8, 32.78],
  Denver: [-104.99, 39.74],
  Duluth: [-92.1, 46.79],
  "El Paso": [-106.49, 31.76],
  Helena: [-112.04, 46.59],
  Houston: [-95.37, 29.76],
  "Kansas City": [-94.58, 39.1],
  "Las Vegas": [-115.14, 36.17],
  "Little Rock": [-92.29, 34.75],
  "Los Angeles": [-118.24, 34.05],
  Miami: [-80.19, 25.76],
  Montreal: [-73.57, 45.5],
  Nashville: [-86.78, 36.16],
  "New Orleans": [-90.07, 29.95],
  "New York": [-74.01, 40.71],
  "Oklahoma City": [-97.52, 35.47],
  Omaha: [-95.93, 41.26],
  Phoenix: [-112.07, 33.45],
  Pittsburgh: [-80, 40.44],
  Portland: [-122.68, 45.52],
  Raleigh: [-78.64, 35.78],
  "Saint Louis": [-90.2, 38.63],
  "Salt Lake City": [-111.89, 40.76],
  "San Francisco": [-122.42, 37.77],
  "Santa Fe": [-105.94, 35.69],
  "Sault St. Marie": [-84.35, 46.5],
  Seattle: [-122.33, 47.61],
  Toronto: [-79.38, 43.65],
  Vancouver: [-123.12, 49.28],
  Washington: [-77.04, 38.91],
  Winnipeg: [-97.14, 49.9],
};
// Additional shoreline anchors retain the reference board’s broad Florida
// peninsula and California coast without changing the route network.
const coastline = {
  Pensacola: { geo: [-87.22, 30.42], point: [1030, 785] },
  Tallahassee: { geo: [-84.28, 30.44], point: [1090, 758] },
  CedarKey: { geo: [-83.03, 29.14], point: [1135, 802] },
  Tampa: { geo: [-82.46, 27.95], point: [1170, 813] },
  Jacksonville: { geo: [-81.66, 30.33], point: [1290, 670] },
  Canaveral: { geo: [-80.6, 28.4], point: [1300, 745] },
  BigSur: { geo: [-121.8, 36.25], point: [62, 620] },
  SantaBarbara: { geo: [-119.7, 34.42], point: [132, 680] },
};
Object.assign(
  geo,
  Object.fromEntries(
    Object.entries(coastline).map(([name, p]) => [name, p.geo]),
  ),
);
const entries = Object.entries(geo),
  n = entries.length;
const anchors = entries.map(([, [lon, lat]]) => [lon * 0.76, lat]);
const cities = layout.cities;
// Coastal city markers sit inland from their geographic shoreline anchors,
// as on the printed board. Apply the same projection to every land layer.
const shoreOffsets = {
  Vancouver: [-18, 0],
  Seattle: [-18, 0],
  "San Francisco": [-22, 0],
  "Los Angeles": [-10, 18],
  "New Orleans": [0, 20],
  Charleston: [25, 0],
  Washington: [25, 0],
  "New York": [35, 0],
  Boston: [35, 0],
  Miami: [30, 20],
};
const targets = Object.fromEntries(
  Object.entries(cities).map(([name, p]) => [
    name,
    p.map((v, i) => v + (shoreOffsets[name]?.[i] ?? 0)),
  ]),
);
Object.assign(
  targets,
  Object.fromEntries(
    Object.entries(coastline).map(([name, p]) => [name, p.point]),
  ),
);
const kernel = (a, b) => {
  const r = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  return r ? (r * Math.log(r)) / 2 : 0;
};
function solve(rhs) {
  const m = Array.from({ length: n + 3 }, () => Array(n + 4).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) m[i][j] = kernel(anchors[i], anchors[j]);
    m[i][n] = m[n][i] = 1;
    m[i][n + 1] = m[n + 1][i] = anchors[i][0];
    m[i][n + 2] = m[n + 2][i] = anchors[i][1];
    m[i][n + 3] = rhs[i];
  }
  for (let i = 0; i < n + 3; i++) {
    let best = i;
    for (let j = i + 1; j < n + 3; j++)
      if (Math.abs(m[j][i]) > Math.abs(m[best][i])) best = j;
    [m[i], m[best]] = [m[best], m[i]];
    const divisor = m[i][i];
    for (let k = i; k < n + 4; k++) m[i][k] /= divisor;
    for (let j = 0; j < n + 3; j++)
      if (j !== i) {
        const f = m[j][i];
        for (let k = i; k < n + 4; k++) m[j][k] -= f * m[i][k];
      }
  }
  return m.map((r) => r[n + 3]);
}
const weights = [0, 1].map((axis) =>
  solve(entries.map(([name]) => targets[name][axis])),
);
function project([lon, lat]) {
  const p = [lon * 0.76, lat];
  return weights.map(
    (w) =>
      w[n] +
      w[n + 1] * p[0] +
      w[n + 2] * p[1] +
      anchors.reduce((sum, a, i) => sum + w[i] * kernel(p, a), 0),
  );
}
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
console.log("Generated geography and 36 aligned city positions.");
