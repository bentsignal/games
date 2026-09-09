import { useEffect, useState } from "react";
import { preloadTicking, startTicking, stopTicking } from "../audio";
import type { View } from "../game/engine";

export default function TurnPanel({
  game,
  mine,
  serverNow,
}: {
  game: View;
  mine: boolean;
  serverNow: number;
}) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const start = performance.now();
    setNow(serverNow);
    if (!game.turnDeadline) return;
    const timer = setInterval(
      () => setNow(serverNow + performance.now() - start),
      200,
    );
    return () => clearInterval(timer);
  }, [serverNow, game.turnDeadline]);
  const seconds = Math.max(
    0,
    Math.ceil(((game.turnDeadline ?? now) - now) / 1000),
  );
  const ownTimedTurn =
    mine && !game.me?.bot && game.phase === "playing" && !!game.turnDeadline;
  const urgent = ownTimedTurn && seconds > 0 && seconds <= 10;
  useEffect(() => {
    if (ownTimedTurn) preloadTicking();
  }, [ownTimedTurn, game.turnDeadline]);
  useEffect(() => {
    if (urgent) void startTicking(game.turnDeadline! - now);
    return stopTicking;
  }, [urgent, game.turnDeadline]);
  return (
    <div className={`turn-banner ${mine ? "your-turn" : ""}`}>
      <span className="turn-light" />
      <div className="turn-copy">
        <strong>
          {game.phase === "setup"
            ? "Choose tickets"
            : mine
              ? "Your turn"
              : `${game.players[game.turn]?.name}’s turn`}
        </strong>
        <small>
          {game.phase === "setup"
            ? "Everyone is choosing starting tickets."
            : mine
              ? game.me?.pending.length
                ? "Choose your destination tickets."
                : game.drawn
                  ? "Choose one more train card."
                  : "Draw cards, claim a route, or take tickets."
              : ""}
        </small>
      </div>
      {game.phase === "playing" && game.turnDeadline && (
        <span
          className={`turn-countdown ${seconds <= 10 ? "urgent" : ""}`}
          role="timer"
          aria-label="Time remaining"
          title="Time remaining"
        >
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}
