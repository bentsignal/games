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
  function publish(messages: ChatEntry[], more = snapshot.more) {
    snapshot = {
      messages: messages.sort(
        (a, b) => a.time - b.time || a._id.localeCompare(b._id),
      ),
      more,
    };
    for (const listener of listeners) listener();
  }
  return {
    code,
    getSnapshot: () => snapshot,
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
          )
            all.delete(id);
        }
        all.set(message._id, message);
      }
      publish([...all.values()], more);
    },
    acknowledge(clientId: string, message: ChatMessage | null) {
      // The reply identifies the outgoing message even for a spectator without a player ID.
      snapshot = {
        ...snapshot,
        messages: snapshot.messages.filter((entry) => entry._id !== clientId),
      };
      if (message) this.merge([message]);
      else publish([...snapshot.messages]);
    },
    pending(message: ChatMessage) {
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
