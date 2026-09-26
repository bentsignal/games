import { tracks } from "../game/map-layout";
import MapLayer, { type MapView } from "./MapLayer";
const highlights = tracks.map(({ route, path, samples }) => {
  const left = Math.min(...samples.map(([x]) => x)) - 14;
  const top = Math.min(...samples.map(([, y]) => y)) - 14;
  const width = Math.max(...samples.map(([x]) => x)) + 14 - left;
  const height = Math.max(...samples.map(([, y]) => y)) + 14 - top;
  return { route, path, left, top, width, height };
});

export default function RouteHighlights({
  view,
  hoverIds,
  selected,
  scoreRoutes,
}: {
  view: MapView;
  hoverIds: string[];
  selected?: string;
  scoreRoutes: string[];
}) {
  return (
    <MapLayer view={view} className="drag-highlight-layer">
      {highlights.map(({ route, path, left, top, width, height }) => (
        <svg
          key={route.id}
          data-drag-highlight={route.id}
          data-route-highlight={route.id}
          data-hovered={
            hoverIds.includes(route.id) ||
            selected === route.id ||
            scoreRoutes.includes(route.id) ||
            undefined
          }
          className="route-highlight"
          viewBox={`${left} ${top} ${width} ${height}`}
          style={{ left, top, width, height }}
        >
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="24"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </MapLayer>
  );
}
