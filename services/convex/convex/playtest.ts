// Admin-only creation and explicit reset of isolated end-game previews.
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import fixtures from "../../../src/game/playtest-endings.json";
import type { Game } from "../../../src/game/engine";
import { ROUTES } from "../../../src/game/data";
export const createEndings = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("usernameKey", username.toLowerCase()),
      )
      .unique();
    if (!user?.playerId || !user.username) throw Error("Account not found");
    const links = [];
    for (const outcome of ["win", "lose"] as const) {
      let code = "";
      do {
        code = Array.from(
          { length: 8 },
          () =>
            "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)],
        ).join("");
      } while (
        await ctx.db
          .query("rooms")
          .withIndex("by_code", (q) => q.eq("code", code))
          .unique()
      );
      const fixture = fixtures[outcome];
      const game = previewGame(outcome, code, user.playerId, user.username);
      await ctx.db.insert("rooms", {
        code,
        game,
        revision: 0,
        preview: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const route = ROUTES.find((r) => r.id === fixture.action.route)!;
      links.push({
        outcome,
        url: `https://ticket.bentsignal.com/room/${code}`,
        firstMove: {
          from: route.a,
          to: route.b,
          cards: route.length,
          color: fixture.action.color,
        },
      });
    }
    return links;
  },
});

function previewGame(
  outcome: "win" | "lose",
  code: string,
  playerId: string,
  username: string,
): Game {
  const fixture = fixtures[outcome];
  const game = structuredClone(fixture.game) as Game;
  const ids = Object.fromEntries(
    game.players.map((p, i) => [p.id, i === 0 ? playerId : `bot-${code}`]),
  );
  const oldNames = game.players.map((p) => p.name);
  game.players = game.players.map((p, i) => ({
    ...p,
    id: ids[p.id],
    name: i === 0 ? username : "Jules",
    bot: i !== 0,
  }));
  game.claimed = Object.fromEntries(
    Object.entries(game.claimed).map(([route, id]) => [route, ids[id]]),
  );
  game.log = game.log.map((line) =>
    line.replaceAll(oldNames[0], username).replaceAll(oldNames[1], "Jules"),
  );
  game.roundId = Date.now();
  return game;
}

// Explicitly reset one preview only; revision invalidates any queued computer moves.
export const resetEnding = internalMutation({
  args: {
    code: v.string(),
    username: v.string(),
    outcome: v.union(v.literal("win"), v.literal("lose")),
  },
  handler: async (ctx, { code, username, outcome }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("usernameKey", username.toLowerCase()),
      )
      .unique();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (
      !user?.playerId ||
      !user.username ||
      !room?.preview ||
      (room.game as Game).players[0]?.id !== user.playerId
    )
      throw Error("This must be a preview owned by the specified account.");
    const game = previewGame(outcome, code, user.playerId, user.username);
    game.roundId = Math.max(Date.now(), ((room.game as Game).roundId ?? 0) + 1);
    await ctx.db.patch(room._id, {
      game,
      revision: room.revision + 1,
      updatedAt: Date.now(),
    });
    return {
      code,
      roundId: game.roundId,
      phase: game.phase,
      finalTurns: game.finalTurns,
    };
  },
});
