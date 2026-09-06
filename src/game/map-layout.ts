import { ROUTES, type Route } from "./data";
import geography from "./geography.json";
export type Point = [number, number];
export const cities = geography.cities as unknown as Record<string, Point>;
const bends: Record<string, number> = {
  r0: -18,
  r3: -12,
  r4: 12,
  r7: -23,
  r8: 14,
  r9: 14,
  r10: -12,
  r11: -12,
  r12: 8,
  r13: 8,
  r14: -12,
  r15: -5,
  r16: 112,
  r17: -45,
  r19: -8,
  r20: 8,
  r22: -12,
  r23: 15,
  r26: -12,
  r27: -47,
  r28: -7,
  r29: 12,
  r30: -45,
  r31: -10,
  r32: -12,
  r33: 43,
  r34: 15,
  r37: 4,
  r51: 43,
  r52: 12,
  r53: -4,
  r55: -8,
  r56: 12,
  r58: 6,
  r59: 6,
  r60: -8,
  r61: 65,
  r62: -13,
  r63: -13,
  r64: -7,
  r65: 10,
  r68: 19,
  r73: -17,
  r74: -38,
  r75: -15,
  r76: -7,
  r77: 6,
  r80: 12,
  r81: -15,
  r82: 2,
  r84: -13,
  r85: 38,
  r89: 25,
  r90: -5,
  r93: 6,
  r94: 6,
  r97: -20,
};
export const LANE_SPACING = 27;
export const TRAIN_HEIGHT = 17;
export function routeGeometry(route: Route) {
  const a = cities[route.a],
    b = cities[route.b];
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy);
  const siblings = ROUTES.filter((r) => r.a === route.a && r.b === route.b);
  const lane =
    (siblings.findIndex((r) => r.id === route.id) - (siblings.length - 1) / 2) *
    LANE_SPACING;
  const bend = bends[siblings[0].id] || 0;
  const control: Point = [
    (a[0] + b[0]) / 2 - (dy / len) * bend * 2,
    (a[1] + b[1]) / 2 + (dx / len) * bend * 2,
  ];
  const at = (t: number): Point => {
    const vx = 2 * (1 - t) * (control[0] - a[0]) + 2 * t * (b[0] - control[0]);
    const vy = 2 * (1 - t) * (control[1] - a[1]) + 2 * t * (b[1] - control[1]);
    const length = Math.hypot(vx, vy);
    return [
      (1 - t) ** 2 * a[0] +
        2 * (1 - t) * t * control[0] +
        t * t * b[0] -
        (vy / length) * lane,
      (1 - t) ** 2 * a[1] +
        2 * (1 - t) * t * control[1] +
        t * t * b[1] +
        (vx / length) * lane,
    ];
  };
  const samples = Array.from({ length: 201 }, (_, i) => at(i / 200));
  const distances = [0];
  for (let i = 1; i < samples.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          samples[i][0] - samples[i - 1][0],
          samples[i][1] - samples[i - 1][1],
        ),
    );
  const total = distances[200],
    margin = Math.min(18, total * 0.16),
    usable = total - margin * 2;
  const cell = usable / route.length,
    slot = cell - 4;
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
    const t = pointAt(margin + cell * (i + 0.5)),
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
