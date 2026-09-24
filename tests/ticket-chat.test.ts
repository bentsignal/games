import { expect, test, vi } from "vitest";
import { createTicketChat } from "../src/game/ticketChat";
const pending = {
  _id: "local",
  clientId: "local",
  sender: "me",
  name: "Me",
  text: "hello",
  time: 2,
};
const confirmed = { ...pending, _id: "chat:000000000002" };

test("broadcast and acknowledgement settle a pending message once, in either order", () => {
  for (const broadcastFirst of [true, false]) {
    const chat = createTicketChat();
    const listener = vi.fn();
    const unsubscribe = chat.subscribe(listener);
    chat.pending(pending);
    if (broadcastFirst) chat.merge([confirmed]);
    chat.acknowledge(pending.clientId, confirmed);
    chat.merge([confirmed]);
    chat.fail(pending._id, "late interruption");
    expect(chat.getSnapshot().messages).toEqual([confirmed]);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    chat.merge([confirmed]);
    expect(listener).not.toHaveBeenCalled();
  }
});
test("another sender cannot settle a draft, and reconnect history replaces uncertain sends", () => {
  const chat = createTicketChat();
  chat.pending(pending);
  const other = { ...confirmed, sender: "other", _id: "chat:000000000001" };
  chat.merge([other]);
  expect(chat.getSnapshot().messages).toHaveLength(2);
  chat.fail("local", "Disconnected. Delivery is unknown.");
  expect(
    chat.getSnapshot().messages.find((m) => m._id === "local")?.error,
  ).toMatch(/unknown/);
  chat.merge([confirmed]);
  expect(chat.getSnapshot().messages).toHaveLength(2);
  expect(chat.getSnapshot().messages.every((m) => !m.error && !m.pending)).toBe(
    true,
  );
});
test("room stores are isolated and history merges preserve live messages and paging", () => {
  const first = createTicketChat(),
    second = createTicketChat();
  first.pending(pending);
  const before = second.getSnapshot();
  first.merge([confirmed], true);
  first.merge(
    [{ ...confirmed, _id: "chat:000000000001", clientId: "older", time: 1 }],
    false,
  );
  expect(first.getSnapshot().messages.map((m) => m.time)).toEqual([1, 2]);
  expect(first.getSnapshot().more).toBe(false);
  expect(second.getSnapshot()).toBe(before);
  expect(second.getSnapshot().messages).toEqual([]);
});
test("spectator acknowledgement replaces the temporary identity", () => {
  const chat = createTicketChat();
  chat.pending({ ...pending, sender: "spectator-name" });
  chat.merge([confirmed]);
  chat.acknowledge("local", confirmed);
  expect(chat.getSnapshot().messages).toEqual([confirmed]);
});

test("legacy server replies settle pending UI during a rolling deployment", () => {
  const chat = createTicketChat();
  chat.pending(pending);
  const legacy = { ...confirmed, clientId: undefined };
  chat.merge([legacy]);
  chat.acknowledge("local", null);
  expect(chat.getSnapshot().messages).toEqual([legacy]);
});
