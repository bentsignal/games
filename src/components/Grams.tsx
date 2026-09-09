import { useEffect, useRef } from "react";
import { useConvex, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
export default function Grams() {
  const frame = useRef<HTMLIFrameElement>(null);
  const client = useConvex();
  const state = useQuery(api.grams.view, {});
  const feed = useQuery(api.grams.feed, {});
  const latestFeed = useRef(feed);
  latestFeed.current = feed;
  const latest = useRef(state);
  latest.current = state;
  const post = (message: unknown) =>
    frame.current?.contentWindow?.postMessage(message, location.origin);
  useEffect(() => {
    if (feed) post({ type: "grams-feed", feed });
  }, [feed]);
  useEffect(() => {
    if (state) post({ type: "grams-state", state });
  }, [state]);
  useEffect(() => {
    const receive = async (e: MessageEvent) => {
      if (
        e.origin !== location.origin ||
        e.source !== frame.current?.contentWindow
      )
        return;
      if (e.data?.type === "grams-ready") {
        if (latest.current)
          post({ type: "grams-state", state: latest.current });
        if (latestFeed.current)
          post({ type: "grams-feed", feed: latestFeed.current });
        return;
      }
      if (e.data?.type !== "grams-command") return;
      try {
        const result = await client.mutation(api.grams.command, e.data.args);
        post({ type: "grams-reply", request: e.data.request, result });
      } catch (error) {
        post({
          type: "grams-reply",
          request: e.data.request,
          error:
            error instanceof ConvexError
              ? String(error.data)
              : "Could not connect. Try again.",
        });
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [client]);
  useEffect(() => {
    if (!state?.me) return;
    const interval = setInterval(
      () => void client.mutation(api.grams.heartbeat, {}).catch(() => {}),
      30000,
    );
    return () => clearInterval(interval);
  }, [client, !!state?.me]);
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
