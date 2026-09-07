import { MODES, ROUTES, TICKET_BY_ID } from "./data";
import { connected, type Result, type View } from "./engine";

export type ScoreKind = "intro" | "routes" | "ticket" | "longest" | "globe";
export interface ScoreStep {
  kind: ScoreKind;
  label: string;
  player?: string;
  delta: number;
  ticket?: string;
  duration: number;
  routes: string[];
}
function ownedPath(game: View, player: string, from: string, to: string) {
  const queue = [{ city: from, path: [] as string[] }],
    seen = new Set([from]);
  for (const { city, path } of queue) {
    if (city === to) return path;
    for (const r of ROUTES) {
      if (game.claimed[r.id] !== player || (r.a !== city && r.b !== city))
        continue;
      const next = r.a === city ? r.b : r.a;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push({ city: next, path: [...path, r.id] });
      }
    }
  }
  return [];
}
export function scoreSteps(game: View): ScoreStep[] {
  if (game.phase !== "finished") return [];
  const steps: ScoreStep[] = [];
  const intro = (label: string) =>
    steps.push({ kind: "intro", label, delta: 0, duration: 1000, routes: [] });
  intro("Route points");
  for (const p of game.players) {
    const r = game.results.find((r) => r.id === p.id)!;
    steps.push({
      kind: "routes",
      label: "Routes",
      player: p.id,
      delta: r.routePoints,
      duration: 1900,
      routes: ROUTES.filter((r) => game.claimed[r.id] === p.id).map(
        (r) => r.id,
      ),
    });
  }
  intro("Destination tickets");
  for (const p of game.players)
    for (const id of game.revealed[p.id] ?? []) {
      const t = TICKET_BY_ID[id],
        done = connected(game, p.id, t.a, t.b);
      steps.push({
        kind: "ticket",
        label: `${t.a} – ${t.b}`,
        player: p.id,
        ticket: id,
        delta: done ? t.points : -t.points,
        duration: 1900,
        routes: done ? ownedPath(game, p.id, t.a, t.b) : [],
      });
    }
  if (MODES[game.mode].longest) {
    intro("Longest trail");
    for (const p of game.players) {
      const r = game.results.find((r) => r.id === p.id)!;
      if (r.longestBonus <= 0) continue;
      steps.push({
        kind: "longest",
        label: `${r.longest} trains · Longest trail`,
        player: p.id,
        delta: r.longestBonus,
        duration: 2100,
        routes: [],
      });
    }
  }
  if (MODES[game.mode].globe) {
    intro("Globetrotter");
    for (const p of game.players) {
      const r = game.results.find((r) => r.id === p.id)!;
      if (r.globeBonus <= 0) continue;
      steps.push({
        kind: "globe",
        label: `${r.completed} destinations · Globetrotter`,
        player: p.id,
        delta: r.globeBonus,
        duration: 2100,
        routes: [],
      });
    }
  }
  return steps;
}
export function countScores(steps: ScoreStep[], index: number, progress = 1) {
  const totals: Record<string, number> = {};
  steps.forEach((s, i) => {
    if (!s.player || i > index) return;
    totals[s.player] =
      (totals[s.player] ?? 0) +
      (i === index ? Math.trunc(s.delta * progress) : s.delta);
  });
  return totals;
}
export function rankResults(results: Result[]) {
  return [...results].sort(
    (a, b) =>
      b.total - a.total ||
      b.completed - a.completed ||
      b.longestBonus - a.longestBonus,
  );
}
export function sameRank(a: Result, b: Result) {
  return (
    a.total === b.total &&
    a.completed === b.completed &&
    a.longestBonus === b.longestBonus
  );
}

export function scoreSound(step: ScoreStep) {
  return step.delta > 0 ? "cash" : step.delta < 0 ? "buzzer" : "score-step";
}
