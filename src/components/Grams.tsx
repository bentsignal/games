import { useEffect, useRef } from "react";
import { useConvex } from "convex/react";
import { api } from "../../services/convex/convex/_generated/api";
import { gramsCodePattern, newGramsCode } from "../../shared/gramsRooms";

export default function Grams({ username }: { username: string }) {
  const code = location.pathname
    .match(/^\/grams\/room\/([^/]+)\/?$/)?.[1]
    ?.toUpperCase();
  const valid = code !== undefined && gramsCodePattern.test(code);
  const creating = useRef(new URLSearchParams(location.search).has("create"));
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
    const lobby = {
      type: "grams-lobby",
      code: valid ? code : undefined,
      username,
      error: code && !valid ? "Enter an eight-character Grams lobby code." : "",
    };
    const pending = new Set<number>();
    const post = (data: unknown) =>
      frame.current?.contentWindow?.postMessage(data, location.origin);
    const status = (connected: boolean) => {
      post({ type: "grams-connection", connected });
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
          status(true);
        };
        ws.onmessage = (e) => {
          if (e.data === "pong") return;
          const message = JSON.parse(e.data);
          if (message.type === "grams-error") {
            stopped = true;
            lobby.error = message.error;
            post(lobby);
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
          post({
            type: "grams-connection",
            connected: false,
            message:
              error instanceof Error
                ? error.message
                : "Unable to connect to Grams.",
          });
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
        post(lobby);
        if (state) post({ type: "grams-state", state });
        if (feed) post({ type: "grams-feed", feed });
        if (valid) status(socket?.readyState === WebSocket.OPEN);
        return;
      }
      if (e.data?.type === "grams-create") {
        location.assign(`/grams/room/${newGramsCode()}?create=1`);
        return;
      }
      if (e.data?.type === "grams-join") {
        const next =
          typeof e.data.code === "string"
            ? e.data.code.trim().toUpperCase()
            : "";
        if (!gramsCodePattern.test(next)) {
          lobby.error = "Enter an eight-character Grams lobby code.";
          post(lobby);
        } else location.assign(`/grams/room/${next}`);
        return;
      }
      if (e.data?.type === "grams-left") {
        location.assign("/grams");
        return;
      }
      if (e.data?.type === "grams-invite" && valid) {
        void (async () => {
          let message = "Link copied";
          try {
            await navigator.clipboard.writeText(
              `${location.origin}/grams/room/${code}`,
            );
          } catch {
            message = "Copy the invitation link from the address bar";
          }
          post({ type: "grams-copy", message });
        })();
        return;
      }
      if (e.data?.type !== "grams-command" || !valid || stopped) return;
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
    post(lobby);
    if (valid) void connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      window.removeEventListener("message", receive);
      socket?.close();
    };
  }, [client, code, valid, username]);
  return (
    <div className="grams-shell">
      <iframe
        ref={frame}
        title="Grams"
        src="/grams-assets/v1/index.html"
        allow="autoplay"
      />
    </div>
  );
}
