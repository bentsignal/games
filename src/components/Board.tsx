import RouteHighlights from "./RouteHighlights";
import BoardArtwork from "./BoardArtwork";
import BoardTerrain from "./BoardTerrain";
import BoardHitTargets from "./BoardHitTargets";
import TicketHighlights from "./TicketHighlights";
import { diagnosticCount } from "../game/diagnostics";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, Info } from "lucide-react";
import { ROUTES, type Route } from "../game/data";
import { routeAvailable, type Game, type View } from "../game/engine";
import { parallelBlockReason, type TicketPreview } from "../game/interactions";
import { type Point } from "../game/map-layout";
export default function Board({
  game,
  selected,
  onSelect,
  focus = [],
  reset = 0,
  top = false,
  eligible,
  dropTarget,
  previews = [],
  controls,
  colorSeed = "",
  completedTickets = [],
  scoreRoutes = [],
}: {
  game?: View | null;
  selected?: string;
  onSelect: (route: Route | null) => void;
  focus?: string[];
  reset?: number;
  top?: boolean;
  eligible?: string[];
  dropTarget?: string;
  previews?: TicketPreview[];
  controls?: ReactNode;
  colorSeed?: string;
  completedTickets?: string[];
  scoreRoutes?: string[];
}) {
  diagnosticCount("board-renders");
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [hover, setHover] = useState<string>();
  const pointers = useRef(new Map<number, Point>());
  const moved = useRef(false);
  const clamp = (z: number) => Math.max(1, Math.min(3.5, z));
  useEffect(() => setView({ x: 0, y: 0, z: 1 }), [reset]);
  useEffect(() => setView({ x: 0, y: 0, z: top ? 1.8 : 1 }), [top]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const z = clamp(v.z * Math.exp(-e.deltaY * 0.0015));
        return z === 1 ? { x: 0, y: 0, z } : { ...v, z };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  function zoom(factor: number) {
    setView((v) => {
      const z = clamp(v.z * factor);
      return z === 1 ? { x: 0, y: 0, z } : { ...v, z };
    });
  }
  const [help, setHelp] = useState(false);
  const demo = !game;
  function routeFromTarget(target: EventTarget | null) {
    const routeId =
      target instanceof Element
        ? target.closest("[data-route]")?.getAttribute("data-route")
        : null;
    return ROUTES.find((route) => route.id === routeId);
  }
  const picked = ROUTES.find((r) => r.id === (dropTarget ?? hover));
  const hoveredRoutes = picked
    ? ROUTES.filter(
        (r) =>
          r.a === picked.a &&
          r.b === picked.b &&
          (game?.me
            ? routeAvailable(game as unknown as Game, game.me, r)
            : !game?.claimed[r.id]),
      )
    : [];
  // A claimed or fully blocked connection can still be inspected, but available
  // double lanes are always highlighted together, regardless of pointer side.
  const hoverIds = hoveredRoutes.length
    ? hoveredRoutes.map((r) => r.id)
    : hover
      ? [hover]
      : [];
  return (
    <div className={`atlas ${demo ? "atlas-preview" : ""}`}>
      <div className="map-viewport">
        <svg
          className="map-artwork map-terrain"
          viewBox="0 0 1400 900"
          aria-hidden="true"
        >
          <BoardTerrain id={id} view={view} />
        </svg>
        <svg
          className="map-artwork map-pieces"
          viewBox="0 0 1400 900"
          aria-hidden="true"
        >
          <BoardArtwork
            game={game}
            view={view}
            eligible={eligible}
            colorSeed={colorSeed}
          />
        </svg>
        <svg
          ref={svg}
          className="railway-map map-input-layer"
          viewBox="0 0 1400 900"
          aria-label="USA railway map"
          role="group"
          tabIndex={0}
          onKeyDown={(e) => {
            const route = routeFromTarget(e.target);
            if (route && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              if (!demo) onSelect(route);
              return;
            }
            if (e.target !== e.currentTarget) return;
            if (e.key === "+" || e.key === "=") zoom(1.3);
            if (e.key === "-") zoom(1 / 1.3);
            if (e.key === "0") setView({ x: 0, y: 0, z: 1 });
            if (e.key.startsWith("Arrow")) {
              e.preventDefault();
              setView((v) => ({
                ...v,
                x:
                  v.x +
                  (e.key === "ArrowLeft"
                    ? 60
                    : e.key === "ArrowRight"
                      ? -60
                      : 0),
                y:
                  v.y +
                  (e.key === "ArrowUp" ? 60 : e.key === "ArrowDown" ? -60 : 0),
              }));
            }
          }}
          onPointerDown={(e) => {
            pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
            moved.current = false;
          }}
          onPointerMove={(e) => {
            const old = pointers.current.get(e.pointerId);
            if (!old) return;
            const next: Point = [e.clientX, e.clientY];
            const others = [...pointers.current.entries()].filter(
              ([key]) => key !== e.pointerId,
            );
            const rect = e.currentTarget.getBoundingClientRect();
            const scale = Math.max(1400 / rect.width, 900 / rect.height);
            const dx = next[0] - old[0],
              dy = next[1] - old[1];
            if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
            if (others.length) {
              const other = others[0][1],
                before = Math.hypot(old[0] - other[0], old[1] - other[1]),
                after = Math.hypot(next[0] - other[0], next[1] - other[1]);
              if (before > 0) zoom(after / before);
            } else if (moved.current) {
              e.currentTarget.setPointerCapture(e.pointerId);
              setView((v) => ({
                ...v,
                x: Math.max(-1400, Math.min(1400, v.x + dx * scale)),
                y: Math.max(-900, Math.min(900, v.y + dy * scale)),
              }));
            }
            pointers.current.set(e.pointerId, next);
          }}
          onPointerUp={(e) => pointers.current.delete(e.pointerId)}
          onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
          onMouseOver={(e) => {
            if (!eligible && !demo) setHover(routeFromTarget(e.target)?.id);
          }}
          onMouseLeave={() => {
            if (!eligible) setHover(undefined);
          }}
          onFocus={(e) => {
            if (!eligible) setHover(routeFromTarget(e.target)?.id);
          }}
          onBlur={() => {
            if (!eligible) setHover(undefined);
          }}
          onClick={(e) => {
            if (!moved.current && !demo)
              onSelect(routeFromTarget(e.target) ?? null);
          }}
        >
          <g
            data-map-world="true"
            transform={`translate(${700 + view.x} ${450 + view.y}) scale(${view.z}) translate(-700 -450)`}
          >
            <BoardHitTargets
              game={game}
              selected={selected}
              eligible={eligible}
              colorSeed={colorSeed}
            />
          </g>
        </svg>
        <TicketHighlights
          game={game}
          view={view}
          previews={previews}
          focus={focus}
          completedTickets={completedTickets}
        />
        {game && (
          <RouteHighlights
            view={view}
            hoverIds={eligible ? [] : hoverIds}
            selected={selected}
            scoreRoutes={scoreRoutes}
          />
        )}
        {!demo && (
          <div
            className="map-interaction-layer map-tooltip-layer"
            aria-hidden="true"
          >
            <div className="map-hover" style={{ opacity: picked ? 0.95 : 0 }}>
              {picked ? `${picked.a} ↔ ${picked.b}` : ""}
              <b>
                {picked
                  ? parallelBlockReason(game, picked) ||
                    `${picked.length} trains`
                  : ""}
              </b>
            </div>
          </div>
        )}
      </div>
      {!demo && (
        <>
          <div className="map-controls">
            <div className="map-zoom">
              <button
                aria-label="Zoom out"
                onClick={() => zoom(1 / 1.3)}
                disabled={view.z === 1}
              >
                <Minus size={16} />
              </button>
              <span>{Math.round(view.z * 100)}%</span>
              <button
                aria-label="Zoom in"
                onClick={() => zoom(1.3)}
                disabled={view.z === 3.5}
              >
                <Plus size={16} />
              </button>
            </div>
            {controls}
            <button
              className="icon map-help"
              aria-label="Map controls help"
              aria-expanded={help}
              onClick={() => setHelp(!help)}
            >
              <Info size={16} />
            </button>
            {help && (
              <span className="map-help-text">
                Drag cards to a route · Drag map to pan · Pinch or scroll to
                zoom
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
