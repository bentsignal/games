import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { requirePlayer } from "./users";
import { saveResult } from "./results";
import { endingPreview } from "../src/game/ending-preview";
import {
  applyAction,
  expireTurn,
  botAction,
  newGame,
  newPlayer,
  playerView,
  type Game,
} from "../src/game/engine";
const mode = v.union(
  v.literal("classic"),
  v.literal("1910"),
  v.literal("big"),
  v.literal("mega"),
);
const color = v.union(
  ...(
    [
      "red",
      "orange",
      "yellow",
      "green",
      "blue",
      "pink",
      "black",
      "white",
      "wild",
    ] as const
  ).map(v.literal),
);
const action = v.union(
  v.object({ type: v.literal("start") }),
  v.object({ type: v.literal("keep"), tickets: v.array(v.string()) }),
  v.object({
    type: v.literal("draw"),
    source: v.number(),
    expected: v.optional(color),
  }),
  v.object({ type: v.literal("tickets") }),
  v.object({
    type: v.literal("claim"),
    route: v.string(),
    color,
    wilds: v.number(),
  }),
  v.object({ type: v.literal("pass") }),
);
export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    mode,
    endingPreview: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, name } = await requirePlayer(ctx);
    let session = await ctx.db
      .query("sessions")
      .withIndex("by_hash", (q) => q.eq("hash", id))
      .unique();
    if (session && Date.now() - session.lastCreate < 10000)
      throw new ConvexError(
        "Please wait a few seconds before creating another room.",
      );
    const day = Math.floor(Date.now() / 86400000);
    const count = session?.createDay === day ? (session.createCount ?? 0) : 0;
    if (count >= 20)
      throw new ConvexError(
        "You’ve created 20 games today. Please try again tomorrow.",
      );
    if (session)
      await ctx.db.patch(session._id, {
        lastCreate: Date.now(),
        createDay: day,
        createCount: count + 1,
      });
    else
      await ctx.db.insert("sessions", {
        hash: id,
        lastCreate: Date.now(),
        lastChat: 0,
        createDay: day,
        createCount: count + 1,
      });
    let code = "";
    for (let i = 0; i < 8; i++)
      code += "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[
        Math.floor(Math.random() * 32)
      ];
    while (
      await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique()
    )
      code =
        code.slice(1) +
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)];
    await ctx.db.insert("rooms", {
      code,
      game: args.endingPreview
        ? endingPreview(id, name, code)
        : newGame(args.mode, newPlayer(id, name, 0)),
      revision: 0,
      preview: args.endingPreview ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return code;
  },
});
export const get = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { id } = await requirePlayer(ctx),
      room = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
        .unique();
    if (!room) return null;
    const game = room.game as Game;
    return {
      code: room.code,
      revision: room.revision,
      serverNow: Date.now(),
      game: playerView(game, id),
      seats: game.players.length,
      phase: game.phase,
    };
  },
});
export const join = mutation({
  args: { code: v.string(), token: v.string(), name: v.string() },
  handler: async (ctx, { code, token, name }) => {
    const { id, name: accountName } = await requirePlayer(ctx);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .unique();
    if (!room) throw new ConvexError("That room does not exist.");
    const g = room.game as Game;
    if (g.players.some((p) => p.id === id)) return room.code;
    if (g.phase !== "lobby")
      throw new ConvexError(
        "This train has departed. Ask the host for the next game.",
      );
    if (g.players.length >= 5) throw new ConvexError("This room is full.");
    const available = [0, 1, 2, 3, 4].find(
      (c) => !g.players.some((p) => p.color === c),
    )!;
    g.players.push(newPlayer(id, accountName, available));
    await ctx.db.patch(room._id, {
      game: g,
      revision: room.revision + 1,
      updatedAt: Date.now(),
    });
    return room.code;
  },
});
export const play = mutation({
  args: { code: v.string(), token: v.string(), revision: v.number(), action },
  handler: async (ctx, args) => {
    const { id } = await requirePlayer(ctx),
      room = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", args.code))
        .unique();
    if (!room) throw new ConvexError("Room not found.");
    const previous = room.game as Game;
    if (
      previous.phase === "playing" &&
      previous.turnDeadline &&
      Date.now() >= previous.turnDeadline
    ) {
      await finishTimeout(ctx, room);
      return;
    }
    // Starting choices affect only the actor's offered tickets. Let all players
    // choose concurrently; applyAction still rejects duplicate or invented keeps.
    const independentSetupChoice =
      args.action.type === "keep" && (room.game as Game).phase === "setup";
    if (room.revision !== args.revision && !independentSetupChoice)
      throw new ConvexError("The game changed. Please try your move again.");
    if ((room.game as Game).players.find((p) => p.id === id)?.bot)
      throw new ConvexError("This seat is now controlled by the computer.");
    let game: Game;
    try {
      game = applyAction(room.game as Game, id, args.action);
    } catch (error) {
      throw new ConvexError(
        error instanceof Error
          ? error.message
          : "That move could not be completed.",
      );
    }
    await scheduleTurn(ctx, room._id, room.game as Game, game);
    await ctx.db.patch(room._id, {
      game,
      revision: room.revision + 1,
      updatedAt: Date.now(),
    });
    await saveResult(ctx, room, game);
    if (nextBot(game))
      await ctx.scheduler.runAfter(600, internal.rooms.advanceBot, {
        roomId: room._id,
        revision: room.revision + 1,
      });
  },
});
export const manage = mutation({
  args: {
    code: v.string(),
    token: v.string(),
    operation: v.union(
      v.literal("bot"),
      v.literal("remove"),
      v.literal("mode"),
      v.literal("timer"),
      v.literal("rematch"),
      v.literal("leave"),
      v.literal("resign"),
    ),
    player: v.optional(v.string()),
    mode: v.optional(mode),
    turnSeconds: v.optional(
      v.union(
        v.literal(0),
        v.literal(30),
        v.literal(60),
        v.literal(90),
        v.literal(120),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { id } = await requirePlayer(ctx),
      room = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", args.code))
        .unique();
    if (!room) throw new ConvexError("Room not found.");
    let g = room.game as Game;
    const me = g.players.find((p) => p.id === id);
    if (!me) throw new ConvexError("Not seated.");
    if (args.operation === "resign") {
      if (g.phase !== "playing" && g.phase !== "setup")
        throw new ConvexError("No active game.");
      if (me.bot)
        throw new ConvexError("This seat is already controlled by a computer.");
      me.bot = true;
      me.name = me.name + " (AI)";
    } else if (args.operation === "leave") {
      if (g.phase !== "lobby")
        throw new ConvexError(
          "You can only leave your seat before a game starts.",
        );
      g.players = g.players.filter((p) => p.id !== id);
    } else {
      if (g.players[0].id !== id)
        throw new ConvexError("Only the host can change the table.");
      if (args.operation === "rematch") {
        if (g.phase !== "finished")
          throw new ConvexError("Finish the current game first.");
        await saveResult(ctx, room, g);
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
        if (g.phase !== "lobby")
          throw new ConvexError("The game has already started.");
        if (args.operation === "bot") {
          if (g.players.length >= 5)
            throw new ConvexError("The table is full.");
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
            throw new ConvexError("Use leave to leave the table.");
          g.players = g.players.filter((p) => p.id !== args.player);
        }
        if (args.operation === "mode" && args.mode) g.mode = args.mode;
        if (args.operation === "timer" && args.turnSeconds !== undefined)
          g.turnSeconds = args.turnSeconds;
      }
    }
    if (!g.players.length) {
      await ctx.db.delete(room._id);
      await ctx.scheduler.runAfter(0, internal.rooms.deleteRoomChat, {
        roomId: room._id,
      });
      return;
    }
    await ctx.db.patch(room._id, {
      game: g,
      revision: room.revision + 1,
      updatedAt: Date.now(),
    });
    if (args.operation === "resign" && nextBot(g))
      await ctx.scheduler.runAfter(300, internal.rooms.advanceBot, {
        roomId: room._id,
        revision: room.revision + 1,
      });
  },
});
function nextBot(g: Game) {
  return g.phase === "setup"
    ? g.players.find((p) => p.bot && p.pending.length)
    : g.phase === "playing" && g.players[g.turn]?.bot
      ? g.players[g.turn]
      : null;
}
export const advanceBot = internalMutation({
  args: { roomId: v.id("rooms"), revision: v.number() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.revision !== args.revision) return;
    const g = room.game as Game;
    if (
      g.phase === "playing" &&
      g.turnDeadline &&
      Date.now() >= g.turnDeadline
    ) {
      await finishTimeout(ctx, room);
      return;
    }
    const p = nextBot(g);
    if (!p) return;
    const game = applyAction(g, p.id, botAction(g, p));
    await scheduleTurn(ctx, room._id, room.game as Game, game);
    await ctx.db.patch(room._id, {
      game,
      revision: room.revision + 1,
      updatedAt: Date.now(),
    });
    await saveResult(ctx, room, game);
    if (nextBot(game))
      await ctx.scheduler.runAfter(650, internal.rooms.advanceBot, {
        roomId: room._id,
        revision: room.revision + 1,
      });
  },
});
export const chat = query({
  args: {
    code: v.string(),
    token: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { code, paginationOpts }) => {
    const { id } = await requirePlayer(ctx),
      room = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
    if (!room) return { page: [], isDone: true, continueCursor: "" };
    return await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("room", room._id))
      .order("desc")
      .paginate(paginationOpts);
  },
});
export const send = mutation({
  args: { code: v.string(), token: v.string(), text: v.string() },
  handler: async (ctx, { code, token, text }) => {
    const { id, name: accountName } = await requirePlayer(ctx),
      room = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
    const p = (room?.game as Game | undefined)?.players.find(
      (p) => p.id === id,
    );
    if (!room) throw new ConvexError("Room not found.");
    const message = text.trim();
    if (!message || message.length > 500)
      throw new ConvexError("Messages must be 1–500 characters.");
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_hash", (q) => q.eq("hash", id))
      .unique();
    if (session && Date.now() - session.lastChat < 750)
      throw new ConvexError("Please slow down.");
    if (session) await ctx.db.patch(session._id, { lastChat: Date.now() });
    else
      await ctx.db.insert("sessions", {
        hash: id,
        lastCreate: 0,
        lastChat: Date.now(),
      });
    await ctx.db.insert("messages", {
      room: room._id,
      sender: id,
      name: p?.name ?? accountName,
      text: message,
      time: Date.now(),
    });
  },
});

// Bounded cleanup only when the last player explicitly leaves an empty lobby.
export const deleteRoomChat = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    if (await ctx.db.get(roomId)) return;
    const batch = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("room", roomId))
      .take(100);
    for (const message of batch) await ctx.db.delete(message._id);
    if (batch.length === 100)
      await ctx.scheduler.runAfter(0, internal.rooms.deleteRoomChat, {
        roomId,
      });
  },
});

async function scheduleTurn(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  before: Game,
  game: Game,
) {
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
  game.turnDeadline = Date.now() + game.turnSeconds * 1000;
  await ctx.scheduler.runAt(game.turnDeadline, internal.rooms.timeout, {
    roomId,
    deadline: game.turnDeadline,
    turn: game.turnNumber,
    round: game.roundId ?? 0,
  });
}
async function finishTimeout(ctx: MutationCtx, room: Doc<"rooms">) {
  const before = room.game as Game;
  const game = expireTurn(before);
  await scheduleTurn(ctx, room._id, before, game);
  await ctx.db.patch(room._id, {
    game,
    revision: room.revision + 1,
    updatedAt: Date.now(),
  });
  await saveResult(ctx, room, game);
  if (nextBot(game))
    await ctx.scheduler.runAfter(600, internal.rooms.advanceBot, {
      roomId: room._id,
      revision: room.revision + 1,
    });
}
export const timeout = internalMutation({
  args: {
    roomId: v.id("rooms"),
    deadline: v.number(),
    turn: v.number(),
    round: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    const g = room.game as Game;
    if (
      g.phase !== "playing" ||
      g.turnDeadline !== args.deadline ||
      g.turnNumber !== args.turn ||
      (g.roundId ?? 0) !== args.round ||
      Date.now() < args.deadline
    )
      return;
    await finishTimeout(ctx, room);
  },
});
