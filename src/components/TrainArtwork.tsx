import type { Color } from "../game/data";
// Original railway engravings. Different car bodies make colors recognizable by shape.
export function TrainArtwork({ color }: { color: Color | "back" }) {
  const loco = color === "wild" || color === "back";
  return (
    <svg className="train-artwork" viewBox="0 0 180 95" aria-hidden="true">
      <path d="M2 80H178M9 85H175" stroke="currentColor" opacity=".5" />
      <g stroke="#382c28" strokeWidth="2" strokeLinejoin="round">
        {loco ? (
          <>
            <path d="M28 63H144V69H23Z" fill="#392d2b" />
            <path d="M44 35H111V60H42Z" fill="#ead9a6" />
            <path d="M47 36Q32 48 47 60H61V36Z" fill="#9b7042" />
            <path d="M47 37V19H60V37M43 19H65L62 13H46Z" fill="#40352e" />
            <path d="M76 36V27Q83 19 90 27V36" fill="#bc944e" />
            <path d="M108 27H145V63H108Z" fill="#a94331" />
            <path d="M104 27V20H148L153 27Z" fill="#463431" />
            <path d="M116 31H138V47H116Z" fill="#a9d3d3" />
            <path d="M126 31V47" fill="none" />
            <path d="M38 60L20 75H44Z" fill="#655341" />
            <path d="M151 48H170V66H151Z" fill="#977149" />
            <path d="M148 48L152 43H172V48Z" fill="#40332f" />
          </>
        ) : color === "orange" ? (
          <>
            <rect
              x="21"
              y="39"
              width="141"
              height="28"
              rx="14"
              fill="currentColor"
            />
            <path d="M84 39V32H100V39M31 65H153" fill="#e5d09a" />
            <path d="M47 42V63M134 42V63" stroke="#fff0c8" opacity=".7" />
          </>
        ) : color === "black" ? (
          <>
            <path d="M22 42H163L151 66H35Z" fill="currentColor" />
            <path
              d="M27 42L41 34 53 37 65 28 78 34 95 27 111 34 129 30 148 36 159 42Z"
              fill="#342c2a"
            />
            <path
              d="M49 46L53 62M79 46V62M109 46V62M139 46L135 62"
              stroke="#e4cb9c"
            />
          </>
        ) : color === "yellow" ? (
          <>
            <path d="M22 61H163V67H22Z" fill="currentColor" />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <path d={`M${33 + i * 39} 59V30h28v29Z`} fill="#bba16b" />
                <path d={`M${33 + i * 39} 36h28m-28 17h28`} stroke="#6a5439" />
              </g>
            ))}
          </>
        ) : (
          <>
            <path d="M21 34H164V67H21Z" fill="currentColor" />
            <path d="M17 34L24 27H159L168 34Z" fill="#4b3b31" />
            {color === "green" || color === "blue" || color === "white" ? (
              <>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <rect
                    key={i}
                    x={29 + i * 22}
                    y="40"
                    width="13"
                    height="12"
                    rx="2"
                    fill="#e6e8cd"
                  />
                ))}
                <path d="M25 59H160" stroke="#f8dea6" />
              </>
            ) : (
              <>
                <path d="M74 36H112V66H74Z" fill="#f1dba8" opacity=".3" />
                <path
                  d="M28 42H67M28 49H67M28 56H67M120 42H157M120 49H157M120 56H157M78 40L108 61M108 40L78 61"
                  stroke="#ffe8be"
                  opacity=".7"
                />
              </>
            )}
          </>
        )}
        {(loco ? [52, 77, 101, 132, 159] : [39, 57, 128, 146]).map((x, i) => (
          <g key={i}>
            <circle cx={x} cy="70" r={loco && i < 3 ? 10 : 7} fill="#332d2b" />
            <circle cx={x} cy="70" r={loco && i < 3 ? 6 : 4} fill="#ccb993" />
            <circle cx={x} cy="70" r="1.5" fill="#49392e" />
          </g>
        ))}
        {loco && <path d="M49 71L101 70" stroke="#e7d5b0" strokeWidth="3" />}
      </g>
    </svg>
  );
}
export function ConductorPortrait({ index }: { index: number }) {
  const coats = ["#a93c31", "#28669f", "#bd8b25", "#3c824c", "#7546ac"];
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="conductor-portrait">
      <circle cx="32" cy="32" r="31" fill="#e5c785" />
      <path
        d="M7 64Q9 42 32 42T57 64"
        fill={coats[index % 5]}
        stroke="#4c3028"
        strokeWidth="2"
      />
      <path d="M25 41L32 62 39 41" fill="#fff0cc" />
      <path d="M29 46H35L34 56H30Z" fill="#4b352b" />
      <ellipse
        cx="32"
        cy="30"
        rx="13"
        ry="16"
        fill={index % 2 ? "#b97c50" : "#e3ad78"}
        stroke="#583a2d"
        strokeWidth="1.5"
      />
      <path
        d="M19 25L21 14Q32 8 43 14L45 25Z"
        fill={coats[index % 5]}
        stroke="#493126"
        strokeWidth="2"
      />
      <path
        d="M17 24Q32 20 47 24L44 29Q32 25 20 29Z"
        fill="#49392c"
        stroke="#deb85e"
        strokeWidth="1.5"
      />
      <path
        d="M25 31H28M36 31H39"
        stroke="#48312b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M32 31L30 37H33" fill="none" stroke="#8f5b40" />
      <path
        d={
          index % 2
            ? "M26 40Q32 45 38 40"
            : "M24 40Q28 34 32 39Q36 34 40 40L32 42Z"
        }
        fill={index % 2 ? "none" : "#5e3929"}
        stroke="#5e3929"
        strokeWidth="1.5"
      />
      <circle cx="32" cy="19" r="3" fill="#f5d67f" />
      <path d="M16 52L23 56M42 56L49 52" stroke="#f2ce70" strokeWidth="3" />
    </svg>
  );
}
