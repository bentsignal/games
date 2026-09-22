import { afterEach, expect, it, vi } from "vitest";
import { TicketSocket } from "../src/game/ticketSocket";
import { optimisticRoom } from "../src/game/optimisticRoom";
import {
  newGame,
  newPlayer,
  playerView,
  applyAction,
} from "../src/game/engine";
import type { RoomView } from "../shared/ticketProtocol";
afterEach(() => vi.useRealTimers());
it("correlates replies and rejects interrupted moves without replaying them", async () => {
  const socket = { readyState: 1 as const, send: vi.fn(), close: vi.fn() };
  const client = new TicketSocket(socket);
  const first = client.request({ kind: "get" }),
    second = client.request({ kind: "chat" });
  client.reply({ request: 2, result: "chat" });
  client.reply({ request: 1, result: "state" });
  expect(await first).toBe("state");
  expect(await second).toBe("chat");
  const pending = client.request({ kind: "join" });
  const rejected = expect(pending).rejects.toThrow("interrupted");
  client.close();
  await rejected;
  client.reply({ request: 3, result: "late" });
  expect(socket.send).toHaveBeenCalledTimes(3);
});
it("times out an unconfirmed move and closes the connection for authoritative recovery", async () => {
  vi.useFakeTimers();
  const socket = { readyState: 1 as const, send: vi.fn(), close: vi.fn() };
  const client = new TicketSocket(socket);
  const failed = expect(client.request({ kind: "join" })).rejects.toThrow(
    "not confirmed",
  );
  await vi.advanceTimersByTimeAsync(15000);
  await failed;
  expect(socket.close).toHaveBeenCalledOnce();
  expect(socket.send).toHaveBeenCalledOnce();
});
it("predicts only a valid visible claim and rebases without applying payment twice", () => {
  const game = newGame("classic", newPlayer("alice", "Alice", 0));
  game.players.push(newPlayer("bob", "Bob", 1));
  game.phase = "playing";
  game.players[0].hand = ["red", "wild"];
  const room: RoomView = {
    code: "ABCDEFGH",
    revision: 4,
    serverNow: 1,
    seats: 2,
    phase: "playing",
    game: playerView(game, "alice"),
  };
  const move = {
    code: room.code,
    revision: 4,
    action: {
      type: "claim" as const,
      route: "r1",
      color: "red" as const,
      wilds: 0,
    },
  };
  const projected = optimisticRoom(room, move)!;
  const authoritative = playerView(
    applyAction(game, "alice", move.action),
    "alice",
  );
  expect(projected.game.me?.hand).toEqual(authoritative.me?.hand);
  expect(projected.game.me?.score).toBe(authoritative.me?.score);
  expect(projected.game.me?.trains).toBe(authoritative.me?.trains);
  expect(projected.game.claimed).toEqual(authoritative.claimed);
  expect(projected.game.turn).toBe(room.game.turn);
  expect(room.game.claimed).toEqual({});
  expect(room.game.me?.hand).toEqual(["red", "wild"]);
  const confirmed = { ...room, revision: 5, game: authoritative };
  expect(optimisticRoom(confirmed, move)).toBe(confirmed);
  expect(optimisticRoom(room, { ...move, code: "BCDEFGHJ" })).toBe(room);
  expect(
    optimisticRoom(room, { ...move, action: { ...move.action, wilds: 3 } }),
  ).toBe(room);
  expect(
    optimisticRoom(room, { ...move, action: { type: "draw", source: -1 } }),
  ).toBe(room);
});
