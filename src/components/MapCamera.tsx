import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { MapView } from "./MapLayer";

// Move already-painted artwork as one composited surface. Camera changes never
// alter the detailed SVG geometry or its descendants' props.
export default function MapCamera({
  view,
  children,
}: {
  view: MapView;
  children: ReactNode;
}) {
  const camera = useRef<HTMLDivElement>(null);
  const sharpScale = useRef(1);
  useLayoutEffect(() => {
    const element = camera.current;
    if (!element) return;
    const resize = () => {
      const scale = Math.min(
        element.clientWidth / 1400,
        element.clientHeight / 900,
      );
      element.style.setProperty("--map-fit", String(scale));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = camera.current;
    if (!element) return;
    element.style.willChange = "transform";
    if (sharpScale.current === view.z) {
      element.dataset.cameraSettled = "true";
      return;
    }
    delete element.dataset.cameraSettled;
    let frame = 0;
    // Keep the existing raster during a gesture, then render at the final scale
    // so zoomed text stays sharp. Two frames let the browser observe the change.
    const timer = window.setTimeout(() => {
      element.style.willChange = "auto";
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          element.style.willChange = "transform";
          sharpScale.current = view.z;
          element.dataset.cameraSettled = "true";
        });
      });
    }, 200);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [view]);
  return (
    <div
      ref={camera}
      className="map-camera"
      style={{
        transform: `translate(calc(${view.x}px * var(--map-fit, 1)), calc(${view.y}px * var(--map-fit, 1))) scale(${view.z})`,
      }}
    >
      {children}
    </div>
  );
}
