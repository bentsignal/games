import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../services/convex/convex/schema";
import { api } from "../services/convex/convex/_generated/api";
import { signTicket, verifyTicket } from "../shared/realtimeAuth";
const modules = import.meta.glob("../services/convex/convex/**/*.{ts,js}");
afterEach(() => vi.unstubAllEnvs());
it("requires accounts for connection and saves authenticated results exactly once", async () => {
  vi.stubEnv("GRAMS_REALTIME_SECRET", "test-only-secret");
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.realtime.connect, {})).rejects.toThrow("Sign in");
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      username: "Alice",
      usernameKey: "alice",
    });
    await ctx.db.patch(id, { playerId: id });
    return id;
  });
  const client = t.withIdentity({ subject: userId });
  const ticket = await client.mutation(api.realtime.connect, {});
  const identity = verifyTicket(ticket, "test-only-secret", "grams:friends");
  expect(identity.userId).toBe(userId);
  const scoped = await client.mutation(api.realtime.connect, {
    code: "ABCD2345",
    create: true,
  });
  expect(
    verifyTicket(scoped, "test-only-secret", "grams:ABCD2345"),
  ).toMatchObject({ userId, create: true });
  expect(() =>
    verifyTicket(scoped, "test-only-secret", "grams:EFGH6789"),
  ).toThrow();
  await expect(
    client.mutation(api.realtime.connect, { code: "bad" }),
  ).rejects.toThrow("eight-character");
  await expect(
    client.mutation(api.realtime.connect, { create: true }),
  ).rejects.toThrow("Lobby code required");
  await expect(
    t.mutation(api.realtime.saveResult, { token: ticket }),
  ).rejects.toThrow();
  const result = {
    id: "round-1",
    round: 1,
    startedAt: 1,
    finishedAt: 2,
    word: "listen",
    players: [{ id: userId, userId, score: 50, words: ["ten"] }],
  };
  const sign = (r: unknown, secret = "test-only-secret") =>
    signTicket(
      {
        iss: "games-realtime",
        aud: "grams:result",
        exp: Date.now() / 1000 + 60,
        result: r,
      },
      secret,
    );
  await expect(
    t.mutation(api.realtime.saveResult, {
      token: sign(result, "wrong-secret"),
    }),
  ).rejects.toThrow();
  const token = sign(result);
  const first = await t.mutation(api.realtime.saveResult, { token });
  expect(await t.mutation(api.realtime.saveResult, { token })).toBe(first);
  const saved = await t.run((ctx) => ctx.db.query("gramsRounds").collect());
  expect(saved).toHaveLength(1);
  expect(saved[0].players[0]).toMatchObject({
    userId,
    name: "Alice",
    score: 50,
  });
  await expect(
    t.mutation(api.realtime.saveResult, {
      token: sign({
        ...result,
        id: "bad",
        players: [{ ...result.players[0], id: "another-person" }],
      }),
    }),
  ).rejects.toThrow("Invalid result player");
});
