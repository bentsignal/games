import { useRef, type CSSProperties } from "react";
import { PALETTE, type Color } from "../game/data";
import { TrainArtwork } from "./TrainArtwork";
export type CardPoint = { x: number; y: number };
export default function TrainCard({
  color,
  count,
  onClick,
  disabled,
  label,
  selected,
  onDrag,
  onDrop,
  onCancel,
}: {
  color: Color | "back";
  count?: number;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
  selected?: boolean;
  onDrag?: (color: Color, point: CardPoint) => void;
  onDrop?: (color: Color, point: CardPoint) => void;
  onCancel?: () => void;
}) {
  const pointer = useRef<{
      id: number;
      x: number;
      y: number;
      active: boolean;
    } | null>(null),
    suppress = useRef(false);
  return (
    <button
      className={`train-card ${color === "wild" ? "wild" : ""} ${color === "back" ? "back" : ""} ${onDrag ? "hand-card" : ""} ${selected ? "held" : ""}`}
      style={
        {
          "--card": color === "back" ? "#743043" : PALETTE[color],
        } as CSSProperties
      }
      disabled={disabled}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      aria-label={label || `${color} ${count ?? ""}`}
      aria-pressed={selected}
      title={
        color === "back"
          ? "Draw a random face-down card"
          : color === "wild"
            ? "Locomotive · wild"
            : `${color}${onDrag ? " · drag to a route" : ""}`
      }
      onClick={() => {
        if (suppress.current) {
          suppress.current = false;
          return;
        }
        onClick?.();
      }}
      onPointerDown={(e) => {
        suppress.current = false;
        if (!onDrag || color === "back" || e.button !== 0) return;
        e.preventDefault();
        pointer.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          active: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = pointer.current;
        if (!p || p.id !== e.pointerId || color === "back") return;
        if (p.active || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) {
          p.active = true;
          suppress.current = true;
          onDrag?.(color, { x: e.clientX, y: e.clientY });
        }
      }}
      onPointerUp={(e) => {
        const p = pointer.current;
        pointer.current = null;
        if (p?.active && color !== "back") {
          suppress.current = true;
          onDrop?.(color, { x: e.clientX, y: e.clientY });
        }
      }}
      onPointerCancel={() => {
        pointer.current = null;
        suppress.current = true;
        onCancel?.();
      }}
      onLostPointerCapture={() => {
        if (pointer.current?.active) onCancel?.();
        pointer.current = null;
      }}
    >
      <span className="card-corner">
        {color === "wild"
          ? "★"
          : color === "back"
            ? ""
            : color[0].toUpperCase()}
      </span>
      <TrainArtwork color={color} />
      <span className="card-name">
        {color === "back" ? "FACE DOWN" : color === "wild" ? "LOCO" : color}
      </span>
      {count !== undefined && <b className="card-count">{count}</b>}
    </button>
  );
}
