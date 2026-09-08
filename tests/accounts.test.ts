import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { saveResult } from "../convex/results";
import { endingPreview } from "../src/game/ending-preview";
import { applyAction } from "../src/game/engine";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
const token = "a".repeat(64);
describe("Google account game access", () => {
  it("requires authentication and onboarding even with a legacy session token", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.rooms.create, { token, name: "Guest", mode: "mega" }),
    ).rejects.toThrow("Sign in");
    await expect(
      t.query(api.rooms.get, { token, code: "ABCDEFGH" }),
    ).rejects.toThrow("Sign in");
    await expect(
      t.mutation(api.rooms.join, { token, code: "ABCDEFGH", name: "Guest" }),
    ).rejects.toThrow("Sign in");
    const id = await t.run((ctx) => ctx.db.insert("users", {}));
    const user = t.withIdentity({ subject: id });
    await expect(
      user.mutation(api.rooms.create, { token, name: "Guest", mode: "mega" }),
    ).rejects.toThrow("username");
    await user.mutation(api.users.onboard, { username: "Shawn" });
    const code = await user.mutation(api.rooms.create, {
      token,
      name: "Spoofed",
      mode: "mega",
    });
    const room = await user.query(api.rooms.get, { token, code });
    expect(room?.game?.me?.name).toBe("Shawn");
    const otherId = await t.run((ctx) => ctx.db.insert("users", {}));
    const other = t.withIdentity({ subject: otherId });
    await expect(
      other.mutation(api.users.onboard, { username: "shawn" }),
    ).rejects.toThrow("taken");
    await other.mutation(api.users.onboard, { username: "Friend" });
    const spectator = (await other.query(api.rooms.get, { token, code }))!
      .game!;
    expect(spectator.me).toBeNull();
    expect(spectator.revealed).toEqual({});
    expect(spectator.players[0]).not.toHaveProperty("hand");
    expect(spectator.players[0]).not.toHaveProperty("tickets");
    expect(spectator).not.toHaveProperty("deck");
    await expect(
      other.mutation(api.rooms.manage, { token, code, operation: "bot" }),
    ).rejects.toThrow("Not seated");
    await expect(
      other.mutation(api.rooms.play, {
        token,
        code,
        revision: 0,
        action: { type: "start" },
      }),
    ).rejects.toThrow();
    await other.mutation(api.rooms.send, { token, code, text: "Watching!" });
    const chat = await other.query(api.rooms.chat, {
      token,
      code,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(chat.page[0].name).toBe("Friend");
    await other.mutation(api.rooms.join, { token, code, name: "Spoofed" });
    expect(
      (await other.query(api.rooms.get, { token, code }))?.game?.me?.name,
    ).toBe("Friend");
  });
  it("retains more than 100 messages, paginates them, and still rejects spam", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.db.insert("users", {}));
    const user = t.withIdentity({ subject: id });
    await user.mutation(api.users.onboard, { username: "ChatHistory" });
    const code = await user.mutation(api.rooms.create, {
      token,
      name: "ignored",
      mode: "mega",
    });
    await t.run(async (ctx) => {
      const room = (await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique())!;
      for (let i = 0; i < 110; i++)
        await ctx.db.insert("messages", {
          room: room._id,
          sender: id,
          name: "ChatHistory",
          text: String(i),
          time: i,
        });
    });
    await user.mutation(api.rooms.send, { token, code, text: "Latest" });
    await expect(
      user.mutation(api.rooms.send, { token, code, text: "Spam" }),
    ).rejects.toThrow("slow");
    expect(
      await t.run((ctx) => ctx.db.query("messages").collect()),
    ).toHaveLength(111);
    const first = await user.query(api.rooms.chat, {
      token,
      code,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(first.page).toHaveLength(50);
    expect(first.isDone).toBe(false);
    const second = await user.query(api.rooms.chat, {
      token,
      code,
      paginationOpts: { numItems: 100, cursor: first.continueCursor },
    });
    expect(second.page).toHaveLength(61);
    expect(second.isDone).toBe(true);
  });
  it("preserves results once per round and links winners to accounts", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        username: "Shawn",
        usernameKey: "shawn",
        playerId: "host",
      });
      let game = endingPreview("host", "Shawn", "test");
      game = applyAction(game, "host", { type: "draw", source: -1 });
      game = applyAction(game, "host", { type: "draw", source: -1 });
      const roomId = await ctx.db.insert("rooms", {
        code: "TESTROOM",
        game,
        revision: 0,
        createdAt: 0,
        updatedAt: 0,
      });
      const room = (await ctx.db.get(roomId))!;
      await saveResult(ctx, room, game);
      await saveResult(ctx, room, game);
      expect(await ctx.db.query("results").collect()).toHaveLength(1);
      const links = await ctx.db.query("playerResults").collect();
      expect(links).toHaveLength(1);
      expect(links[0].user).toBe(id);
      expect(links[0].score).toBe(80);
      await saveResult(
        ctx,
        { ...room, preview: true },
        { ...game, roundId: 999 },
      );
      expect(await ctx.db.query("results").collect()).toHaveLength(1);
    });
  });
});
