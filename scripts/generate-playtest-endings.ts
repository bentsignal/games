import { writeFileSync } from "node:fs";
import {
  newGame,
  newPlayer,
  applyAction,
  botAction,
  type Game,
  type Action,
} from "../src/game/engine";
import { ROUTES } from "../src/game/data";
let seed = 82741;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const fixtures: Record<string, { game: Game; action: Action }> = {};
for (
  let attempt = 0;
  attempt < 300 && Object.keys(fixtures).length < 2;
  attempt++
) {
  let g = newGame("mega", newPlayer("a", "Alice", 0));
  g.players.push(newPlayer("b", "Bob", 1));
  g = applyAction(g, "a", { type: "start" });
  for (let n = 0; n < 600 && g.phase !== "finished"; n++) {
    const p =
      g.phase === "setup"
        ? g.players.find((p) => p.pending.length)!
        : g.players[g.turn];
    const action = botAction(g, p);
    if (
      g.phase === "playing" &&
      g.finalTurns === null &&
      action.type === "claim" &&
      action.wilds === 0 &&
      g.deck.length >= 6 &&
      p.trains - ROUTES.find((r) => r.id === action.route)!.length <= 2
    ) {
      let end = applyAction(g, p.id, action);
      for (let k = 0; k < 15 && end.phase !== "finished"; k++) {
        const actor = end.players[end.turn];
        end = applyAction(
          end,
          actor.id,
          actor.id === p.id
            ? { type: "draw", source: -1 }
            : botAction(end, actor),
        );
      }
      if (end.phase === "finished") {
        const mine = end.results.find((r) => r.id === p.id)!;
        const other = end.results.find((r) => r.id !== p.id)!;
        const outcome = mine.winner ? "win" : "lose";
        if (!fixtures[outcome] && Math.abs(mine.total - other.total) >= 15) {
          const snapshot = structuredClone(g);
          snapshot.players = [
            snapshot.players.find((x) => x.id === p.id)!,
            snapshot.players.find((x) => x.id !== p.id)!,
          ];
          snapshot.turn = 0;
          fixtures[outcome] = { game: snapshot, action };
          const route = ROUTES.find((r) => r.id === action.route)!;
          console.log(
            JSON.stringify({
              outcome,
              route: `${route.a} – ${route.b}`,
              length: route.length,
              color: action.color,
              scores: [mine.total, other.total],
              trains: p.trains,
            }),
          );
        }
      }
    }
    g = applyAction(g, p.id, action);
  }
}
if (Object.keys(fixtures).length !== 2)
  throw Error("Could not find both fixtures");
writeFileSync(
  "src/game/playtest-endings.json",
  JSON.stringify(fixtures, null, 2) + "\n",
);
