import { diagnosticCount } from "../game/diagnostics";
import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { Minus, Plus, Info } from "lucide-react";
import { PALETTE, PLAYER_COLORS, ROUTES, type Route } from "../game/data";
import { routeAvailable, type Game, type View } from "../game/engine";
import geography from "../game/geography.json";
import {
  parallelBlockReason,
  destinationCityStatus,
  ticketPath,
  type TicketPreview,
} from "../game/interactions";

import { cities, tracks, type Point } from "../game/map-layout";
const demoRoutes = [
  1, 4, 8, 9, 12, 14, 15, 16, 17, 20, 21, 22, 23, 24, 29, 31, 33, 34, 35, 37,
  38, 40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 66, 69, 71, 75, 78, 83, 85, 86,
  91, 95, 98,
];
import { labels } from "../game/map-labels";
import { playerDisplayColors } from "../game/player-colors";
import { TICKET_BY_ID } from "../game/data";
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
  const previewPaths = useMemo(
    () => previews.map((p) => ({ ...p, routes: ticketPath(game, p.ticket) })),
    [previews, game],
  );
  const destinationStatus = useMemo(() => destinationCityStatus(game), [game]);
  const demo = !game;
  const playerColors = useMemo(
    () => playerDisplayColors(game, colorSeed),
    [game, colorSeed],
  );
  const completedCities = new Set(
    completedTickets.flatMap((id) => [TICKET_BY_ID[id].a, TICKET_BY_ID[id].b]),
  );
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
      <svg
        ref={svg}
        className="railway-map"
        viewBox="0 0 1400 900"
        aria-label="USA railway map"
        role="group"
        tabIndex={0}
        onKeyDown={(e) => {
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
                (e.key === "ArrowLeft" ? 60 : e.key === "ArrowRight" ? -60 : 0),
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
        onClick={() => {
          if (!moved.current) onSelect(null);
        }}
      >
        <defs>
          <linearGradient id={`${id}ocean`} x2="0" y2="1">
            <stop stopColor="#b2cbd0" />
            <stop offset="1" stopColor="#7fabb7" />
          </linearGradient>
          <radialGradient id={`${id}paper`}>
            <stop stopColor="#f7ebce" />
            <stop offset=".7" stopColor="#ecdbb5" />
            <stop offset="1" stopColor="#d9c49a" />
          </radialGradient>
          <pattern
            id={`${id}waves`}
            width="26"
            height="14"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 8Q6 3 13 8T26 8"
              stroke="#f5e7c8"
              strokeWidth=".65"
              opacity=".3"
              fill="none"
            />
          </pattern>
          <pattern
            id={`${id}grain`}
            width="7"
            height="9"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".5" fill="#785b32" opacity=".16" />
            <circle cx="5" cy="6" r=".45" fill="#fff9e7" opacity=".7" />
          </pattern>
          <clipPath id={`${id}land`}>
            {geography.land.map((l) => (
              <path key={l.name} d={l.path} />
            ))}
          </clipPath>
        </defs>
        <g>
          <rect
            x="-4000"
            y="-4000"
            width="9000"
            height="9000"
            fill={`url(#${id}ocean)`}
          />
          <g
            data-map-world="true"
            transform={`translate(${700 + view.x} ${450 + view.y}) scale(${view.z}) translate(-700 -450)`}
          >
            <rect
              x="-4000"
              y="-4000"
              width="9000"
              height="9000"
              fill={`url(#${id}waves)`}
            />
            <g className="atlas-geography">
              {geography.land.map((l) => (
                <path
                  key={l.name}
                  d={l.path}
                  fill={`url(#${id}paper)`}
                  stroke="#f7ecd1"
                  strokeWidth="10"
                  strokeLinejoin="round"
                />
              ))}
              {geography.land.map((l) => (
                <path
                  key={l.name}
                  d={l.path}
                  fill="none"
                  stroke="#927b57"
                  strokeWidth="1.6"
                />
              ))}
              <g clipPath={`url(#${id}land)`}>
                {geography.borders.map((path, i) => (
                  <path
                    key={i}
                    d={path}
                    fill="none"
                    stroke="#b8a47b"
                    strokeWidth="1"
                    opacity=".65"
                  />
                ))}
                {/* Quiet, engraved relief. Clipped to land, underneath every railway. */}
                {Array.from({ length: 65 }, (_, i) => {
                  const x =
                      310 + (i % 5) * 19 + Math.sin(i * 4) * 12 + (i / 5) * 4,
                    y = 180 + Math.floor(i / 5) * 36;
                  return (
                    <path
                      key={i}
                      d={`M${x - 13} ${y + 17}l13 -25 17 25m-17 -25 1 13 7 12m-8 -12 -7 10`}
                      fill="none"
                      stroke="#8e8b64"
                      strokeWidth="1.4"
                      opacity=".22"
                    />
                  );
                })}
                <rect width="1400" height="900" fill={`url(#${id}grain)`} />
              </g>
              {geography.water.map((path, i) => (
                <path
                  key={i}
                  d={path}
                  fill="#a8c6ca"
                  stroke="#819f9e"
                  strokeWidth=".9"
                />
              ))}
            </g>
            <g className="map-lettering" pointerEvents="none">
              <text x="650" y="95" className="country-name">
                C A N A D A
              </text>
              <text x="490" y="864" className="country-name">
                M É X I C O
              </text>
              <text
                x="22"
                y="440"
                transform="rotate(-87 22 440)"
                className="ocean-name"
              >
                PACIFIC OCEAN
              </text>
              <text
                x="1360"
                y="510"
                transform="rotate(-78 1360 510)"
                className="ocean-name"
              >
                ATLANTIC OCEAN
              </text>
              <text x="990" y="865" className="ocean-name gulf">
                Gulf of America
              </text>
            </g>
            <g className="ticket-paths" pointerEvents="none">
              {previewPaths.map((p) => (
                <g
                  key={p.ticket.id}
                  data-ticket-preview={p.ticket.id}
                  data-hovered={p.hovered || undefined}
                >
                  {p.routes.map((route) => (
                    <path
                      key={route}
                      d={tracks.find((t) => t.route.id === route)!.path}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={p.hovered ? 22 : 18}
                      strokeLinecap="round"
                      opacity={p.hovered ? 0.6 : 0.34}
                    />
                  ))}
                </g>
              ))}
            </g>
            {[...tracks]
              .sort(
                (a, b) =>
                  Number(!!game?.claimed[a.route.id]) -
                  Number(!!game?.claimed[b.route.id]),
              )
              .map(({ route: r, path, cars }) => {
                const owner = game?.players.find(
                  (p) => p.id === game.claimed[r.id],
                );
                const demoIndex = demoRoutes.indexOf(Number(r.id.slice(1)));
                const occupied = !!owner || (demo && demoIndex >= 0);
                const color = owner
                  ? playerColors[owner.id]
                  : occupied
                    ? PLAYER_COLORS[Math.floor(demoIndex / 4) % 5]
                    : PALETTE[r.color];
                const highlighted =
                  scoreRoutes.includes(r.id) ||
                  selected === r.id ||
                  hoverIds.includes(r.id) ||
                  dropTarget === r.id;
                const droppable = eligible?.includes(r.id);
                const blocked = parallelBlockReason(game, r);
                return (
                  <g
                    key={r.id}
                    className={`map-route ${blocked ? "closed" : ""} ${occupied ? "claimed" : ""} ${highlighted ? "highlighted" : ""} ${eligible ? (droppable ? "drop-eligible" : "drop-unavailable") : ""} ${dropTarget === r.id ? "drop-target" : ""}`}
                    data-route={r.id}
                    data-owner={owner?.id}
                    data-owner-color={owner ? color : undefined}
                    data-droppable={droppable || undefined}
                    role={demo ? undefined : "button"}
                    tabIndex={demo ? undefined : 0}
                    aria-label={`${r.a} to ${r.b}, ${r.length} ${r.color}${owner ? `, claimed by ${owner.name}` : blocked ? `, ${blocked}` : ""}`}
                    aria-pressed={demo ? undefined : selected === r.id}
                    onMouseEnter={() => {
                      if (!eligible) setHover(r.id);
                    }}
                    onMouseLeave={() => {
                      if (!eligible) setHover(undefined);
                    }}
                    onFocus={() => setHover(r.id)}
                    onBlur={() => setHover(undefined)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(r);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!moved.current && !demo) onSelect(r);
                    }}
                  >
                    <title>
                      {`${r.a} → ${r.b} · ${r.length} ${r.color}${owner ? ` · ${owner.name}` : blocked ? ` · ${blocked}` : ""}`}
                    </title>
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="24"
                    />
                    {(highlighted || droppable) && (
                      <path
                        className="route-halo"
                        d={path}
                        fill="none"
                        stroke={droppable ? "#18a87d" : "#fffae3"}
                        strokeWidth="24"
                        strokeLinecap="round"
                        opacity={
                          dropTarget === r.id ? 0.75 : droppable ? 0.22 : 0.7
                        }
                      />
                    )}
                    <TrainPieces
                      cars={cars}
                      occupied={occupied}
                      color={color}
                      blocked={!!blocked}
                    />
                  </g>
                );
              })}
            <g className="ticket-endpoints" pointerEvents="none">
              {previewPaths.map((p, index) => (
                <g key={p.ticket.id}>
                  {[p.ticket.a, p.ticket.b].map((name) => (
                    <g key={name} transform={`translate(${cities[name]})`}>
                      <circle
                        r={p.hovered ? 22 : 16 + index * 3}
                        fill="none"
                        stroke={p.color}
                        strokeWidth={p.hovered ? 4 : 2.5}
                        opacity={p.hovered ? 1 : 0.85}
                      />
                      <circle
                        cx="0"
                        cy={-23 - index * 3}
                        r="8"
                        fill={p.color}
                        stroke="#fff7dc"
                        strokeWidth="1.2"
                      />
                      <text
                        y={-23 - index * 3}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#fff"
                        fontSize="10"
                        fontWeight="800"
                      >
                        {index + 1}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
            </g>
            <g className="stations" pointerEvents="none">
              {Object.entries(cities).map(([name, [x, y]]) => {
                const lit = focus.includes(name),
                  status = destinationStatus[name],
                  [dx, dy, anchor] = labels[name] || [0, -17, "middle"];
                return (
                  <g
                    key={name}
                    transform={`translate(${x} ${y})`}
                    data-city={name}
                    data-destination-status={status}
                  >
                    <title>
                      {status
                        ? `${name}: ${status === "incomplete" ? "unfinished destination ticket" : "all destination tickets complete"}`
                        : name}
                    </title>
                    {completedCities.has(name) && (
                      <circle
                        className="destination-complete-ring"
                        key={completedTickets.join("|")}
                        r="18"
                        fill="none"
                        stroke="#55c837"
                        strokeWidth="3"
                      />
                    )}
                    {status && (
                      <circle
                        r="18"
                        fill={
                          status === "incomplete" ? "#298cff38" : "#42c63738"
                        }
                        stroke={status === "incomplete" ? "#238eff" : "#51bb32"}
                        strokeWidth="1.2"
                      />
                    )}
                    {lit && (
                      <circle
                        className="station-pulse"
                        r="18"
                        fill="#f8c34677"
                        stroke="#9f5d19"
                        strokeWidth="2"
                      />
                    )}
                    <circle
                      r={status ? 11.5 : 8}
                      fill={
                        status === "incomplete"
                          ? "#0962d1"
                          : status === "complete"
                            ? "#239522"
                            : "#64432b"
                      }
                      stroke="#fff8dc"
                      strokeWidth="2"
                    />
                    <circle
                      r={status ? 6.5 : 4}
                      fill={
                        status === "incomplete"
                          ? "#69cbff"
                          : status === "complete"
                            ? "#9bed4c"
                            : lit
                              ? "#ffd960"
                              : "#f9dfa5"
                      }
                    />
                    {status && (
                      <path
                        d="M-4-4Q0-7 4-4"
                        fill="none"
                        stroke="#fff"
                        opacity=".85"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                    )}
                    <text
                      x={dx}
                      y={dy}
                      textAnchor={anchor}
                      className={`station-label ${lit ? "focused" : ""}`}
                    >
                      {name}
                    </text>
                  </g>
                );
              })}
            </g>
            <g
              transform="translate(92 762)"
              className="map-cartouche"
              pointerEvents="none"
            >
              <path d="M-46 25H46M-35 30H35" stroke="#645038" strokeWidth="1" />
              <text
                textAnchor="middle"
                y="0"
                fontSize="41"
                fontFamily="Rye,serif"
                fill="#544332"
              >
                USA
              </text>
              <text
                textAnchor="middle"
                y="18"
                fontSize="9"
                letterSpacing="3"
                fill="#645038"
              >
                RAILWAYS · 1910
              </text>
            </g>
          </g>
        </g>
      </svg>
      <svg
        className="drag-highlight-layer"
        viewBox="0 0 1400 900"
        aria-hidden="true"
      >
        <g
          transform={`translate(${700 + view.x} ${450 + view.y}) scale(${view.z}) translate(-700 -450)`}
        >
          <path
            data-drag-highlight="true"
            fill="none"
            stroke="#18a87d"
            strokeWidth="24"
            strokeLinecap="round"
            opacity=".65"
          />
        </g>
      </svg>
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
          {picked && (
            <div className="map-hover">
              {picked.a} ↔ {picked.b}{" "}
              <b>
                {parallelBlockReason(game, picked) || `${picked.length} trains`}
              </b>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TrainPieces = memo(function TrainPieces({
  cars,
  occupied,
  color,
  blocked,
}: {
  cars: (typeof tracks)[number]["cars"];
  occupied: boolean;
  color: string;
  blocked: boolean;
}) {
  return (
    <g>
      {cars.map((c, i) => (
        <g
          key={i}
          transform={`translate(${c.x} ${c.y}) rotate(${c.angle})`}
          pointerEvents="none"
        >
          {occupied ? (
            <>
              <rect
                x={-c.width / 2}
                y="-8.5"
                width={c.width}
                height="17"
                rx="3"
                fill="#2b2429"
                opacity=".35"
                transform="translate(1 1)"
              />
              <path
                d={`M${-c.width / 2 + 4} 6v4m${c.width - 8} -4v4`}
                stroke="#30262a"
                strokeWidth="3"
              />
              <rect
                x={-c.width / 2}
                y="-8.5"
                width={c.width}
                height="17"
                rx="3"
                fill={color}
                stroke="#32232a"
                strokeWidth="1.7"
              />
              <path
                d={`M${-c.width / 2 + 2} -5.5H${c.width / 2 - 2}`}
                stroke="#fff"
                strokeWidth="1.6"
                opacity=".48"
              />
              <path
                d={`M${-c.width / 2 + 2} 5.5H${c.width / 2 - 2}`}
                stroke="#241626"
                strokeWidth="2"
                opacity=".26"
              />
              <path
                d={`M${-c.width / 2 + 5} -3.5V3.5M${c.width / 2 - 5} -3.5V3.5`}
                stroke="#281727"
                opacity=".16"
              />
            </>
          ) : (
            <>
              <rect
                x={-c.width / 2}
                y="-4.5"
                width={c.width}
                height="9"
                rx="1.5"
                fill={color}
                stroke="#675c4e"
                strokeWidth="1.2"
              />
              <rect
                x={-c.width / 2 + 2}
                y="-2.5"
                width={Math.max(1, c.width - 4)}
                height="5"
                rx=".5"
                fill="none"
                stroke="#fff9e1"
                strokeWidth=".7"
                opacity=".65"
              />
              {blocked && (
                <path
                  className="closed-mark"
                  d="M-3-3 3 3M-3 3 3-3"
                  fill="none"
                  strokeWidth="1.5"
                />
              )}
            </>
          )}
        </g>
      ))}
    </g>
  );
});
