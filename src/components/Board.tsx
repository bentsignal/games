import { useEffect, useId, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { PALETTE, PLAYER_COLORS, ROUTES, type Route } from "../game/data";
import type { View } from "../game/engine";
import geography from "../game/geography.json";

type Point = [number, number];
const cities = geography.cities as unknown as Record<string, Point>;
// Curves are authored per corridor; parallel lines share a curve with separate lanes.
const bends: Record<string, number> = {
  r0: -18,
  r3: -12,
  r4: 12,
  r7: -23,
  r8: 14,
  r9: 14,
  r10: -12,
  r11: -12,
  r12: 8,
  r13: 8,
  r14: -12,
  r15: -5,
  r16: 112,
  r17: -45,
  r19: -8,
  r20: 8,
  r22: -12,
  r23: 15,
  r26: -12,
  r27: -47,
  r28: -7,
  r29: 12,
  r30: -45,
  r31: -10,
  r32: -12,
  r33: 43,
  r34: 15,
  r37: 4,
  r51: 43,
  r52: 12,
  r53: -4,
  r55: -8,
  r56: 12,
  r58: 6,
  r59: 6,
  r60: -8,
  r61: 65,
  r62: -13,
  r63: -13,
  r64: -7,
  r65: 10,
  r68: 19,
  r73: -17,
  r74: -38,
  r75: -15,
  r76: -7,
  r77: 6,
  r80: 12,
  r81: -15,
  r82: 2,
  r84: -13,
  r85: 38,
  r89: 25,
  r90: -5,
  r93: 6,
  r94: 6,
  r97: -20,
};
const demoRoutes = [
  1, 4, 8, 9, 12, 14, 15, 16, 17, 20, 21, 22, 23, 24, 29, 31, 33, 34, 35, 37,
  38, 40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 66, 69, 71, 75, 78, 83, 85, 86,
  91, 95, 98,
];
function curve(route: Route) {
  const a = cities[route.a],
    b = cities[route.b];
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy),
    nx = -dy / len,
    ny = dx / len;
  const siblings = ROUTES.filter((r) => r.a === route.a && r.b === route.b);
  const lane = (siblings.indexOf(route) - (siblings.length - 1) / 2) * 13;
  const bend = bends[route.id] || 0;
  const from: Point = [a[0] + nx * lane, a[1] + ny * lane],
    to: Point = [b[0] + nx * lane, b[1] + ny * lane];
  const control: Point = [
    (a[0] + b[0]) / 2 + nx * bend * 2,
    (a[1] + b[1]) / 2 + ny * bend * 2,
  ];
  const at = (t: number): Point => [
    (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t * t * to[0],
    (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t * t * to[1],
  ];
  // Even distances along the curve, including on the long coastal routes.
  const samples = Array.from({ length: 101 }, (_, i) => at(i / 100));
  const distances = [0];
  for (let i = 1; i < samples.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          samples[i][0] - samples[i - 1][0],
          samples[i][1] - samples[i - 1][1],
        ),
    );
  const total = distances[100],
    usable = total - 28,
    slot = Math.min(33, (usable - (route.length - 1) * 5) / route.length);
  const pointAt = (distance: number) => {
    let i = 1;
    while (i < 100 && distances[i] < distance) i++;
    return (
      (i -
        1 +
        (distance - distances[i - 1]) / (distances[i] - distances[i - 1])) /
      100
    );
  };
  const cars = Array.from({ length: route.length }, (_, i) => {
    const t = pointAt(14 + (usable * (i + 0.5)) / route.length),
      p = at(t),
      before = at(t - 0.001),
      after = at(t + 0.001);
    return {
      x: p[0],
      y: p[1],
      angle:
        (Math.atan2(after[1] - before[1], after[0] - before[0]) * 180) /
        Math.PI,
      width: slot,
    };
  });
  return { path: `M${from} Q${control} ${to}`, cars };
}
const tracks = ROUTES.map((route) => ({ route, ...curve(route) }));
// Label offsets keep station names off their outgoing rails.
const labels: Record<string, [number, number, "start" | "middle" | "end"]> = {
  Vancouver: [-13, -13, "end"],
  Seattle: [-17, 4, "end"],
  Portland: [-16, 5, "end"],
  "San Francisco": [-15, -15, "middle"],
  "Los Angeles": [-24, 20, "middle"],
  Calgary: [0, -18, "middle"],
  Winnipeg: [0, -20, "middle"],
  Helena: [0, -17, "middle"],
  "Salt Lake City": [-15, -17, "end"],
  "Las Vegas": [-10, -18, "end"],
  Phoenix: [0, 24, "middle"],
  "El Paso": [0, 28, "middle"],
  "Santa Fe": [-13, 4, "end"],
  Denver: [0, -20, "middle"],
  Duluth: [-10, -15, "end"],
  Omaha: [-14, 2, "end"],
  "Kansas City": [0, 25, "middle"],
  "Oklahoma City": [-16, -12, "end"],
  Dallas: [-18, 4, "end"],
  Houston: [-6, 28, "middle"],
  "Little Rock": [6, 27, "middle"],
  "New Orleans": [0, 28, "middle"],
  Chicago: [-10, -16, "end"],
  "Saint Louis": [0, 27, "middle"],
  "Sault St. Marie": [0, -19, "middle"],
  Toronto: [-20, -9, "end"],
  Montreal: [0, -20, "middle"],
  Boston: [18, -8, "start"],
  "New York": [17, 4, "start"],
  Pittsburgh: [0, -19, "middle"],
  Washington: [18, 6, "start"],
  Raleigh: [18, -6, "start"],
  Nashville: [-18, 0, "end"],
  Atlanta: [-14, 24, "end"],
  Charleston: [18, 7, "start"],
  Miami: [20, 8, "start"],
};
export default function Board({
  game,
  selected,
  onSelect,
  focus = [],
  reset = 0,
  top = false,
}: {
  game?: View | null;
  selected?: string;
  onSelect: (route: Route | null) => void;
  focus?: string[];
  reset?: number;
  top?: boolean;
}) {
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
  const demo = !game;
  const picked = ROUTES.find((r) => r.id === hover);
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
          <clipPath id={`${id}bounds`}>
            <rect width="1400" height="900" rx="4" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}bounds)`}>
          <rect width="1400" height="900" fill={`url(#${id}ocean)`} />
          <g
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
              <text x="575" y="800" className="country-name">
                M É X I C O
              </text>
              <text
                x="91"
                y="519"
                transform="rotate(-74 91 519)"
                className="ocean-name"
              >
                PACIFIC OCEAN
              </text>
              <text
                x="1275"
                y="485"
                transform="rotate(-63 1275 485)"
                className="ocean-name"
              >
                ATLANTIC OCEAN
              </text>
              <text x="920" y="785" className="ocean-name gulf">
                Gulf of Mexico
              </text>
            </g>
            {tracks.map(({ route: r, path, cars }) => {
              const owner = game?.players.find(
                (p) => p.id === game.claimed[r.id],
              );
              const demoIndex = demoRoutes.indexOf(Number(r.id.slice(1)));
              const occupied = !!owner || (demo && demoIndex >= 0);
              const color = owner
                ? PLAYER_COLORS[owner.color]
                : occupied
                  ? PLAYER_COLORS[Math.floor(demoIndex / 4) % 5]
                  : PALETTE[r.color];
              const highlighted = selected === r.id || hover === r.id;
              return (
                <g
                  key={r.id}
                  className={`map-route ${occupied ? "claimed" : ""} ${highlighted ? "highlighted" : ""}`}
                  data-route={r.id}
                  data-owner={owner?.id}
                  role={demo ? undefined : "button"}
                  tabIndex={demo ? undefined : 0}
                  aria-label={`${r.a} to ${r.b}, ${r.length} ${r.color}${owner ? `, claimed by ${owner.name}` : ""}`}
                  aria-pressed={demo ? undefined : selected === r.id}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(undefined)}
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
                    {r.a} → {r.b} · {r.length} {r.color}
                    {owner ? ` · ${owner.name}` : ""}
                  </title>
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="23"
                  />
                  {highlighted && (
                    <path
                      className="route-halo"
                      d={path}
                      fill="none"
                      stroke="#fffae3"
                      strokeWidth="23"
                      strokeLinecap="round"
                      opacity=".85"
                    />
                  )}
                  {cars.map((c, i) => (
                    <g
                      key={i}
                      transform={`translate(${c.x} ${c.y}) rotate(${c.angle})`}
                      pointerEvents="none"
                    >
                      {occupied ? (
                        <>
                          <rect
                            x={-c.width / 2 - 1}
                            y="-6.5"
                            width={c.width + 2}
                            height="13"
                            rx="3"
                            fill={color}
                            stroke="#372820"
                            strokeWidth="3.5"
                          />
                          <rect
                            x={-c.width / 2}
                            y="-6"
                            width={c.width}
                            height="12"
                            rx="2.5"
                            fill={color}
                            stroke="#fff1ce"
                            strokeWidth="1.4"
                          />
                          <path
                            d={`M${-c.width / 2 + 3} -3H${c.width / 2 - 3}`}
                            stroke="white"
                            strokeWidth="2"
                            opacity=".6"
                          />
                          <path
                            d={`M${-c.width / 2 + 4} 7v2m${c.width - 8} -2v2`}
                            stroke="#372820"
                            strokeWidth="2.8"
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
                        </>
                      )}
                    </g>
                  ))}
                  {owner && (
                    <g
                      transform={`translate(${cars[Math.floor(cars.length / 2)].x} ${cars[Math.floor(cars.length / 2)].y})`}
                      pointerEvents="none"
                    >
                      <circle
                        r="7"
                        fill="#fff4d2"
                        stroke="#49341e"
                        strokeWidth="1"
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="9"
                        fontWeight="900"
                        fill="#392719"
                      >
                        {owner.color + 1}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            <g className="stations" pointerEvents="none">
              {Object.entries(cities).map(([name, [x, y]]) => {
                const lit = focus.includes(name),
                  [dx, dy, anchor] = labels[name] || [0, -17, "middle"];
                return (
                  <g key={name} transform={`translate(${x} ${y})`}>
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
                      r="7.5"
                      fill="#64432b"
                      stroke="#fff8dc"
                      strokeWidth="2"
                    />
                    <circle r="3.5" fill={lit ? "#ffd960" : "#f9dfa5"} />
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
            <g
              transform="translate(1278 700)"
              pointerEvents="none"
              fill="none"
              stroke="#53757a"
              opacity=".75"
            >
              <circle r="32" />
              <circle r="26" strokeDasharray="1 5" />
              <path d="M0-40 7-7 40 0 7 7 0 40-7 7-40 0-7-7Z" />
              <path d="M0-32V32M-32 0H32" />
              <text
                y="-46"
                fill="#53757a"
                stroke="none"
                textAnchor="middle"
                fontSize="13"
                fontFamily="serif"
              >
                N
              </text>
            </g>
          </g>
          <rect
            x="8"
            y="8"
            width="1384"
            height="884"
            rx="2"
            fill="none"
            stroke="#766548"
            strokeWidth="2"
            pointerEvents="none"
          />
          <rect
            x="13"
            y="13"
            width="1374"
            height="874"
            fill="none"
            stroke="#f5dfad"
            strokeWidth="1"
            pointerEvents="none"
          />
        </g>
      </svg>
      {!demo && (
        <>
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
          <div className="map-legend">
            <span className="legend-slot" /> Open{" "}
            <span className="legend-train" /> Claimed{" "}
            <span className="legend-owner">1</span> Player
          </div>
          {picked && (
            <div className="map-hover">
              {picked.a} ↔ {picked.b} <b>{picked.length} trains</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}
