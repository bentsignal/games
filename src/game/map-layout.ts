import { ROUTES, type Route } from "./data";
import geography from "./geography.json";
export type Point = [number, number];
export const cities = geography.cities as unknown as Record<string, Point>;
const bends: Record<string, number> = {
  r0: -25,
  r3: 7,
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
  r16: 45,
  r17: -45,
  r19: -8,
  r20: 8,
  r22: -12,
  r23: 15,
  r26: -12,
  r27: -47,
  r28: -7,
  r29: -5,
  r30: -45,
  r31: -10,
  r32: -12,
  r33: -5,
  r34: 15,
  r37: 4,
  r51: 43,
  r52: 12,
  r53: -4,
  r55: -8,
  r56: -20,
  r58: 6,
  r59: 6,
  r60: -20,
  r61: 65,
  r62: -13,
  r63: -13,
  r64: -7,
  r65: 10,
  r68: -5,
  r73: -17,
  r74: -38,
  r75: -15,
  r76: -7,
  r77: 6,
  r80: 12,
  r81: 12,
  r82: 2,
  r84: 8,
  r85: 38,
  r89: -4,
  r90: -5,
  r93: 6,
  r94: 6,
  r97: -20,
};
// Hand-shaped approaches give crowded stations separate entry angles.
const guides: Record<string, [Point, Point]> = {
  r16: [
    [323, 690],
    [435, 734],
  ],
  r26: [
    [350, 535],
    [394, 503],
  ],
  r27: [
    [416, 563],
    [479, 531],
  ],
  r23: [
    [577, 348],
    [650, 360],
  ],
  r60: [
    [607, 397],
    [680, 439],
  ],
  r33: [
    [868, 283],
    [994, 277],
  ],
  r73: [
    [925, 290],
    [1058, 305],
  ],
  r34: [
    [822, 322],
    [870, 334],
  ],
  r37: [
    [798, 408],
    [865, 387],
  ],
  r51: [
    [625, 759],
    [745, 774],
  ],
  r52: [
    [611, 703],
    [694, 699],
  ],
  r53: [
    [600, 660],
    [690, 615],
  ],
  r55: [
    [610, 577],
    [682, 563],
  ],
  r56: [
    [680, 517],
    [634, 548],
  ],
  r58: [
    [625, 480],
    [700, 464],
  ],
  r68: [
    [938, 463],
    [1060, 417],
  ],
  r84: [
    [1040, 475],
    [1070, 419],
  ],
  r81: [
    [1127, 390],
    [1113, 433],
  ],
  r82: [
    [1040, 513],
    [1083, 496],
  ],
  r87: [
    [1093, 539],
    [1119, 533],
  ],
  r86: [
    [1090, 588],
    [1134, 580],
  ],
};
const stationMargins: Record<string, [number, number]> = {
  r16: [50, 34],
  r10: [30, 42],
  r23: [34, 48],
  r27: [32, 49],
  r32: [44, 34],
  r33: [38, 44],
  r34: [34, 45],
  r37: [34, 48],
  r55: [34, 43],
  r56: [42, 47],
  r58: [46, 34],
  r60: [46, 45],
  r68: [45, 65],
  r81: [45, 35],
  r82: [34, 47],
  r84: [34, 48],
};
export const LANE_SPACING = 22;
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
  const [c1, c2] = guides[siblings[0].id] ?? [
    [
      a[0] + ((control[0] - a[0]) * 2) / 3,
      a[1] + ((control[1] - a[1]) * 2) / 3,
    ],
    [
      b[0] + ((control[0] - b[0]) * 2) / 3,
      b[1] + ((control[1] - b[1]) * 2) / 3,
    ],
  ];
  const at = (t: number): Point => {
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
        (vy / length) * lane,
      u * u * u * a[1] +
        3 * u * u * t * c1[1] +
        3 * u * t * t * c2[1] +
        t * t * t * b[1] +
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
    margin = Math.min(34, total * 0.24);
  const [startMargin, endMargin] = stationMargins[siblings[0].id] ?? [
    margin,
    margin,
  ];
  const usable = total - startMargin - endMargin;
  const cell = usable / route.length,
    slot = Math.min(42, cell - 10);
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
