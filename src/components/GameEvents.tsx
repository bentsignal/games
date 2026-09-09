import { useEffect, useRef, useState } from "react";
import WinnerConfetti from "./WinnerConfetti";
import { cue, preloadCrowdAudio, stopCrowdAudio } from "../audio";
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
    if (game?.phase !== "finished" || !game.me) return;
    const best = rankResults(game.results)[0];
    const mine = game.results.find((r) => r.id === game.me!.id);
    if (best && mine)
      preloadCrowdAudio(sameRank(best, mine) ? "applause" : "boo");
  }, [scope, game?.phase, game?.me?.id]);
  useEffect(() => {
    if (!revealDone) setConfetti(false);
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
    const timer = setTimeout(() => setConfetti(false), 6500);
    return () => {
      clearTimeout(timer);
      stopCrowdAudio();
    };
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
      {confetti && <WinnerConfetti />}
    </>
  );
}
