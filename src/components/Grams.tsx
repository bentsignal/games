import { useEffect, useRef } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
export default function Grams() {
  const frame = useRef<HTMLIFrameElement>(null);
  const client = useConvex();
  useEffect(() => {
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
    const status = (connected: boolean) =>
      post({ type: "grams-connection", connected });
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
        const ticket = await client.mutation(api.realtime.connect, {});
        if (stopped) return;
        const endpoint = import.meta.env.VITE_GRAMS_URL;
        if (!endpoint) throw new Error("Grams server is not configured");
        const ws = new WebSocket(endpoint.replace(/^http/, "ws") + "/grams", [
          "grams",
          ticket,
        ]);
        socket = ws;
        ws.onopen = () => {
          attempt = 0;
          status(true);
        };
        ws.onmessage = (e) => {
          if (e.data === "pong") return;
          const message = JSON.parse(e.data);
          if (message.type === "grams-state") {
            state = message.state;
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
      } catch {
        if (!stopped) {
          status(false);
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
  }, [client]);
  return (
    <div className="grams-shell">
      <iframe
        ref={frame}
        title="Grams"
        src="/grams-assets/v1/index.html"
        allow="autoplay"
      />
      <a className="grams-home" href="/" aria-label="Back to games">
        Games
      </a>
    </div>
  );
}
