import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import GameEvents from "../../src/components/GameEvents";
import Board from "../../src/components/Board";
import TrainCard from "../../src/components/TrainCard";
import {
  newGame,
  newPlayer,
  playerView,
  type Result,
} from "../../src/game/engine";
import { ROUTES } from "../../src/game/data";
import { unlockAudio } from "../../src/audio";
import "../../src/styles.css";
import "../../src/classic.css";
function Fixture() {
  const [game, setGame] = useState(() => {
    const g = newGame("mega", newPlayer("a", "Alice", 0));
    g.players.push(newPlayer("b", "Bob", 1));
    g.phase = "playing";
    const r = ROUTES.find(
      (r) =>
        r.color === "orange" &&
        ROUTES.some(
          (other) =>
            other.a === r.a &&
            other.b === r.b &&
            other.color !== r.color &&
            other.color !== "gray",
        ),
    )!;
    const other = ROUTES.find(
      (other) =>
        other.a === r.a &&
        other.b === r.b &&
        other.color !== r.color &&
        other.color !== "gray",
    )!;
    g.claimed[other.id] = "a";
    return g;
  });
  const [done, setDone] = useState(false);
  const finish = (win: boolean) => {
    void unlockAudio();
    setGame((g) => ({
      ...g,
      phase: "finished",
      results: g.players.map(
        (p) =>
          ({
            id: p.id,
            total: (p.id === "a") === win ? 80 : 40,
            completed: 2,
            longestBonus: 0,
          }) as Result,
      ),
    }));
    setDone(true);
  };
  return (
    <>
      <button
        onClick={() => {
          void unlockAudio();
          setGame((g) => ({ ...g, finalTurns: 2 }));
        }}
      >
        Final round
      </button>
      <button onClick={() => finish(true)}>Win</button>
      <button onClick={() => finish(false)}>Lose</button>
      <TrainCard color="wild" />
      <div className="board-shell" style={{ height: 600 }}>
        <Board game={playerView(game, "a")} onSelect={() => {}} />
        <GameEvents
          game={playerView(game, "a")}
          room="EVENTS"
          revealDone={done}
        />
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Fixture />
  </React.StrictMode>,
);
