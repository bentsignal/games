import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requirePlayer } from "./users";
import { signTicket, verifyTicket } from "../../../shared/realtimeAuth";
import type { TicketResult } from "../../../shared/ticketProtocol";
function secret() {
  const value = process.env.GRAMS_REALTIME_SECRET;
  if (!value) throw new ConvexError("Game server is being configured.");
  return value;
}
const mode = v.union(
  v.literal("classic"),
  v.literal("1910"),
  v.literal("big"),
  v.literal("mega"),
);
export const connect = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const player = await requirePlayer(ctx);
    if (!/^[A-Z2-9]{8}$/.test(code))
      throw new ConvexError("Invalid room code.");
    return signTicket(
      {
        iss: "games-realtime",
        aud: "ticket:room",
        exp: Date.now() / 1000 + 60,
        code,
        ...player,
      },
      secret(),
    );
  },
});
export const create = mutation({
  args: { mode, endingPreview: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx),
      now = Date.now(),
      day = Math.floor(now / 86400000);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_hash", (q) => q.eq("hash", player.id))
      .unique();
    if (session && now - session.lastCreate < 10000)
      throw new ConvexError(
        "Please wait a few seconds before creating another room.",
      );
    const count = session?.createDay === day ? (session.createCount ?? 0) : 0;
    if (count >= 20)
      throw new ConvexError(
        "You've created 20 games today. Please try again tomorrow.",
      );
    const values = { lastCreate: now, createDay: day, createCount: count + 1 };
    if (session) await ctx.db.patch(session._id, values);
    else
      await ctx.db.insert("sessions", {
        ...values,
        hash: player.id,
        lastChat: 0,
      });
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from(
      { length: 8 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
    return {
      code,
      token: signTicket(
        {
          iss: "games-realtime",
          aud: "ticket:room",
          exp: now / 1000 + 60,
          code,
          ...player,
          create: args,
        },
        secret(),
      ),
    };
  },
});
export const saveResult = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const r = verifyTicket(token, secret(), "ticket:result")
      .result as TicketResult;
    if (
      !r ||
      typeof r.id !== "string" ||
      r.id.length > 150 ||
      !/^[A-Z2-9]{8}$/.test(r.code) ||
      !Number.isSafeInteger(r.roundId) ||
      !Number.isFinite(r.finishedAt) ||
      !["classic", "1910", "big", "mega"].includes(r.mode) ||
      !Array.isArray(r.players) ||
      r.players.length > 5 ||
      !Array.isArray(r.scores) ||
      r.scores.length !== r.players.length
    )
      throw new Error("Invalid result");
    const existing = await ctx.db
      .query("results")
      .withIndex("by_external", (q) => q.eq("externalId", r.id))
      .unique();
    if (existing) return existing._id;
    if (
      new Set(r.players.map((p) => p.id)).size !== r.players.length ||
      new Set(r.scores.map((p) => p.id)).size !== r.scores.length ||
      r.scores.some(
        (s) =>
          !r.players.some((p) => p.id === s.id) ||
          !Number.isSafeInteger(s.total) ||
          typeof s.winner !== "boolean",
      )
    )
      throw new Error("Invalid scores");
    const result = await ctx.db.insert("results", {
      externalId: r.id,
      roomCode: r.code,
      roundId: r.roundId,
      mode: r.mode,
      finishedAt: r.finishedAt,
      preview: false,
      players: r.players,
      scores: r.scores,
    });
    for (const score of r.scores) {
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
    return result;
  },
});
