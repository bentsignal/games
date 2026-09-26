import { useLayoutEffect, useRef, type ReactNode } from "react";
export type MapView = { x: number; y: number; z: number };
// All interaction layers share the same letterboxing and camera transform.
export default function MapLayer({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
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
    <div
      className={`map-interaction-layer ${className}`}
      ref={layer}
      aria-hidden="true"
    >
      <div className="map-layer-world" ref={world}>
        {children}
      </div>
    </div>
  );
}
