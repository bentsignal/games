import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { applyAction, expireTurn, type Game } from "../src/game/engine";
import { endingPreview } from "../src/game/ending-preview";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => vi.useRealTimers());

it("draws only the remaining cards, keeps pending tickets, and handles an empty deck", () => {
  const g = endingPreview("host", "Host", "timer");
  g.finalTurns = null;
  const hand = g.players[0].hand.length;
  expect(expireTurn(g).players[0].hand.length).toBe(hand + 2);
  const first = applyAction(g, "host", { type: "draw", source: -1 });
  const finished = expireTurn(first);
  expect(finished.players[0].hand.length).toBe(hand + 2);
  expect(finished.turnNumber).toBe(g.turnNumber + 1);
  const picking = applyAction(g, "host", { type: "tickets" });
  const kept = expireTurn(picking);
  expect(kept.players[0].pending).toEqual([]);
  expect(kept.players[0].tickets.length).toBe(g.players[0].tickets.length + 1);
  expect(kept.players[0].hand.length).toBe(hand);
  const empty = { ...g, deck: [], discard: [] };
  expect(expireTurn(empty).turnNumber).toBe(g.turnNumber + 1);
});

it("enforces host-only setup, preserves deadlines across draws, rejects stale jobs and finishes final rounds", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const hostId = await t.run((ctx) =>
    ctx.db.insert("users", { username: "Host", usernameKey: "host" }),
  );
  const friendId = await t.run((ctx) =>
    ctx.db.insert("users", { username: "Friend", usernameKey: "friend" }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(hostId, { playerId: hostId });
    await ctx.db.patch(friendId, { playerId: friendId });
  });
  const host = t.withIdentity({ subject: hostId }),
    friend = t.withIdentity({ subject: friendId });
  const token = "";
  const code = await host.mutation(api.rooms.create, {
    token,
    name: "Host",
    mode: "classic",
  });
  await friend.mutation(api.rooms.join, { token, code, name: "Friend" });
  const read = () =>
    t.run((ctx) =>
      ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique(),
    );
  expect((await read())!.game.turnSeconds ?? 0).toBe(0);
  await expect(
    friend.mutation(api.rooms.manage, {
      token,
      code,
      operation: "timer",
      turnSeconds: 30,
    }),
  ).rejects.toThrow("host");
  await host.mutation(api.rooms.manage, {
    token,
    code,
    operation: "timer",
    turnSeconds: 30,
  });
  const play = async (user: typeof host, action: any) =>
    user.mutation(api.rooms.play, {
      token,
      code,
      revision: (await read())!.revision,
      action,
    });
  await play(host, { type: "start" });
  let room = (await read())!;
  expect(room.game.turnDeadline).toBeUndefined();
  await play(host, {
    type: "keep",
    tickets: room.game.players[0].pending.slice(0, 2),
  });
  room = (await read())!;
  await play(friend, {
    type: "keep",
    tickets: room.game.players[1].pending.slice(0, 2),
  });
  room = (await read())!;
  const deadline = room.game.turnDeadline;
  expect(deadline).toBe(Date.now() + 30000);
  await expect(
    host.mutation(api.rooms.manage, {
      token,
      code,
      operation: "timer",
      turnSeconds: 60,
    }),
  ).rejects.toThrow("started");
  const hand = room.game.players[0].hand.length;
  await play(host, { type: "draw", source: -1 });
  expect((await read())!.game.turnDeadline).toBe(deadline);
  const args = {
    roomId: room._id,
    deadline,
    turn: room.game.turnNumber,
    round: room.game.roundId,
  };
  await t.mutation(internal.rooms.timeout, args);
  expect((await read())!.game.turnNumber).toBe(room.game.turnNumber);
  vi.setSystemTime(deadline + 1);
  await t.mutation(internal.rooms.timeout, args);
  const after = (await read())!;
  expect(after.game.players[0].hand.length).toBe(hand + 2);
  expect(after.game.turnNumber).toBe(room.game.turnNumber + 1);
  await t.mutation(internal.rooms.timeout, args);
  expect((await read())!.revision).toBe(after.revision);
  await t.run((ctx) =>
    ctx.db.patch(after._id, { game: { ...after.game, finalTurns: 1 } }),
  );
  vi.setSystemTime(after.game.turnDeadline + 1);
  // A late submitted move also expires the turn, even before the scheduler runs.
  await play(friend, { type: "tickets" });
  const final = (await read())!;
  expect(final.game.phase).toBe("finished");
  expect(final.game.turnDeadline).toBeUndefined();
  expect(final.game.results).toHaveLength(2);
  await host.mutation(api.rooms.manage, { token, code, operation: "rematch" });
  expect((await read())!.game.turnSeconds).toBe(30);
  expect((await read())!.game.turnDeadline).toBeUndefined();
});
