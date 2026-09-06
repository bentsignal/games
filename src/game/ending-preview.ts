import fixture from "./ending-preview.json";
import type { Game } from "./engine";

// A game played by the rules, saved immediately before its final turn.
export function endingPreview(
  hostId: string,
  name: string,
  seed: string,
): Game {
  const game = structuredClone(fixture) as Game;
  const ids = Object.fromEntries(
    game.players.map((p, i) => [p.id, i === 0 ? hostId : `bot-${seed}-${i}`]),
  );
  game.players = game.players.map((p, i) => ({
    ...p,
    id: ids[p.id],
    name: i === 0 ? name : p.name,
    bot: i !== 0,
  }));
  game.claimed = Object.fromEntries(
    Object.entries(game.claimed).map(([route, owner]) => [route, ids[owner]]),
  );
  game.roundId = Date.now();
  return game;
}
