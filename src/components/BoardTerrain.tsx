import { memo } from "react";
import geography from "../game/geography.json";
import type { MapView } from "./MapLayer";
import { diagnosticCount } from "../game/diagnostics";
export default memo(function BoardTerrain({
  id,
  view,
}: {
  id: string;
  view: MapView;
}) {
  diagnosticCount("map-artwork-renders");
  return (
    <>
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
        </g>
      </g>
    </>
  );
});
