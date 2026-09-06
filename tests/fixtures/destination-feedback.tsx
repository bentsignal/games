import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Board from "../../src/components/Board";
import DestinationFeedback, {
  useDestinationFeedback,
} from "../../src/components/DestinationFeedback";
import { newGame, newPlayer, playerView } from "../../src/game/engine";
import "@fontsource/bree-serif";
import "@fontsource/rye";
import "../../src/styles.css";
import "../../src/classic.css";

function Fixture() {
  const [game, setGame] = useState(() => {
    const g = newGame("mega", newPlayer("a", "Alice", 0));
    g.players.push(newPlayer("b", "Bob", 1));
    g.players[0].tickets = ["t62", "t59"];
    g.phase = "playing";
    g.claimed.r1 = "a";
    return g;
  });
  const [viewer, setViewer] = useState("a");
  const view = playerView(game, viewer);
  const completion = useDestinationFeedback(view, "FIXTURE");
  const claim = () =>
    setGame((g) => ({ ...g, claimed: { ...g.claimed, r5: "a" } }));
  return (
    <>
      <div style={{ display: "flex", gap: 20, padding: 12 }}>
        <button onClick={claim}>Complete Portland ticket</button>
        <button onClick={() => setGame((g) => structuredClone(g))}>
          Unrelated update
        </button>
        <button onClick={() => setViewer((v) => (v === "a" ? "b" : "a"))}>
          Switch viewer
        </button>
        <button
          onClick={() =>
            setGame((g) => ({
              ...g,
              claimed: { ...g.claimed, r4: "a", r21: "a" },
            }))
          }
        >
          Complete Denver ticket
        </button>
      </div>
      <div className="board-shell" style={{ height: 880 }}>
        <Board
          game={view}
          colorSeed="FIXTURE"
          completedTickets={completion?.tickets}
          onSelect={() => {}}
        />
        {completion && (
          <DestinationFeedback
            key={completion.id}
            tickets={completion.tickets}
          />
        )}
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
