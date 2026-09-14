import { newPlayer, newGame, type Game } from "../../src/game/engine";
import type { Mode } from "../../src/game/data";
export type Manage = {
  operation:
    "bot" | "remove" | "mode" | "timer" | "rematch" | "leave" | "resign";
  player?: string;
  mode?: Mode;
  turnSeconds?: Game["turnSeconds"];
};
export function manageGame(original: Game, id: string, args: Manage): Game {
  let g = structuredClone(original);
  const me = g.players.find((p) => p.id === id);
  if (!me) throw new Error("Not seated.");
  if (args.operation === "resign") {
    if (g.phase !== "playing" && g.phase !== "setup")
      throw new Error("No active game.");
    if (me.bot)
      throw new Error("This seat is already controlled by a computer.");
    me.bot = true;
    me.name = me.name + " (AI)";
  } else if (args.operation === "leave") {
    if (g.phase !== "lobby")
      throw new Error("You can only leave your seat before a game starts.");
    g.players = g.players.filter((p) => p.id !== id);
  } else {
    if (g.players[0].id !== id)
      throw new Error("Only the host can change the table.");
    if (args.operation === "rematch") {
      if (g.phase !== "finished")
        throw new Error("Finish the current game first.");
      const players = g.players.map((p) =>
        newPlayer(
          p.id,
          p.id.startsWith("bot-")
            ? p.name
            : p.name.replace(/(?: \(AI\))+$/, ""),
          p.color,
          p.id.startsWith("bot-"),
        ),
      );
      const turnSeconds = g.turnSeconds;
      g = newGame(g.mode, players[0]);
      if (turnSeconds !== undefined) g.turnSeconds = turnSeconds;
      g.players = players;
    } else {
      if (g.phase !== "lobby") throw new Error("The game has already started.");
      if (args.operation === "bot") {
        if (g.players.length >= 5) throw new Error("The table is full.");
        const c = [0, 1, 2, 3, 4].find(
          (c) => !g.players.some((p) => p.color === c),
        )!;
        g.players.push(
          newPlayer(
            "bot-" + Math.random().toString(36).slice(2),
            ["Ada", "Jules", "Nellie", "Arthur", "Clara"][c],
            c,
            true,
          ),
        );
      }
      if (args.operation === "remove") {
        if (args.player === id)
          throw new Error("Use leave to leave the table.");
        g.players = g.players.filter((p) => p.id !== args.player);
      }
      if (args.operation === "mode" && args.mode) g.mode = args.mode;
      if (args.operation === "timer" && args.turnSeconds !== undefined)
        g.turnSeconds = args.turnSeconds;
    }
  }
  return g;
}
export function nextBot(g: Game) {
  return g.phase === "setup"
    ? g.players.find((p) => p.bot && p.pending.length)
    : g.phase === "playing" && g.players[g.turn]?.bot
      ? g.players[g.turn]
      : undefined;
}
export function scheduleTurn(before: Game, game: Game, now = Date.now()) {
  if (game.phase !== "playing" || !game.turnSeconds) {
    delete game.turnDeadline;
    return;
  }
  if (
    before.phase === "playing" &&
    before.turnNumber === game.turnNumber &&
    before.roundId === game.roundId &&
    before.turnDeadline
  )
    return;
  game.turnDeadline = now + game.turnSeconds * 1000;
}
