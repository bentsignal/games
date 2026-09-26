import {
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import { PALETTE, ROUTES, type Color } from "../game/data";
import { cardPayment } from "../game/interactions";
import type { View } from "../game/engine";
import type { CardPoint } from "./TrainCard";
import { TrainArtwork } from "./TrainArtwork";
export type DragGhostHandle = {
  move: (point: CardPoint) => void;
  target: (id: string | undefined) => void;
};

// Pointer positions update the compositor; target labels update only this component.
export default function CardDragGhost({
  ref,
  point,
  color,
  game,
}: {
  ref: Ref<DragGhostHandle>;
  point: CardPoint;
  color: Color;
  game: View | null | undefined;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<string>();
  useImperativeHandle(
    ref,
    () => ({
      move(next: CardPoint) {
        if (element.current)
          element.current.style.translate = `${next.x}px ${next.y}px`;
      },
      target: setTarget,
    }),
    [],
  );
  const route = ROUTES.find((r) => r.id === target);
  const payment = game && route ? cardPayment(game, route, color) : undefined;
  return (
    <div
      className="card-drag-ghost"
      ref={element}
      aria-hidden="true"
      style={
        {
          left: 0,
          top: 0,
          translate: `${point.x}px ${point.y}px`,
          "--card": PALETTE[color],
        } as CSSProperties
      }
    >
      <TrainArtwork color={color} />
      <b>
        {payment && route
          ? `${route.length - payment.wilds} ${payment.color}${payment.wilds ? ` + ${payment.wilds} ★` : ""}`
          : color}
      </b>
    </div>
  );
}
