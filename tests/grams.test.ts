import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../services/convex/convex/schema";
import { api, internal } from "../services/convex/convex/_generated/api";
import allow from "../services/convex/convex/gramsData/allow.json";
const modules = import.meta.glob("../services/convex/convex/**/*.{ts,js}");
afterEach(() => vi.useRealTimers());
it("authenticates Grams, validates letters and duplicates, conceals words, scores ties and saves accounts", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await expect(t.query(api.grams.view, {})).rejects.toThrow("Sign in");
  const accounts = await t.run(async (ctx) => {
    const ids = [];
    for (const name of ["Alice", "Bob"]) {
      const id = await ctx.db.insert("users", {
        username: name,
        usernameKey: name.toLowerCase(),
      });
      await ctx.db.patch(id, { playerId: id });
      ids.push(id);
    }
    return ids;
  });
  const [a, b] = accounts.map((subject) => t.withIdentity({ subject }));
  await a.mutation(api.grams.command, { kind: "requestJoin" });
  await b.mutation(api.grams.command, { kind: "requestJoin" });
  await expect(
    b.mutation(api.grams.command, { kind: "requestStart", size: 6 }),
  ).rejects.toThrow("host");
  await a.mutation(api.grams.command, { kind: "requestStart", size: 6 });
  let state = await a.query(api.grams.view, {});
  expect(state.word).toBe("");
  expect(state.letters).toHaveLength(6);
  expect(
    (
      await a.mutation(api.grams.command, {
        kind: "wordSubmit",
        word: state.letters.join(""),
      })
    )?.accepted,
  ).toBe(false);
  vi.setSystemTime(state.startAt + 1);
  const words = Object.values(allow).flatMap((groups) =>
    Object.values(groups).flat(),
  );
  const word = words.find((w) => {
    const pool = [...state.letters];
    return (
      w.length >= 3 &&
      [...w].every((c) => {
        const i = pool.indexOf(c);
        if (i < 0) return false;
        pool.splice(i, 1);
        return true;
      })
    );
  })!;
  expect(
    (await a.mutation(api.grams.command, { kind: "wordSubmit", word }))
      ?.accepted,
  ).toBe(true);
  vi.setSystemTime(Date.now() + 100);
  expect(
    (await a.mutation(api.grams.command, { kind: "wordSubmit", word }))
      ?.accepted,
  ).toBe(false);
  expect(
    (await b.mutation(api.grams.command, { kind: "wordSubmit", word }))
      ?.accepted,
  ).toBe(true);
  expect(
    (await b.query(api.grams.view, {})).players.find(
      (p) => p.id === accounts[0],
    )?.words,
  ).toEqual([]);
  vi.setSystemTime(state.endAt);
  await t.mutation(internal.grams.finish, { round: state.round });
  state = await a.query(api.grams.view, {});
  expect(state.players.map((p) => p.wins)).toEqual([1, 1]);
  expect(state.players.every((p) => p.words.includes(word))).toBe(true);
  await t.mutation(internal.grams.finish, { round: state.round });
  const saved = await t.run((ctx) => ctx.db.query("gramsRounds").collect());
  expect(saved).toHaveLength(1);
  expect(saved[0].players.map((p: any) => p.id).sort()).toEqual(
    accounts.sort(),
  );
  await a.mutation(api.grams.command, { kind: "leave" });
  const remaining = await b.query(api.grams.view, {});
  expect(remaining.host).toBe(remaining.id);
});
