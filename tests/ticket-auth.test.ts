import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../services/convex/convex/schema";
import { api } from "../services/convex/convex/_generated/api";
import { signTicket, verifyTicket } from "../shared/realtimeAuth";
const modules = import.meta.glob("../services/convex/convex/**/*.{ts,js}");
afterEach(() => vi.unstubAllEnvs());
it("issues scoped room tickets without storing live games and limits creation", async () => {
  vi.stubEnv("GRAMS_REALTIME_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.ticket.create, { mode: "mega" })).rejects.toThrow(
    "Sign in",
  );
  await expect(
    t.mutation(api.ticket.connect, { code: "ABCDEFGH" }),
  ).rejects.toThrow("Sign in");
  const id = await t.run((ctx) => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: id });
  await expect(
    user.mutation(api.ticket.create, { mode: "mega" }),
  ).rejects.toThrow("username");
  await user.mutation(api.users.onboard, { username: "Alice" });
  const created = await user.mutation(api.ticket.create, { mode: "mega" });
  const payload = verifyTicket(created.token, "test-secret", "ticket:room");
  expect(payload).toMatchObject({
    code: created.code,
    name: "Alice",
    userId: id,
    create: { mode: "mega" },
  });
  expect(created.code).toMatch(/^[A-Z2-9]{8}$/);
  const connection = await user.mutation(api.ticket.connect, {
    code: created.code,
  });
  expect(
    verifyTicket(connection, "test-secret", "ticket:room").create,
  ).toBeUndefined();
  expect(() =>
    verifyTicket(connection, "test-secret", "grams:friends"),
  ).toThrow();
  await expect(
    user.mutation(api.ticket.create, { mode: "mega" }),
  ).rejects.toThrow("wait");
  expect(await t.run((ctx) => ctx.db.query("rooms").collect())).toEqual([]);
  await expect(
    t.mutation(api.ticket.saveResult, { token: connection }),
  ).rejects.toThrow();
});
it("deduplicates signed completed rounds and credits account statistics", async () => {
  vi.stubEnv("GRAMS_REALTIME_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  const user = await t.run((ctx) =>
    ctx.db.insert("users", {
      playerId: "alice",
      username: "Alice",
      usernameKey: "alice",
    }),
  );
  const result = {
    id: "instance:1",
    code: "ABCDEFGH",
    roundId: 1,
    mode: "mega",
    finishedAt: 2,
    players: [{ id: "alice", name: "Alice", bot: false }],
    scores: [{ id: "alice", total: 42, winner: true }],
  };
  const token = signTicket(
    {
      iss: "games-realtime",
      aud: "ticket:result",
      exp: Date.now() / 1000 + 60,
      result,
    },
    "test-secret",
  );
  const saved = await t.mutation(api.ticket.saveResult, { token });
  expect(await t.mutation(api.ticket.saveResult, { token })).toBe(saved);
  expect(
    await t.run((ctx) => ctx.db.query("playerResults").collect()),
  ).toMatchObject([{ user, result: saved, score: 42, winner: true }]);
  expect(await t.run((ctx) => ctx.db.query("rooms").collect())).toEqual([]);
});
