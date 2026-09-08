import { it, expect } from "vitest";
import fixtures from "../src/game/playtest-endings.json";
import {
  applyAction,
  botAction,
  playerView,
  type Game,
  type Action,
} from "../src/game/engine";
import { automaticRoute, cardPayment } from "../src/game/interactions";
import { ROUTES, POINTS } from "../src/game/data";
for (const outcome of ["win", "lose"] as const)
  it(`the ${outcome} preview triggers the final round and finishes on the player's second turn`, () => {
    let game = structuredClone(fixtures[outcome].game) as Game;
    const host = game.players[0];
    const action = fixtures[outcome].action as Extract<
      Action,
      { type: "claim" }
    >;
    expect(game.finalTurns).toBeNull();
    expect(game.turn).toBe(0);
    for (const p of game.players) {
      const routes = ROUTES.filter((r) => game.claimed[r.id] === p.id);
      expect(p.trains).toBe(45 - routes.reduce((n, r) => n + r.length, 0));
      expect(p.score).toBe(routes.reduce((n, r) => n + POINTS[r.length], 0));
      expect(p.trains).toBeGreaterThan(2);
    }
    const route = automaticRoute(
      playerView(game, host.id),
      ROUTES.find((r) => r.id === action.route)!,
      action.color,
    )!;
    const payment = cardPayment(
      playerView(game, host.id),
      route,
      action.color,
    )!;
    expect(payment.wilds).toBe(0);
    game = applyAction(game, host.id, {
      type: "claim",
      route: route.id,
      ...payment,
    });
    expect(game.finalTurns).toBe(2);
    for (let i = 0; i < 10 && game.players[game.turn].id !== host.id; i++) {
      const bot = game.players[game.turn];
      game = applyAction(game, bot.id, botAction(game, bot));
    }
    expect(game.phase).toBe("playing");
    expect(game.finalTurns).toBe(1);
    expect(game.players[game.turn].id).toBe(host.id);
    game = applyAction(game, host.id, { type: "draw", source: -1 });
    game = applyAction(game, host.id, { type: "draw", source: -1 });
    expect(game.phase).toBe("finished");
    expect(game.results.find((r) => r.id === host.id)!.winner).toBe(
      outcome === "win",
    );
  });
