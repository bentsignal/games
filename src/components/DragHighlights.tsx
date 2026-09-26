import { useLayoutEffect, useRef } from "react";
import { routeAvailable, type Game, type View } from "../game/engine";
import { tracks } from "../game/map-layout";

// Each route has a small, fixed paint surface. Hovering changes opacity rather
// than rewriting path geometry on a canvas as large as the entire board.
const highlights = tracks.map(({ route, path, samples }) => {
  const left = Math.min(...samples.map(([x]) => x)) - 14;
  const top = Math.min(...samples.map(([, y]) => y)) - 14;
  const width = Math.max(...samples.map(([x]) => x)) + 14 - left;
  const height = Math.max(...samples.map(([, y]) => y)) + 14 - top;
  return { route, path, left, top, width, height };
});

export default function DragHighlights({
  game,
  view,
  dragging,
}: {
  game: View;
  view: { x: number; y: number; z: number };
  dragging: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = layer.current;
    const content = world.current;
    if (!element || !content) return;
    function resize() {
      const width = element!.clientWidth;
      const height = element!.clientHeight;
      const scale = Math.min(width / 1400, height / 900);
      content!.style.transform = `translate(${(width - 1400 * scale) / 2}px, ${(height - 900 * scale) / 2}px) scale(${scale})`;
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="drag-highlight-layer" ref={layer} aria-hidden="true">
      <div className="drag-highlight-world" ref={world}>
        <div
          className="drag-highlight-world"
          style={{
            transform: `translate(${700 + view.x}px, ${450 + view.y}px) scale(${view.z}) translate(-700px, -450px)`,
          }}
        >
          {highlights
            .filter(({ route }) =>
              game.me
                ? routeAvailable(game as unknown as Game, game.me, route)
                : false,
            )
            .map(({ route, path, left, top, width, height }) => (
              <svg
                key={route.id}
                data-drag-highlight={route.id}
                className="drag-route-highlight"
                viewBox={`${left} ${top} ${width} ${height}`}
                style={{
                  left,
                  top,
                  width,
                  height,
                  willChange: dragging ? "opacity" : undefined,
                }}
              >
                <path
                  d={path}
                  fill="none"
                  stroke="#18a87d"
                  strokeWidth="24"
                  strokeLinecap="round"
                />
              </svg>
            ))}
        </div>
      </div>
    </div>
  );
}
