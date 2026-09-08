import { it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
it("resets only the requested owned preview and renews its round/revision", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      username: "PreviewOwner",
      usernameKey: "previewowner",
    });
    await ctx.db.patch(id, { playerId: id });
  });
  const links = await t.mutation(internal.playtest.createEndings, {
    username: "PreviewOwner",
  });
  const winning = links
    .find((l) => l.outcome === "win")!
    .url.split("/")
    .pop()!;
  const losing = links
    .find((l) => l.outcome === "lose")!
    .url.split("/")
    .pop()!;
  const read = (code: string) =>
    t.run((ctx) =>
      ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique(),
    );
  const beforeWin = (await read(winning))!,
    beforeLoss = await read(losing);
  await t.run((ctx) =>
    ctx.db.patch(beforeWin._id, {
      game: { ...beforeWin.game, phase: "finished", finalTurns: 0 },
      revision: 7,
    }),
  );
  await t.mutation(internal.playtest.resetEnding, {
    username: "PreviewOwner",
    code: winning,
    outcome: "win",
  });
  const after = (await read(winning))!;
  expect(after.game.phase).toBe("playing");
  expect(after.game.finalTurns).toBeNull();
  expect(after.game.roundId).toBeGreaterThan(beforeWin.game.roundId);
  expect(after.revision).toBe(8);
  expect(await read(losing)).toEqual(beforeLoss);
  await t.run((ctx) => ctx.db.patch(after._id, { preview: false }));
  await expect(
    t.mutation(internal.playtest.resetEnding, {
      username: "PreviewOwner",
      code: winning,
      outcome: "win",
    }),
  ).rejects.toThrow("preview");
});
