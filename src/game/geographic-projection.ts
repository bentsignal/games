// Albers equal-area conic for North America (standard parallels 29.5°/45.5°).
// A single similarity transform fits the classic board's overall orientation.
// No local warping, coastal offsets, or train/station constraints are applied.
const radians = Math.PI / 180;
const n = (Math.sin(29.5 * radians) + Math.sin(45.5 * radians)) / 2;
const c = Math.cos(29.5 * radians) ** 2 + 2 * n * Math.sin(29.5 * radians);
const origin = Math.sqrt(c - 2 * n * Math.sin(37.5 * radians)) / n;
export function projectGeography([longitude, latitude]: number[]): [
  number,
  number,
] {
  const radius = Math.sqrt(c - 2 * n * Math.sin(latitude * radians)) / n;
  const theta = n * (longitude + 96) * radians;
  const x = radius * Math.sin(theta),
    y = radius * Math.cos(theta) - origin;
  return [
    1846.583785 * x + 296.499202 * y + 756.006962,
    -296.499202 * x + 1846.583785 * y + 532.487026,
  ];
}
