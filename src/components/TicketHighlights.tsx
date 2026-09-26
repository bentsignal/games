import { useMemo } from "react";
import { TICKET_BY_ID } from "../game/data";
import type { View } from "../game/engine";
import {
  ticketPath,
  TICKET_INKS,
  type TicketPreview,
} from "../game/interactions";
import { cities, tracks } from "../game/map-layout";
import { labels } from "../game/map-labels";
import MapLayer, { type MapView } from "./MapLayer";

function TicketHighlight({
  game,
  ticket,
  preview,
  index,
}: {
  game?: View | null;
  ticket: TicketPreview["ticket"];
  preview?: TicketPreview;
  index: number;
}) {
  const geometry = useMemo(() => {
    const routes = ticketPath(game, ticket).map((id) =>
      tracks.find((t) => t.route.id === id)!,
    );
    const points = [
      ...routes.flatMap((t) => t.samples),
      cities[ticket.a],
      cities[ticket.b],
    ];
    const left = Math.min(...points.map((p) => p[0])) - 120;
    const top = Math.min(...points.map((p) => p[1])) - 120;
    const width = Math.max(...points.map((p) => p[0])) + 120 - left;
    const height = Math.max(...points.map((p) => p[1])) + 120 - top;
    return { routes, left, top, width, height };
  }, [game, ticket]);
  const { routes, left, top, width, height } = geometry;
  const color = preview?.color ?? TICKET_INKS[0];
  return (
    <div
      data-ticket-preview={preview ? ticket.id : undefined}
      data-hovered={preview?.hovered || undefined}
    >
      {[false, true].map((hovered) => (
        <svg
          key={String(hovered)}
          className="ticket-preview-surface"
          data-visible={
            (!!preview && !!preview.hovered === hovered) || undefined
          }
          viewBox={`${left} ${top} ${width} ${height}`}
          style={{ left, top, width, height }}
        >
          {routes.map(({ route, path }) => (
            <path
              key={route.id}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={hovered ? 22 : 18}
              strokeLinecap="round"
              opacity={hovered ? 0.6 : 0.34}
            />
          ))}
          {[ticket.a, ticket.b].map((name) => (
            <g key={name} transform={`translate(${cities[name]})`}>
              <circle
                r={hovered ? 22 : 16 + index * 3}
                fill="none"
                stroke={color}
                strokeWidth={hovered ? 4 : 2.5}
                opacity={hovered ? 1 : 0.85}
              />
              <circle
                cx="0"
                cy={-23 - index * 3}
                r="8"
                fill={color}
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
        </svg>
      ))}
    </div>
  );
}
export default function TicketHighlights({
  game,
  view,
  previews,
  focus,
  completedTickets,
}: {
  game?: View | null;
  view: MapView;
  previews: TicketPreview[];
  focus: string[];
  completedTickets: string[];
}) {
  const completedCities = [
    ...new Set(
      completedTickets.flatMap((id) => [
        TICKET_BY_ID[id].a,
        TICKET_BY_ID[id].b,
      ]),
    ),
  ];
  const candidates = [
    ...new Set([
      ...(game?.me?.tickets ?? []),
      ...(game?.me?.pending ?? []),
      ...previews.map((p) => p.ticket.id),
    ]),
  ];
  return (
    <>
      <MapLayer view={view} className="ticket-highlight-layer">
        {candidates.map((id) => {
          const index = previews.findIndex((p) => p.ticket.id === id);
          return (
            <TicketHighlight
              key={id}
              game={game}
              ticket={TICKET_BY_ID[id]}
              preview={previews[index]}
              index={Math.max(0, index)}
            />
          );
        })}
      </MapLayer>
      <MapLayer view={view} className="map-focus-layer">
        <svg className="ticket-highlight-content" viewBox="0 0 1400 900">
          {focus.map((name) => {
            const [dx, dy, anchor] = labels[name] || [0, -17, "middle"];
            return (
              <g key={name} transform={`translate(${cities[name]})`}>
                <circle
                  className="station-pulse"
                  r="18"
                  fill="#f8c34677"
                  stroke="#9f5d19"
                  strokeWidth="2"
                />
                <text
                  x={dx}
                  y={dy}
                  textAnchor={anchor}
                  className="station-label focused"
                >
                  {name}
                </text>
              </g>
            );
          })}
          {completedCities.map((name) => (
            <circle
              key={name + completedTickets.join("|")}
              transform={`translate(${cities[name]})`}
              className="destination-complete-ring"
              r="18"
              fill="none"
              stroke="#55c837"
              strokeWidth="3"
            />
          ))}
        </svg>
      </MapLayer>
    </>
  );
}
