import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "../../services/convex/convex/_generated/api";
import { gramsCodePattern, newGramsCode } from "../../shared/gramsRooms";

export default function Grams() {
  const code = location.pathname
    .match(/^\/grams\/room\/([^/]+)\/?$/)?.[1]
    ?.toUpperCase();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState(
    "Connecting to lobby…",
  );
  const [copyStatus, setCopyStatus] = useState("");
  const valid = code !== undefined && gramsCodePattern.test(code);
  const creating = useRef(new URLSearchParams(location.search).has("create"));
  const frame = useRef<HTMLIFrameElement>(null);
  const client = useConvex();
  useEffect(() => {
    if (!valid) return;
    let stopped = false,
      socket: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempt = 0,
      state: any,
      feed: any,
      reconnect = false;
    const pending = new Set<number>();
    const post = (data: unknown) =>
      frame.current?.contentWindow?.postMessage(data, location.origin);
    const status = (connected: boolean) => {
      post({ type: "grams-connection", connected });
      setConnectionStatus(connected ? "" : "Reconnecting to lobby…");
    };
    const failPending = () => {
      for (const request of pending)
        post({
          type: "grams-reply",
          request,
          error: "Connection interrupted. Reconnecting…",
        });
      pending.clear();
    };
    async function connect() {
      try {
        const ticket = await client.mutation(api.realtime.connect, {
          code,
          create: creating.current,
        });
        if (stopped) return;
        const endpoint = import.meta.env.VITE_GRAMS_URL;
        if (!endpoint) throw new Error("Grams server is not configured");
        const ws = new WebSocket(
          endpoint.replace(/^http/, "ws") + `/grams/${code}`,
          ["grams", ticket],
        );
        socket = ws;
        ws.onopen = () => {
          attempt = 0;
          setError("");
          status(true);
        };
        ws.onmessage = (e) => {
          if (e.data === "pong") return;
          const message = JSON.parse(e.data);
          if (message.type === "grams-error") {
            stopped = true;
            setError(message.error);
            failPending();
            ws.close();
            return;
          }
          if (message.type === "grams-state") {
            state = message.state;
            creating.current = false;
            history.replaceState({}, "", `/grams/room/${code}`);
            if (reconnect) {
              post({ type: "grams-resume" });
              reconnect = false;
            }
          }
          if (message.type === "grams-feed") feed = message.feed;
          if (message.type === "grams-score" && state) {
            state = {
              ...state,
              serverNow: message.serverNow,
              players: state.players.map((p: any) =>
                p.id === message.id ? { ...p, score: message.score } : p,
              ),
              me: message.me ?? state.me,
            };
            post({ type: "grams-state", state });
            return;
          }
          if (message.type === "grams-reply") pending.delete(message.request);
          post(message);
        };
        ws.onclose = () => {
          if (stopped) return;
          status(false);
          failPending();
          reconnect = true;
          queue();
        };
        ws.onerror = () => ws.close();
      } catch (error) {
        if (!stopped) {
          status(false);
          setConnectionStatus(
            error instanceof Error
              ? error.message
              : "Unable to connect to Grams.",
          );
          queue();
        }
      }
    }
    function queue() {
      clearTimeout(retry);
      retry = setTimeout(
        () => void connect(),
        Math.min(1000 * 2 ** attempt++, 15000),
      );
    }
    function receive(e: MessageEvent) {
      if (
        e.origin !== location.origin ||
        e.source !== frame.current?.contentWindow
      )
        return;
      if (e.data?.type === "grams-ready") {
        if (state) post({ type: "grams-state", state });
        if (feed) post({ type: "grams-feed", feed });
        status(socket?.readyState === WebSocket.OPEN);
        return;
      }
      if (e.data?.type !== "grams-command") return;
      if (socket?.readyState !== WebSocket.OPEN) {
        post({
          type: "grams-reply",
          request: e.data.request,
          error: "Reconnecting. Please try again in a moment.",
        });
        return;
      }
      pending.add(e.data.request);
      socket.send(JSON.stringify(e.data));
    }
    window.addEventListener("message", receive);
    const ping = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
    }, 30000);
    void connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      window.removeEventListener("message", receive);
      socket?.close();
    };
  }, [client, code, valid]);
  if (!valid || error)
    return (
      <main className="grams-lobbies">
        <a href="/">Games</a>
        <img src="/grams-assets/v1/images/logo_600.png" alt="Grams" />
        <h1>Play Grams with friends</h1>
        <p>Create a lobby and share its code. Up to six players can join.</p>
        {(error || code) && (
          <p role="alert">
            {error || "Enter an eight-character Grams lobby code."}
          </p>
        )}
        <button
          onClick={() =>
            location.assign(`/grams/room/${newGramsCode()}?create=1`)
          }
        >
          Create a lobby
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = input.trim().toUpperCase();
            if (!gramsCodePattern.test(normalized)) {
              setError("Enter an eight-character Grams lobby code.");
              return;
            }
            location.assign(`/grams/room/${normalized}`);
          }}
        >
          <label htmlFor="grams-code">Lobby code</label>
          <input
            id="grams-code"
            autoComplete="off"
            placeholder="ABCD2345"
            maxLength={8}
            value={input}
            onChange={(event) => setInput(event.target.value.toUpperCase())}
          />
          <button type="submit">Join lobby</button>
        </form>
      </main>
    );
  return (
    <div className="grams-shell">
      <iframe
        ref={frame}
        title="Grams"
        src="/grams-assets/v1/index.html"
        allow="autoplay"
      />
      <nav className="grams-room-nav" aria-label="Grams lobby">
        <a href="/grams">Lobbies</a>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${location.origin}/grams/room/${code}`,
              );
              setCopyStatus("Link copied");
            } catch {
              setCopyStatus("Copy the invitation link from the address bar");
            }
          }}
        >
          Invite friends · {code}
        </button>
        <span role="status">{connectionStatus || copyStatus}</span>
      </nav>
    </div>
  );
}
