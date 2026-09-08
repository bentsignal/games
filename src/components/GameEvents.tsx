import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cue } from "../audio";
import type { View } from "../game/engine";
import { rankResults, sameRank } from "../game/score-reveal";

export default function GameEvents({
  game,
  room,
  revealDone,
}: {
  game: View | null | undefined;
  room: string;
  revealDone: boolean;
}) {
  const [finalRound, setFinalRound] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const scope = game ? `${room}:${game.roundId ?? "round"}` : "";
  const announced = useRef("");
  const priorReveal = useRef({ scope, done: revealDone });
  useEffect(() => {
    setFinalRound(false);
    if (!game || game.finalTurns === null || game.phase === "finished") return;
    const key = `ticket-final-round:${scope}`;
    if (sessionStorage.getItem(key) && announced.current !== key) return;
    const first = announced.current !== key;
    announced.current = key;
    sessionStorage.setItem(key, "shown");
    setFinalRound(true);
    if (first) cue("turn");
    const timer = setTimeout(() => setFinalRound(false), 2300);
    return () => clearTimeout(timer);
  }, [scope, game?.finalTurns !== null, game?.phase === "finished"]);
  useEffect(() => {
    const before = priorReveal.current;
    priorReveal.current = { scope, done: revealDone };
    if (
      !game ||
      !revealDone ||
      before.scope !== scope ||
      before.done ||
      !game.me
    )
      return;
    const best = rankResults(game.results)[0];
    const mine = game.results.find((r) => r.id === game.me!.id);
    const won = !!best && !!mine && sameRank(best, mine);
    cue(won ? "applause" : "boo");
    setConfetti(won);
    const timer = setTimeout(() => setConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, [scope, revealDone]);
  useEffect(() => {
    setConfetti(false);
  }, [scope]);
  return (
    <>
      {finalRound && (
        <div className="final-round-announcement" role="status">
          <div>
            <strong>Final round</strong>
            <p>Everyone gets one last turn.</p>
          </div>
        </div>
      )}
      {confetti &&
        createPortal(
          <div className="winner-confetti" aria-hidden="true">
            {Array.from({ length: 110 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    left: `${(i * 37) % 100}%`,
                    background: [
                      "#ffc629",
                      "#f24c50",
                      "#37bcec",
                      "#59da76",
                      "#d479ed",
                      "#fff3bd",
                    ][i % 6],
                    animationDelay: `${(i % 17) * 0.05}s`,
                    "--drift": `${((i * 43) % 280) - 140}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
