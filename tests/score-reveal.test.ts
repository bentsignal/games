import { describe, expect, it } from "vitest";
import { endingPreview } from "../src/game/ending-preview";
import { applyAction, playerView, scoreGame } from "../src/game/engine";
import {
  countScores,
  outcomeSound,
  rankResults,
  sameRank,
  scoreSteps,
  scoreSound,
} from "../src/game/score-reveal";
import { ROUTES } from "../src/game/data";

describe("end-game scoring", () => {
  it("creates a legal, isolated one-turn preview with no early results", () => {
    let g = endingPreview("host", "Shawn", "room");
    expect(g.turn).toBe(0);
    expect(g.finalTurns).toBe(1);
    expect(g.players[0].id).toBe("host");
    expect(g.players[0].bot).toBe(false);
    expect(
      g.players.slice(1).every((p) => p.bot && p.id.startsWith("bot-room-")),
    ).toBe(true);
    for (const p of g.players)
      expect(
        p.trains +
          ROUTES.filter((r) => g.claimed[r.id] === p.id).reduce(
            (sum, r) => sum + r.length,
            0,
          ),
      ).toBe(45);
    expect(
      g.deck.length +
        g.discard.length +
        g.market.length +
        g.players.reduce((sum, p) => sum + p.hand.length, 0),
    ).toBe(110);
    expect(playerView(g, "host").revealed).toEqual({});
    expect(g.results).toEqual([]);
    expect(scoreSteps(playerView(g, "host"))).toEqual([]);
    g = applyAction(g, "host", { type: "draw", source: -1 });
    expect(g.phase).toBe("playing");
    g = applyAction(g, "host", { type: "draw", source: -1 });
    expect(g.phase).toBe("finished");
    expect(g.results).toHaveLength(4);
    expect(endingPreview("other", "Other", "new").players[0].id).toBe("other");
  });
  it("counts every ticket penalty and bonus exactly once, matching server totals", () => {
    const g = endingPreview("host", "Shawn", "room");
    for (const mode of ["classic", "1910", "big", "mega"] as const) {
      g.mode = mode;
      g.phase = "finished";
      g.results = scoreGame(g);
      const steps = scoreSteps(playerView(g, "host"));
      const totals = countScores(steps, steps.length);
      for (const step of steps) {
        expect(scoreSound(step)).toBe(
          step.delta > 0 ? "cash" : step.delta < 0 ? "buzzer" : "score-step",
        );
        if (step.kind === "longest" || step.kind === "globe")
          expect(step.delta).toBeGreaterThan(0);
      }
      expect(
        steps
          .filter((s) => s.kind === "longest")
          .map((s) => s.player)
          .sort(),
      ).toEqual(
        g.results
          .filter((r) => r.longestBonus > 0)
          .map((r) => r.id)
          .sort(),
      );
      expect(
        steps
          .filter((s) => s.kind === "globe")
          .map((s) => s.player)
          .sort(),
      ).toEqual(
        g.results
          .filter((r) => r.globeBonus > 0)
          .map((r) => r.id)
          .sort(),
      );
      for (const r of g.results) expect(totals[r.id]).toBe(r.total);
      expect(steps.filter((s) => s.kind === "ticket")).toHaveLength(
        g.players.reduce((sum, p) => sum + p.tickets.length, 0),
      );
      expect(steps.some((s) => s.delta < 0)).toBe(true);
      for (const step of steps)
        for (const route of step.routes)
          expect(g.claimed[route]).toBe(step.player);
      expect(steps.some((s) => s.kind === "longest")).toBe(
        mode === "classic" || mode === "mega",
      );
      expect(steps.some((s) => s.kind === "globe")).toBe(
        mode === "1910" || mode === "mega",
      );
    }
  });
  it("uses standard tie breakers and shares a rank only for an exact tie", () => {
    const g = endingPreview("host", "Shawn", "room"),
      results = scoreGame(g);
    const [a, b] = results;
    a.total = b.total = 100;
    a.completed = 3;
    b.completed = 4;
    expect(rankResults([a, b])[0].id).toBe(b.id);
    expect(sameRank(a, b)).toBe(false);
    a.completed = 4;
    a.longestBonus = 10;
    b.longestBonus = 0;
    expect(rankResults([a, b])[0].id).toBe(a.id);
    b.longestBonus = 10;
    expect(sameRank(a, b)).toBe(true);
  });
});

describe("placement sounds", () => {
  const sample = scoreGame(endingPreview("host", "Shawn", "room"))[0];
  for (const count of [2, 3, 4, 5]) {
    it(`uses last-place precedence with ${count} players`, () => {
      const results = Array.from({ length: count }, (_, i) => ({
        ...sample,
        id: String(i),
        total: 100 - i * 10,
      }));
      expect(results.map((r) => outcomeSound(results, r.id))).toEqual(
        results.map((_, i) =>
          i === 0
            ? "applause"
            : i === count - 1
              ? "boo"
              : i < 3
                ? "golf-clap"
                : undefined,
        ),
      );
      expect(outcomeSound(results, "spectator")).toBeUndefined();
    });
  }
  it("honors shared ranks and gives tied winners applause", () => {
    const a = { ...sample, id: "a", total: 100 };
    const b = { ...a, id: "b" };
    const c = { ...a, id: "c", total: 50 };
    const d = { ...c, id: "d" };
    expect([a, b, c, d].map((r) => outcomeSound([a, b, c, d], r.id))).toEqual([
      "applause",
      "applause",
      "boo",
      "boo",
    ]);
  });
  it("counts ticket subtotals incrementally without including base points", () => {
    const g = endingPreview("host", "Shawn", "room");
    g.phase = "finished";
    g.results = scoreGame(g);
    const steps = scoreSteps(playerView(g, "host"));
    for (let index = 0; index < steps.length; index++) {
      const actual = countScores(steps, index, 0.5, "ticket");
      for (const player of g.players) {
        const previous = steps
          .slice(0, index)
          .filter((s) => s.kind === "ticket" && s.player === player.id)
          .reduce((n, s) => n + s.delta, 0);
        const current = steps[index];
        expect(actual[player.id] ?? 0).toBe(
          previous +
            (current.kind === "ticket" && current.player === player.id
              ? Math.trunc(current.delta * 0.5)
              : 0),
        );
      }
    }
    const final = countScores(steps, steps.length, 1, "ticket");
    for (const result of g.results)
      expect(final[result.id]).toBe(result.ticketPoints);
  });
});
