import type { ChatMessage } from "../../shared/ticketProtocol";

export type ChatEntry = ChatMessage & { pending?: boolean; error?: string };
export type ChatPage = { messages: ChatMessage[]; more: boolean };

// A room owns one chat store. Only chat subscribers update when messages arrive.
export function createTicketChat(code = "") {
  let snapshot: { messages: ChatEntry[]; more: boolean } = {
    messages: [],
    more: false,
  };
  const listeners = new Set<() => void>();
  // Delivery time is display data. A locally appended message keeps its place
  // and React identity when its server ID, timestamp or sender is confirmed.
  const positions = new Map<
    string,
    { time: number; tie: string; key: string }
  >();
  let sequence = 0;
  const position = (message: ChatEntry) =>
    positions.get(message._id) ?? {
      time: message.time,
      tie: message._id,
      key: message._id,
    };
  function transfer(from: string, to: string) {
    const saved = positions.get(from);
    if (saved) positions.set(to, saved);
    if (from !== to) positions.delete(from);
  }
  function publish(messages: ChatEntry[], more = snapshot.more) {
    snapshot = {
      messages: messages.sort(
        (a, b) =>
          position(a).time - position(b).time ||
          position(a).tie.localeCompare(position(b).tie),
      ),
      more,
    };
    for (const listener of listeners) listener();
  }
  return {
    code,
    getSnapshot: () => snapshot,
    keyFor: (message: ChatEntry) => position(message).key,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    merge(messages: ChatMessage[], more?: boolean) {
      const all = new Map(
        snapshot.messages.map((message) => [message._id, message]),
      );
      for (const message of messages) {
        // Match both identity and client ID. Another sender cannot settle our draft.
        for (const [id, entry] of all) {
          if (
            message.clientId &&
            entry.clientId === message.clientId &&
            entry.sender === message.sender
          ) {
            transfer(id, message._id);
            all.delete(id);
          }
        }
        all.set(message._id, message);
      }
      publish([...all.values()], more);
    },
    acknowledge(clientId: string, message: ChatMessage | null) {
      // The reply identifies the outgoing message even for a spectator without a player ID.
      if (message) transfer(clientId, message._id);
      else positions.delete(clientId);
      snapshot = {
        ...snapshot,
        messages: snapshot.messages.filter((entry) => entry._id !== clientId),
      };
      if (message) this.merge([message]);
      else publish([...snapshot.messages]);
    },
    pending(message: ChatMessage) {
      const last = snapshot.messages.at(-1);
      positions.set(message._id, {
        time: Math.max(message.time, last ? position(last).time : message.time),
        tie: `\ufffflocal:${String(++sequence).padStart(12, "0")}`,
        key: `local:${message._id}`,
      });
      publish([...snapshot.messages, { ...message, pending: true }]);
    },
    fail(id: string, error: string) {
      publish(
        snapshot.messages.map((message) =>
          message._id === id && message.pending
            ? { ...message, pending: false, error }
            : message,
        ),
      );
    },
  };
}
export type TicketChatStore = ReturnType<typeof createTicketChat>;
