import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { Send } from "lucide-react";
import { clientId } from "../clientId";
import type { TicketChatStore } from "../game/ticketChat";
import { diagnosticMeasure } from "../game/diagnostics";

export function ChatCount({ chat }: { chat: TicketChatStore }) {
  const { messages } = useSyncExternalStore(chat.subscribe, chat.getSnapshot);
  return (
    <span>
      {messages.filter((message) => !message.pending && !message.error).length}
    </span>
  );
}

export default function TicketChat({
  chat,
  code,
  name,
  playerId,
  active,
  send,
  loadMore,
}: {
  chat: TicketChatStore;
  code: string;
  name: string;
  playerId?: string;
  active: boolean;
  send: (args: {
    code: string;
    text: string;
    clientId: string;
  }) => Promise<void>;
  loadMore: () => Promise<void>;
}) {
  const { messages, more } = useSyncExternalStore(
    chat.subscribe,
    chat.getSnapshot,
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const older = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!active || !box.current) return;
    const prior = older.current;
    box.current.scrollTop = prior
      ? prior.top + box.current.scrollHeight - prior.height
      : box.current.scrollHeight;
    older.current = null;
  }, [messages, active]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || inFlight.current) return;
    const started = performance.now();
    diagnosticMeasure("chat-input-delay", event.timeStamp);
    const id = clientId();
    inFlight.current = true;
    setSending(true);
    setDraft("");
    chat.pending({
      _id: id,
      clientId: id,
      sender: playerId ?? name,
      name,
      text,
      time: Date.now(),
    });
    requestAnimationFrame(() =>
      diagnosticMeasure("chat-pending-frame", started),
    );
    void send({ code, text, clientId: id })
      .catch((reason: unknown) => {
        chat.fail(
          id,
          reason instanceof Error
            ? reason.message
            : "Message could not be sent.",
        );
      })
      .finally(() => {
        inFlight.current = false;
        setSending(false);
      });
  }
  function loadOlder() {
    if (loading) return;
    if (box.current)
      older.current = {
        height: box.current.scrollHeight,
        top: box.current.scrollTop,
      };
    setLoading(true);
    setError("");
    void loadMore()
      .catch(() => {
        older.current = null;
        setError("Could not load older messages. Please try again.");
      })
      .finally(() => setLoading(false));
  }
  return (
    <div className="chat-box" hidden={!active}>
      <div
        className="messages"
        ref={box}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
      >
        {more && (
          <button
            className="text-button"
            disabled={loading}
            onClick={loadOlder}
          >
            Load older messages
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        {messages.length ? (
          messages.map((message) => (
            <div
              className={`message ${message.sender === playerId || message.pending || message.error ? "own" : ""}`}
              key={
                message.clientId
                  ? `${message.sender}:${message.clientId}`
                  : message._id
              }
            >
              <div>
                <strong>{message.name}</strong>
                <time>
                  {new Date(message.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>{message.text}</p>
              {message.pending && <small role="status">Sending…</small>}
              {message.error && (
                <>
                  <small role="alert">Not confirmed: {message.error}</small>
                  <button
                    className="text-button"
                    disabled={!!draft}
                    onClick={() => setDraft(message.text)}
                  >
                    Copy to draft
                  </button>
                </>
              )}
            </div>
          ))
        ) : (
          <div className="empty-note">
            <Send size={25} />
            <p>No messages yet.</p>
          </div>
        )}
      </div>
      <form onSubmit={submit}>
        <input
          aria-label="Chat message"
          maxLength={500}
          placeholder="Message the table…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className="icon"
          aria-label="Send message"
          aria-busy={sending}
          disabled={sending || !draft.trim()}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
