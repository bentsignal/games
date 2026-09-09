import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import TurnPanel from "../../src/components/TurnPanel";
import { endingPreview } from "../../src/game/ending-preview";
import { playerView } from "../../src/game/engine";
import { setEffects, unlockAudio } from "../../src/audio";
function Fixture() {
  const [state, setState] = useState({
    mine: false,
    deadline: Date.now() + 60000,
    serverNow: Date.now(),
  });
  const game = playerView(endingPreview("host", "Host", "sound"), "host");
  game.turnDeadline = state.deadline;
  game.turnSeconds = 30;
  return (
    <>
      <button
        onClick={() => {
          void unlockAudio();
          setState({
            mine: true,
            deadline: Date.now() + 11500,
            serverNow: Date.now(),
          });
        }}
      >
        My turn
      </button>
      <button onClick={() => setState((s) => ({ ...s, mine: false }))}>
        Other turn
      </button>
      <button onClick={() => setEffects(false)}>Mute</button>
      <button
        onClick={() => setState((s) => ({ ...s, serverNow: Date.now() }))}
      >
        Update
      </button>
      <TurnPanel game={game} mine={state.mine} serverNow={state.serverNow} />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
