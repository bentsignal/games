import { tracks, type Point } from "../../src/game/map-layout";
export function trainCorners(car: {
  x: number;
  y: number;
  angle: number;
  width: number;
}): Point[] {
  const angle = (car.angle * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  // Encloses body, stroke, wheels and shadow, plus a small clearance.
  return [
    [-car.width / 2 - 1.5, -10],
    [car.width / 2 + 2.5, -10],
    [car.width / 2 + 2.5, 11.5],
    [-car.width / 2 - 1.5, 11.5],
  ].map(([x, y]) => [car.x + x * c - y * s, car.y + x * s + y * c]);
}
export function overlaps(a: Point[], b: Point[]) {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length],
        axis = [p[1] - q[1], q[0] - p[0]];
      const pa = a.map((p) => p[0] * axis[0] + p[1] * axis[1]),
        pb = b.map((p) => p[0] * axis[0] + p[1] * axis[1]);
      if (
        Math.max(...pa) <= Math.min(...pb) ||
        Math.max(...pb) <= Math.min(...pa)
      )
        return false;
    }
  return true;
}
export function collisions() {
  const cars = tracks.flatMap((t) =>
    t.cars.map((c, i) => ({
      id: t.route.id,
      index: i,
      polygon: trainCorners(c),
    })),
  );
  const hits: string[] = [];
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++) {
      if (overlaps(cars[i].polygon, cars[j].polygon))
        hits.push(
          `${cars[i].id}:${cars[i].index}/${cars[j].id}:${cars[j].index}`,
        );
    }
  return hits;
}
