import { v, ConvexError } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { vGoogleProfile } from "@convex-dev/auth/providers/oauth/google";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export async function currentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const id = identity && ctx.db.normalizeId("users", identity.subject);
  return id ? await ctx.db.get(id) : null;
}
export async function requirePlayer(ctx: QueryCtx) {
  const user = await currentUser(ctx);
  if (!user) throw new ConvexError("Sign in with Google to play.");
  if (!user.username || !user.playerId)
    throw new ConvexError("Choose a username first.");
  return { id: user.playerId, name: user.username, userId: user._id };
}
export const createUser = internalMutation({
  args: {
    provider: v.literal("google"),
    providerAccountId: v.string(),
    profile: vGoogleProfile,
  },
  returns: v.id("users"),
  handler: async (ctx) => ctx.db.insert("users", {}),
});
export const me = query({ args: {}, handler: currentUser });
export const onboard = mutation({
  args: { username: v.string(), legacyToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) throw new ConvexError("Sign in with Google first.");
    if (user.username) return;
    const username = args.username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username))
      throw new ConvexError("Use 3–24 letters, numbers, or underscores.");
    const usernameKey = username.toLowerCase();
    if (
      await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("usernameKey", usernameKey))
        .unique()
    )
      throw new ConvexError("That username is taken.");
    let playerId: string = user._id;
    if (args.legacyToken && /^[a-f0-9]{64}$/.test(args.legacyToken)) {
      const hash = bytesToHex(
        sha256(new TextEncoder().encode(args.legacyToken)),
      );
      const owner = await ctx.db
        .query("users")
        .withIndex("by_player", (q) => q.eq("playerId", hash))
        .unique();
      if (!owner) playerId = hash;
    }
    await ctx.db.patch(user._id, { username, usernameKey, playerId });
  },
});
