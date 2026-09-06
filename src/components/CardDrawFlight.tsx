import { useEffect, useRef } from "react";
import TrainCard from "./TrainCard";
import type { Color } from "../game/data";
export interface DrawFlight {
  id: number;
  color: Color;
  from: { x: number; y: number; width: number };
}
export default function CardDrawFlight({
  flight,
  onFinish,
}: {
  flight: DrawFlight;
  onFinish: (id: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = element.current;
    const hand = document.querySelector<HTMLElement>(
      `.hand-cards [data-card-color="${flight.color}"]`,
    );
    if (!el || !hand) {
      onFinish(flight.id);
      return;
    }
    const target = hand.getBoundingClientRect();
    const to = {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    };
    const { from } = flight;
    const transform = (x: number, y: number, scale: number, rotation = 0) =>
      `translate3d(${x - 46}px, ${y - 64}px, 0) scale(${scale}) rotate(${rotation}deg)`;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = el.animate(
      reduced
        ? [
            { transform: transform(to.x, to.y, 0.75), opacity: 0.7 },
            { transform: transform(to.x, to.y, 0.75), opacity: 0 },
          ]
        : [
            {
              transform: transform(from.x, from.y, from.width / 92),
              opacity: 0.9,
              offset: 0,
              easing: "cubic-bezier(.2,.65,.3,1)",
            },
            {
              transform: transform(
                from.x + (to.x - from.x) * 0.28,
                Math.max(80, from.y - 95),
                1.05,
                -7,
              ),
              opacity: 1,
              offset: 0.3,
            },
            {
              transform: transform(
                from.x + (to.x - from.x) * 0.4,
                Math.max(80, from.y - 80),
                1.05,
                -3,
              ),
              opacity: 1,
              offset: 0.48,
              easing: "cubic-bezier(.55,0,.7,.4)",
            },
            { transform: transform(to.x, to.y, 0.4), opacity: 0, offset: 1 },
          ],
      {
        duration: reduced ? 120 : 650,
        easing: "linear",
        fill: "forwards",
      },
    );
    animation.onfinish = () => {
      if (!reduced)
        hand.animate(
          [{ filter: "brightness(1.35)" }, { filter: "brightness(1)" }],
          { duration: 180 },
        );
      onFinish(flight.id);
    };
    return () => animation.cancel();
  }, [flight, onFinish]);
  return (
    <div
      ref={element}
      className="card-draw-flight"
      data-drawn-color={flight.color}
      aria-hidden="true"
    >
      <TrainCard color={flight.color} disabled />
    </div>
  );
}
