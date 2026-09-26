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

test("local order and identity survive out-of-order delivery, broadcasts, history and clock skew", () => {
  const chat = createTicketChat();
  const sent = ["z", "a", "m"].map((id) => ({
    ...pending,
    _id: id,
    clientId: id,
    text: id,
    time: 100,
  }));
  sent.forEach((m) => chat.pending(m));
  const keys = chat.getSnapshot().messages.map(chat.keyFor);
  const order = () =>
    chat
      .getSnapshot()
      .messages.filter((m) => m.clientId !== "older")
      .map((m) => m.text);
  expect(order()).toEqual(["z", "a", "m"]);
  for (const index of [0, 2, 1]) {
    const delivered = {
      ...sent[index],
      _id: `chat:${index}`,
      time: 1000 + index,
    };
    chat.merge([delivered]);
    expect(order()).toEqual(["z", "a", "m"]);
    chat.acknowledge(sent[index].clientId, delivered);
    chat.merge([delivered]);
    expect(order()).toEqual(["z", "a", "m"]);
    expect(chat.getSnapshot().messages.map(chat.keyFor)).toEqual(keys);
  }
  chat.merge(
    [{ ...confirmed, _id: "older", clientId: "older", time: 1 }],
    true,
  );
  expect(chat.getSnapshot().messages.map((m) => m.time)).toEqual([
    1, 1000, 1001, 1002,
  ]);
});

test("acknowledgement preserves spectator order and identity after sender resolution", () => {
  const chat = createTicketChat();
  chat.pending({ ...pending, sender: "spectator-name" });
  const key = chat.keyFor(chat.getSnapshot().messages[0]);
  chat.pending({ ...pending, _id: "next", clientId: "next", time: 3 });
  chat.merge([{ ...confirmed, time: 50 }]);
  chat.acknowledge("local", { ...confirmed, time: 50 });
  expect(chat.getSnapshot().messages.map((m) => m.clientId)).toEqual([
    "local",
    "next",
  ]);
  expect(chat.keyFor(chat.getSnapshot().messages[0])).toBe(key);
});

test("new local sends append even when the local clock is behind server history", () => {
  const chat = createTicketChat();
  chat.merge([
    { ...confirmed, clientId: "history", _id: "chat:history", time: 5000 },
  ]);
  chat.pending({ ...pending, time: 100 });
  chat.pending({ ...pending, _id: "next", clientId: "next", time: 90 });
  expect(chat.getSnapshot().messages.map((m) => m.clientId)).toEqual([
    "history",
    "local",
    "next",
  ]);
  chat.acknowledge("local", { ...confirmed, time: 6000 });
  expect(chat.getSnapshot().messages.map((m) => m.clientId)).toEqual([
    "history",
    "local",
    "next",
  ]);
});
