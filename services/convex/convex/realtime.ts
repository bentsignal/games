import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requirePlayer } from "./users";
import { signTicket, verifyTicket } from "../../../shared/realtimeAuth";
import { gramsCodePattern } from "../../../shared/gramsRooms";
function secret() {
  const value = process.env.GRAMS_REALTIME_SECRET;
  if (!value)
    throw new ConvexError(
      "Grams is being configured. Please try again shortly.",
    );
  return value;
}
// A narrowly scoped, one-minute connection ticket. The Convex ID token never leaves Convex.
export const connect = mutation({
  args: { code: v.optional(v.string()), create: v.optional(v.boolean()) },
  handler: async (ctx, { code, create }) => {
    const player = await requirePlayer(ctx);
    if (code !== undefined && !gramsCodePattern.test(code))
      throw new ConvexError("Enter an eight-character Grams lobby code.");
    if (create && !code) throw new ConvexError("Lobby code required.");
    return signTicket(
      {
        iss: "games-realtime",
        aud: `grams:${code ?? "friends"}`,
        create: create === true,
        exp: Math.floor(Date.now() / 1000) + 60,
        ...player,
      },
      secret(),
    );
  },
});
export const saveResult = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { result: r } = verifyTicket(token, secret(), "grams:result");
    if (
      !r ||
      typeof r.id !== "string" ||
      r.id.length > 100 ||
      !Number.isSafeInteger(r.round) ||
      !Number.isFinite(r.startedAt) ||
      !Number.isFinite(r.finishedAt) ||
      typeof r.word !== "string" ||
      r.word.length > 8 ||
      !Array.isArray(r.players) ||
      r.players.length > 6
    )
      throw new Error("Invalid result");
    const existing = await ctx.db
      .query("gramsRounds")
      .withIndex("by_external", (q) => q.eq("externalId", r.id))
      .unique();
    if (existing) return existing._id;
    const players = [];
    for (const p of r.players) {
      const userId = ctx.db.normalizeId("users", p.userId);
      const user = userId && (await ctx.db.get(userId));
      if (
        !user ||
        user.playerId !== p.id ||
        !Number.isSafeInteger(p.score) ||
        p.score < 0 ||
        !Array.isArray(p.words) ||
        p.words.length > 500 ||
        p.words.some((w: unknown) => typeof w !== "string" || w.length > 8)
      )
        throw new Error("Invalid result player");
      players.push({
        id: p.id,
        userId,
        name: user.username,
        score: p.score,
        words: p.words,
        wins: p.wins ?? 0,
        pfp: p.pfp ?? "",
      });
    }
    return ctx.db.insert("gramsRounds", {
      externalId: r.id,
      round: r.round,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      word: r.word,
      players,
    });
  },
});
