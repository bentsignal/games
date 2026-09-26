import RouteHighlights from "./RouteHighlights";
import BoardArtwork from "./BoardArtwork";
import BoardTerrain from "./BoardTerrain";
import BoardHitTargets from "./BoardHitTargets";
import TicketHighlights from "./TicketHighlights";
import { diagnosticCount } from "../game/diagnostics";
import { useId, useRef, useState } from "react";
import { ROUTES, type Route } from "../game/data";
import { routeAvailable, type Game, type View } from "../game/engine";
import { parallelBlockReason, type TicketPreview } from "../game/interactions";
export default function Board({
  game,
  selected,
  onSelect,
  focus = [],
  eligible,
  dropTarget,
  previews = [],
  colorSeed = "",
  completedTickets = [],
  scoreRoutes = [],
}: {
  game?: View | null;
  selected?: string;
  onSelect: (route: Route | null) => void;
  focus?: string[];
  eligible?: string[];
  dropTarget?: string;
  previews?: TicketPreview[];
  colorSeed?: string;
  completedTickets?: string[];
  scoreRoutes?: string[];
}) {
  diagnosticCount("board-renders");
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<string>();
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
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
          <BoardTerrain id={id} />
        </svg>
        <svg
          className="map-artwork map-pieces"
          viewBox="0 0 1400 900"
          aria-hidden="true"
        >
          <BoardArtwork game={game} eligible={eligible} colorSeed={colorSeed} />
        </svg>
        <TicketHighlights
          game={game}
          previews={previews}
          focus={focus}
          completedTickets={completedTickets}
        />
        {game && (
          <RouteHighlights
            hoverIds={eligible ? [] : hoverIds}
            selected={selected}
            scoreRoutes={scoreRoutes}
          />
        )}
        <svg
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
          }}
          onPointerDown={(e) => {
            pointerStart.current = { x: e.clientX, y: e.clientY };
            moved.current = false;
          }}
          onPointerMove={(e) => {
            const start = pointerStart.current;
            if (
              start &&
              Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5
            )
              moved.current = true;
          }}
          onPointerUp={() => {
            pointerStart.current = null;
          }}
          onPointerCancel={() => {
            pointerStart.current = null;
            moved.current = true;
          }}
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
          <g data-map-world="true">
            <BoardHitTargets
              game={game}
              selected={selected}
              eligible={eligible}
              colorSeed={colorSeed}
            />
          </g>
        </svg>
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
    </div>
  );
}
