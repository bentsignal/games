import { ROUTES, type Route } from "./data";
import layout from "./atlas-layout.json";
export type Point = [number, number];
// Station positions and approaches follow the Classic USA board reference.
// Pieces have one fixed physical size; route curves and spacing fit around them.
export const cities = layout.cities as unknown as Record<string, Point>;
const guides = layout.guides as unknown as Record<string, [Point, Point]>;
const stationMargins = layout.margins as unknown as Record<
  string,
  [number, number]
>;
export const TRAIN_WIDTH = 36;
export const LANE_SPACING = 22;
export const TRAIN_HEIGHT = 17;
export function routeGeometry(route: Route) {
  const a = cities[route.a],
    b = cities[route.b];
  const siblings = ROUTES.filter((r) => r.a === route.a && r.b === route.b);
  const lane =
    (siblings.findIndex((r) => r.id === route.id) - (siblings.length - 1) / 2) *
    LANE_SPACING;
  const [c1, c2] = guides[siblings[0].id] ?? [
    [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
    [a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3],
  ];
  const at = (t: number, lateral = lane): Point => {
    const u = 1 - t;
    const vx =
      3 * u * u * (c1[0] - a[0]) +
      6 * u * t * (c2[0] - c1[0]) +
      3 * t * t * (b[0] - c2[0]);
    const vy =
      3 * u * u * (c1[1] - a[1]) +
      6 * u * t * (c2[1] - c1[1]) +
      3 * t * t * (b[1] - c2[1]);
    const length = Math.hypot(vx, vy);
    return [
      u * u * u * a[0] +
        3 * u * u * t * c1[0] +
        3 * u * t * t * c2[0] +
        t * t * t * b[0] -
        (vy / length) * lateral,
      u * u * u * a[1] +
        3 * u * u * t * c1[1] +
        3 * u * t * t * c2[1] +
        t * t * t * b[1] +
        (vx / length) * lateral,
    ];
  };
  const samples = Array.from({ length: 201 }, (_, i) => at(i / 200));
  const centerSamples = Array.from({ length: 201 }, (_, i) => at(i / 200, 0));
  const distances = [0];
  for (let i = 1; i < samples.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          centerSamples[i][0] - centerSamples[i - 1][0],
          centerSamples[i][1] - centerSamples[i - 1][1],
        ),
    );
  const total = distances[200],
    margin = 14;
  const [startMargin, endMargin] = stationMargins[siblings[0].id] ?? [
    margin,
    margin,
  ];
  const usable = total - startMargin - endMargin;
  const cell = usable / route.length,
    slot = TRAIN_WIDTH;
  function pointAt(distance: number) {
    let i = 1;
    while (i < 200 && distances[i] < distance) i++;
    return (
      (i -
        1 +
        (distance - distances[i - 1]) / (distances[i] - distances[i - 1])) /
      200
    );
  }
  const cars = Array.from({ length: route.length }, (_, i) => {
    const t = pointAt(startMargin + cell * (i + 0.5)),
      p = at(t),
      before = at(t - 0.001),
      after = at(t + 0.001);
    return {
      x: p[0],
      y: p[1],
      angle:
        (Math.atan2(after[1] - before[1], after[0] - before[0]) * 180) /
        Math.PI,
      width: slot,
    };
  });
  return {
    path: samples
      .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
      .join(""),
    cars,
    samples,
  };
}
export const tracks = ROUTES.map((route) => ({
  route,
  ...routeGeometry(route),
}));

// Geometric hit testing avoids asking the browser to hit-test the full detailed
// coastline and hundreds of SVG train elements on every pointer movement.
const hitTracks = tracks.map((t) => {
  const points = t.samples.filter((_, i) => i % 4 === 0);
  return {
    id: t.route.id,
    points,
    minX: Math.min(...points.map((p) => p[0])) - 16,
    maxX: Math.max(...points.map((p) => p[0])) + 16,
    minY: Math.min(...points.map((p) => p[1])) - 16,
    maxY: Math.max(...points.map((p) => p[1])) + 16,
  };
});
export function routeAtMapPoint(x: number, y: number) {
  let best = 16 * 16,
    id: string | undefined;
  for (const route of hitTracks) {
    if (x < route.minX || x > route.maxX || y < route.minY || y > route.maxY)
      continue;
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)),
      );
      const distance = (x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2;
      if (distance < best) {
        best = distance;
        id = route.id;
      }
    }
  }
  return id;
}
