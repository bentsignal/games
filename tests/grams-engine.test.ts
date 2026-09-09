import { expect, it } from "vitest";
import { fresh, command, finish, view, leave } from "../workers/grams/engine";
import { signTicket, verifyTicket } from "../shared/realtimeAuth";
const a = { id: "a", userId: "user-a", name: "Alice" },
  b = { id: "b", userId: "user-b", name: "Bob" };
it("validates guesses, host controls, deadlines, privacy, ties and recovery", () => {
  let s = fresh();
  command(s, a, { kind: "requestJoin" });
  command(s, b, { kind: "requestJoin" });
  expect(() => command(s, b, { kind: "requestStart", size: 6 })).toThrow(
    "host",
  );
  command(s, a, { kind: "requestStart", size: 6 }, 10000);
  const word = s.word;
  expect(command(s, a, { kind: "wordSubmit", word }, 11000).accepted).toBe(
    false,
  );
  expect(command(s, a, { kind: "wordSubmit", word }, 15000).accepted).toBe(
    true,
  );
  expect(command(s, a, { kind: "wordSubmit", word }, 15200).accepted).toBe(
    false,
  );
  expect(command(s, b, { kind: "wordSubmit", word }, 15000).accepted).toBe(
    true,
  );
  expect(view(s, b).players[0].words).toEqual([]);
  expect(view(s, a).me?.words).toEqual([word]);
  s = JSON.parse(JSON.stringify(s));
  expect(view(s, a).me?.score).toBe(600);
  expect(finish(s, s.endAt - 1)).toBe(false);
  expect(finish(s, s.endAt)).toBe(true);
  expect(finish(s, s.endAt + 1)).toBe(false);
  expect(s.players.map((p) => p.wins)).toEqual([1, 1]);
  expect(view(s, a).players[1].words).toEqual([word]);
  leave(s, a.id);
  expect(s.host).toBe(b.id);
});
it("rejects invalid payloads and preserves letter multiplicity", () => {
  const s = fresh();
  command(s, a, { kind: "requestJoin" });
  command(s, a, { kind: "requestStart" }, 1000);
  s.letters = ["c", "a", "t", "d", "o", "g"];
  expect(
    command(s, a, { kind: "wordSubmit", word: "cacao" }, 10000).accepted,
  ).toBe(false);
  expect(() => command(s, a, { kind: "wordSubmit", word: 123 })).toThrow();
  expect(() => command(s, a, { kind: "requestStart", size: 1000 })).toThrow();
  expect(() => command(s, a, { kind: "admin" })).toThrow();
});
it("auth tickets are signed, scoped, short lived and bound to their environment", () => {
  const ticket = signTicket(
    { iss: "games-realtime", aud: "grams:friends", exp: 100, ...a },
    "test-secret",
  );
  expect(
    verifyTicket(ticket, "test-secret", "grams:friends", 99000).userId,
  ).toBe(a.userId);
  expect(() =>
    verifyTicket(ticket, "test-secret", "grams:friends", 100000),
  ).toThrow();
  expect(() =>
    verifyTicket(ticket, "other-environment", "grams:friends", 99000),
  ).toThrow();
  expect(() =>
    verifyTicket(ticket, "test-secret", "grams:result", 99000),
  ).toThrow();
  const parts = ticket.split(".");
  parts[1] = btoa(
    JSON.stringify({
      iss: "games-realtime",
      aud: "grams:friends",
      exp: 100,
      ...b,
    }),
  );
  expect(() =>
    verifyTicket(parts.join("."), "test-secret", "grams:friends", 99000),
  ).toThrow();
});
