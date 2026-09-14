// Admin-only fixtures for local browser tests. Not callable by website clients.
import { internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { createFunctionHandle } from "convex/server";
import { v } from "convex/values";
import { vGoogleProfile } from "@convex-dev/auth/providers/oauth/google";
function devOnly() {
  if (
    process.env.CONVEX_SITE_URL !==
      "https://sincere-jellyfish-682.convex.site" &&
    (!process.env.GAMES_DEV_SITE_URL ||
      process.env.GAMES_DEV_SITE_URL !== process.env.CONVEX_SITE_URL)
  )
    throw new Error("Test accounts are disabled outside development.");
}
export const createUser = internalMutation({
  args: {
    provider: v.literal("google"),
    providerAccountId: v.string(),
    profile: vGoogleProfile,
  },
  handler: async (ctx, { profile }) => {
    devOnly();
    const username = profile.name!;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("usernameKey", username.toLowerCase()),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { testAccount: true });
      return existing._id;
    }
    const id = await ctx.db.insert("users", {
      username,
      usernameKey: username.toLowerCase(),
      testAccount: true,
    });
    await ctx.db.patch(id, { playerId: id });
    return id;
  },
});
export const signIn = internalMutation({
  args: { username: v.string() },
  handler: async (
    ctx,
    { username },
  ): Promise<{ accessToken: string; refreshToken: string }> => {
    devOnly();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username))
      throw new Error("Invalid test username");
    const claims = {
      provider: "google",
      providerAccountId: "local-test-" + username,
      profile: {
        id: "local-test-" + username,
        name: username,
        emailVerified: true,
      },
    };
    const user = await ctx.runQuery(components.auth.public.getUserIdByAccount, {
      provider: claims.provider,
      providerAccountId: claims.providerAccountId,
    });
    const args = {
      claims,
      issuer: process.env.CONVEX_SITE_URL!,
      accessTokenTtlSeconds: 3600,
    };
    if (user) {
      const id = ctx.db.normalizeId("users", user);
      if (!id) throw new Error("Invalid test account");
      await ctx.db.patch(id, { testAccount: true });
    }
    return user
      ? await ctx.runMutation(components.auth.public.signIn, args)
      : await ctx.runMutation(components.auth.public.signUp, {
          ...args,
          createUserHandle: await createFunctionHandle(
            internal.testing.createUser,
          ),
        });
  },
});

export const resetGrams = internalMutation({
  args: {},
  handler: async (ctx) => {
    devOnly();
    for (const row of await ctx.db.query("grams").collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("gramsFeed").collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("gramsPresence").collect())
      await ctx.db.delete(row._id);
  },
});
