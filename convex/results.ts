import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { Game } from "../src/game/engine";

// Completed rounds survive rematches. Preview games never enter real statistics.
export async function saveResult(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  game: Game,
) {
  if (game.phase !== "finished" || room.preview) return;
  const roundId = game.roundId ?? room.createdAt;
  if (
    await ctx.db
      .query("results")
      .withIndex("by_round", (q) =>
        q.eq("room", room._id).eq("roundId", roundId),
      )
      .unique()
  )
    return;
  const result = await ctx.db.insert("results", {
    room: room._id,
    roundId,
    mode: game.mode,
    finishedAt: Date.now(),
    preview: false,
    players: game.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot })),
    scores: game.results,
  });
  for (const score of game.results) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_player", (q) => q.eq("playerId", score.id))
      .unique();
    if (user)
      await ctx.db.insert("playerResults", {
        user: user._id,
        result,
        score: score.total,
        winner: score.winner,
      });
  }
}
