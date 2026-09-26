import { memo, useMemo } from "react";
import { diagnosticCount } from "../game/diagnostics";
import { PALETTE, PLAYER_COLORS } from "../game/data";
import type { View } from "../game/engine";
import {
  parallelBlockReason,
  destinationCityStatus,
} from "../game/interactions";
import { cities, tracks } from "../game/map-layout";
import { labels } from "../game/map-labels";
import { playerDisplayColors } from "../game/player-colors";
const demoRoutes = [
  1, 4, 8, 9, 12, 14, 15, 16, 17, 20, 21, 22, 23, 24, 29, 31, 33, 34, 35, 37,
  38, 40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 66, 69, 71, 75, 78, 83, 85, 86,
  91, 95, 98,
];
const BoardArtwork = memo(function BoardArtwork({
  game,
  view,
  eligible,
  colorSeed,
}: {
  game?: View | null;
  view: { x: number; y: number; z: number };
  eligible?: string[];
  colorSeed: string;
}) {
  diagnosticCount("map-artwork-renders");
  const demo = !game;
  const destinationStatus = useMemo(() => destinationCityStatus(game), [game]);
  const playerColors = useMemo(
    () => playerDisplayColors(game, colorSeed),
    [game, colorSeed],
  );
  return (
    <>
      <g
        transform={`translate(${700 + view.x} ${450 + view.y}) scale(${view.z}) translate(-700 -450)`}
      >
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
            const droppable = eligible?.includes(r.id);
            const blocked = parallelBlockReason(game, r);
            return (
              <g
                key={r.id}
                className={`map-route ${blocked ? "closed" : ""} ${occupied ? "claimed" : ""} ${eligible ? (droppable ? "drop-eligible" : "drop-unavailable") : ""}`}
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
                {droppable && (
                  <path
                    className="route-halo"
                    d={path}
                    fill="none"
                    stroke="#18a87d"
                    strokeWidth="24"
                    strokeLinecap="round"
                    opacity={0.22}
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
        <g className="stations" pointerEvents="none">
          {Object.entries(cities).map(([name, [x, y]]) => {
            const status = destinationStatus[name],
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
                {status && (
                  <circle
                    r="18"
                    fill={status === "incomplete" ? "#298cff38" : "#42c63738"}
                    stroke={status === "incomplete" ? "#238eff" : "#51bb32"}
                    strokeWidth="1.2"
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
                  className="station-label"
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
    </>
  );
});
export default BoardArtwork;
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
