import { memo, useMemo } from "react";
import type { View } from "../game/engine";
import { tracks } from "../game/map-layout";
import { parallelBlockReason } from "../game/interactions";
import { playerDisplayColors } from "../game/player-colors";

// Input geometry is separate from painted artwork: browser hover invalidation
// should touch these inexpensive paths, never the coastline or train pieces.
export default memo(function BoardHitTargets({
  game,
  selected,
  eligible,
  colorSeed,
}: {
  game?: View | null;
  selected?: string;
  eligible?: string[];
  colorSeed: string;
}) {
  const colors = useMemo(
    () => playerDisplayColors(game, colorSeed),
    [game, colorSeed],
  );
  return (
    <>
      {tracks.map(({ route: r, path }) => {
        const owner = game?.players.find((p) => p.id === game.claimed[r.id]);
        const blocked = parallelBlockReason(game, r);
        const droppable = eligible?.includes(r.id);
        return (
          <g
            key={r.id}
            className={`map-route ${blocked ? "closed" : ""} ${droppable ? "drop-eligible" : ""}`}
            data-route={r.id}
            data-owner={owner?.id}
            data-owner-color={owner ? colors[owner.id] : undefined}
            data-droppable={droppable || undefined}
            role={game ? "button" : undefined}
            tabIndex={game ? 0 : undefined}
            aria-label={`${r.a} to ${r.b}, ${r.length} ${r.color}${owner ? `, claimed by ${owner.name}` : blocked ? `, ${blocked}` : ""}`}
            aria-pressed={game ? selected === r.id : undefined}
          >
            <title>{`${r.a} → ${r.b} · ${r.length} ${r.color}${owner ? ` · ${owner.name}` : blocked ? ` · ${blocked}` : ""}`}</title>
            <path d={path} fill="none" stroke="transparent" strokeWidth="24" />
          </g>
        );
      })}
    </>
  );
});
