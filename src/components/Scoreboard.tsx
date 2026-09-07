import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward, Trophy } from "lucide-react";
import { MODES, TICKET_BY_ID } from "../game/data";
import { connected, type View } from "../game/engine";
import {
  countScores,
  rankResults,
  sameRank,
  scoreSteps,
  scoreSound,
} from "../game/score-reveal";
import { cue } from "../audio";

export function useScoreReveal(game: View | null | undefined, room: string) {
  const steps = useMemo(
    () => (game ? scoreSteps(game) : []),
    [game?.phase, game?.results, game?.revealed, game?.claimed],
  );
  const scope =
    game?.phase === "finished"
      ? `${room}:${game.roundId ?? game.turnNumber}`
      : "";
  const [frame, setFrame] = useState({ scope: "", index: 0, progress: 0 });
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  const cursor = useRef({ index: 0, elapsed: 0 });
  const previousScope = useRef("");
  const savedIndex = useMemo(() => {
    if (!scope) return 0;
    const saved = Number(
      sessionStorage.getItem(`ticket-reveal:v2:${scope}`) ?? 0,
    );
    return Number.isInteger(saved)
      ? Math.min(Math.max(0, saved), steps.length)
      : 0;
  }, [scope, steps.length]);
  useEffect(() => {
    if (!scope || !steps.length) return;
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      cursor.current = {
        index: savedIndex,
        elapsed: 0,
      };
    }
    const currentStep = steps[cursor.current.index];
    setFrame({
      scope,
      index: cursor.current.index,
      progress: currentStep
        ? Math.min(
            1,
            Math.max(
              0,
              (cursor.current.elapsed - 450) / (currentStep.duration - 850),
            ),
          )
        : 1,
    });
    if (paused || cursor.current.index >= steps.length) return;
    let last = performance.now(),
      sounded = -1,
      lastClick = 0;
    const timer = setInterval(() => {
      const now = performance.now(),
        c = cursor.current;
      // Hidden tabs pause the reveal so returning never skips the suspense.
      if (document.hidden) {
        last = now;
        return;
      }
      c.elapsed += now - last;
      last = now;
      const step = steps[c.index];
      if (!step) return;
      if (sounded !== c.index) {
        sounded = c.index;
        cue(scoreSound(step));
      }
      const progress = Math.min(
        1,
        Math.max(0, (c.elapsed - 450) / (step.duration - 850)),
      );
      if (step.delta && progress > 0 && progress < 1 && now - lastClick > 170) {
        cue("score-tick");
        lastClick = now;
      }
      setFrame({ scope, index: c.index, progress });
      if (c.elapsed >= step.duration) {
        c.index++;
        c.elapsed = 0;
        sessionStorage.setItem(`ticket-reveal:v2:${scope}`, String(c.index));
        setFrame({ scope, index: c.index, progress: 0 });
        if (c.index >= steps.length) {
          cue("finale");
          clearInterval(timer);
        }
      }
    }, 50);
    return () => clearInterval(timer);
  }, [scope, steps, paused, replay, savedIndex]);
  const index = frame.scope === scope ? frame.index : savedIndex;
  const done = !!scope && steps.length > 0 && index >= steps.length;
  const totals = countScores(steps, index, done ? 1 : frame.progress);
  return {
    steps,
    index,
    done,
    paused,
    totals,
    step: done ? undefined : steps[index],
    togglePause: () => setPaused((p) => !p),
    skip: () => {
      cursor.current = { index: steps.length, elapsed: 0 };
      sessionStorage.setItem(`ticket-reveal:v2:${scope}`, String(steps.length));
      setFrame({ scope, index: steps.length, progress: 1 });
      setReplay((r) => r + 1);
    },
    restart: () => {
      cursor.current = { index: 0, elapsed: 0 };
      sessionStorage.removeItem(`ticket-reveal:v2:${scope}`);
      setFrame({ scope, index: 0, progress: 0 });
      setPaused(false);
      setReplay((r) => r + 1);
    },
  };
}
export type ScoreReveal = ReturnType<typeof useScoreReveal>;

export default function Scoreboard({
  game,
  reveal,
  colors,
}: {
  game: View;
  reveal: ScoreReveal;
  colors: Record<string, string>;
}) {
  const rows = reveal.done
    ? rankResults(game.results)
    : game.players.map((p) => game.results.find((r) => r.id === p.id)!);
  let rank = 1;
  return (
    <div className="scoreboard" data-reveal-done={reveal.done}>
      <div className="scoreboard-toolbar">
        <h2>{reveal.done ? "Final scores" : "Counting scores"}</h2>
        {reveal.done ? (
          <button onClick={reveal.restart} aria-label="Replay scoring">
            <RotateCcw size={14} /> Replay
          </button>
        ) : (
          <>
            <button
              onClick={reveal.togglePause}
              aria-label={reveal.paused ? "Resume scoring" : "Pause scoring"}
            >
              {reveal.paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button onClick={reveal.skip} aria-label="Skip to final scores">
              <SkipForward size={14} />
            </button>
          </>
        )}
      </div>
      {!reveal.done && (
        <div className="score-progress">
          <span
            style={{ width: `${(reveal.index / reveal.steps.length) * 100}%` }}
          />
        </div>
      )}
      {rows.map((r, i) => {
        if (i && !sameRank(rows[i - 1], r)) rank = i + 1;
        const p = game.players.find((p) => p.id === r.id)!;
        const shown = (kind: string) =>
          reveal.done ||
          reveal.steps.some(
            (s, i) => s.player === r.id && s.kind === kind && i < reveal.index,
          );
        return (
          <section
            className={`result-row ${reveal.done && r.winner ? "winner" : ""} ${reveal.step?.player === r.id ? "counting" : ""}`}
            key={r.id}
            data-result-player={r.id}
          >
            <strong>
              <span className="result-name">
                {reveal.done && rank <= 3 && (
                  <Trophy
                    aria-label={`${["Gold", "Silver", "Bronze"][rank - 1]} trophy`}
                    className={`rank-trophy place-${rank}`}
                    size={20}
                  />
                )}
                {p.name}
                <span
                  style={{ color: colors[r.id] }}
                  className="result-player-dot"
                />
              </span>
              <b className="result-total">
                {reveal.done ? r.total : (reveal.totals[r.id] ?? 0)}
              </b>
            </strong>
            <dl>
              <div>
                <dt>Routes</dt>
                <dd>{shown("routes") ? r.routePoints : "—"}</dd>
              </div>
              <div>
                <dt>
                  Tickets{reveal.done ? ` (${r.completed} complete)` : ""}
                </dt>
                <dd>
                  {reveal.done
                    ? `${r.ticketPoints > 0 ? "+" : ""}${r.ticketPoints}`
                    : "—"}
                </dd>
              </div>
              <div
                className={
                  shown("longest") && r.longestBonus ? "award-longest" : ""
                }
              >
                <dt>
                  Longest trail
                  {shown("longest") ? ` (${r.longest} trains)` : ""}
                </dt>
                <dd>
                  {!MODES[game.mode].longest
                    ? "N/A"
                    : shown("longest")
                      ? `+${r.longestBonus}`
                      : "—"}
                </dd>
              </div>
              <div
                className={shown("globe") && r.globeBonus ? "award-globe" : ""}
              >
                <dt>Globetrotter{shown("globe") ? ` (${r.completed})` : ""}</dt>
                <dd>
                  {!MODES[game.mode].globe
                    ? "N/A"
                    : shown("globe")
                      ? `+${r.globeBonus}`
                      : "—"}
                </dd>
              </div>
            </dl>
            {reveal.done && (
              <details>
                <summary>Reveal destination tickets</summary>
                {game.revealed[r.id]?.map((id) => {
                  const t = TICKET_BY_ID[id],
                    done = connected(game, r.id, t.a, t.b);
                  return (
                    <p className="revealed-ticket" key={id}>
                      {done ? "✓" : "×"} {t.a} → {t.b}{" "}
                      <b>
                        {done ? "+" : "−"}
                        {t.points}
                      </b>
                    </p>
                  );
                })}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function ScoreRevealCard({
  game,
  reveal,
  colors,
}: {
  game: View;
  reveal: ScoreReveal;
  colors: Record<string, string>;
}) {
  const step = reveal.step;
  if (!step) return null;
  const name = game.players.find((p) => p.id === step.player)?.name;
  return (
    <div
      className={`score-reveal-card ${step.delta < 0 ? "missed" : ""}`}
      key={reveal.index}
      role="status"
    >
      {name && (
        <small>
          <i style={{ background: colors[step.player!] }} />
          {name}
        </small>
      )}
      <strong>{step.label}</strong>
      {step.kind !== "intro" && (
        <b>
          {step.delta > 0 ? "+" : ""}
          {step.delta}
        </b>
      )}
      {step.kind === "ticket" && (
        <span>{step.delta > 0 ? "Completed" : "Not completed"}</span>
      )}
    </div>
  );
}
