import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useOptimistic,
  startTransition,
} from "react";
import { useConvex } from "convex/react";
import { api } from "../../services/convex/convex/_generated/api";
import type {
  RoomView,
  ChatMessage,
  Command,
} from "../../shared/ticketProtocol";
import type { Action, Game } from "./engine";
import type { Mode } from "./data";
import { TicketSocket } from "./ticketSocket";
import { optimisticRoom } from "./optimisticRoom";
type RoomArgs = { code: string };
type ChatPage = { messages: ChatMessage[]; more: boolean };
const endpoint = () => {
  const url = import.meta.env.VITE_GRAMS_URL;
  if (!url) throw new Error("Game server is not configured.");
  return url.replace(/\/$/, "");
};
export function useTicketRoom(code: string) {
  const client = useConvex();
  const activeCode = useRef(code);
  activeCode.current = code;
  const tableChanges = useRef<Promise<unknown>>(Promise.resolve());
  const channel = useRef<{ code: string; requests: TicketSocket } | null>(null);
  const [snapshot, setSnapshot] = useState<{
    code: string;
    room: RoomView | null;
  }>();
  const [connection, setConnection] = useState("");
  const [chat, setChat] = useState<{
    code: string;
    messages: ChatMessage[];
    more: boolean;
  }>({ code: "", messages: [], more: false });
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const [room, addOptimisticMove] = useOptimistic(
    snapshot?.code === code ? snapshot.room : undefined,
    optimisticRoom,
  );
  const request = useCallback(
    <T>(roomCode: string, args: Command): Promise<T> => {
      if (channel.current?.code !== roomCode)
        return Promise.reject(
          new Error("Reconnecting. Please try again when connected."),
        );
      return channel.current.requests.request<T>(args);
    },
    [],
  );
  const mergeChat = useCallback(
    (roomCode: string, messages: ChatMessage[], more?: boolean) => {
      if (activeCode.current !== roomCode) return;
      setChat((old) => {
        const prior =
          old.code === roomCode
            ? old
            : { code: roomCode, messages: [], more: false };
        const all = new Map(prior.messages.map((m) => [m._id, m]));
        for (const m of messages) all.set(m._id, m);
        return {
          code: roomCode,
          messages: [...all.values()].sort((a, b) =>
            b._id.localeCompare(a._id),
          ),
          more: more ?? prior.more,
        };
      });
    },
    [],
  );
  useEffect(() => {
    if (!code) return;
    let stopped = false,
      ws: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempt = 0,
      lastMessage = Date.now();
    let requests: TicketSocket | undefined;
    async function connect() {
      try {
        const token = await client.mutation(api.ticket.connect, { code });
        if (stopped) return;
        ws = new WebSocket(
          `${endpoint().replace(/^http/, "ws")}/ticket/${code}`,
          ["ticket", token],
        );
        const socket = ws;
        const current = new TicketSocket(socket);
        requests = current;
        socket.onmessage = (e) => {
          if (stopped) return;
          lastMessage = Date.now();
          if (e.data === "pong") return;
          const message = JSON.parse(e.data);
          if (
            message.type === "state" ||
            (message.type === "reply" && "room" in message)
          ) {
            setSnapshot((old) =>
              old?.code === code &&
              old.room &&
              message.room &&
              old.room.revision >= message.room.revision
                ? old
                : { code, room: message.room },
            );
            setConnection(code);
            attempt = 0;
          }
          if (message.type === "reply") current.reply(message);
          if (message.type === "chat") mergeChat(code, [message.message]);
        };
        socket.onopen = () => {
          if (stopped) {
            socket.close();
            return;
          }
          channel.current = { code, requests: current };
          lastMessage = Date.now();
          // Subscribe before loading history so messages sent during the read are merged.
          void request<ChatPage>(code, { kind: "chat" })
            .then((page) => {
              if (!stopped) mergeChat(code, page.messages, page.more);
            })
            .catch(() => {});
        };
        socket.onclose = () => {
          current.close();
          if (channel.current?.requests === current) channel.current = null;
          if (!stopped) {
            setConnection("");
            queue();
          }
        };
        socket.onerror = () => socket.close();
      } catch {
        if (!stopped) {
          setConnection("");
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
    const ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        if (Date.now() - lastMessage > 65000) ws.close();
        else ws.send("ping");
      }
    }, 30000);
    const renew = setInterval(() => ws?.close(), 50 * 60000);
    void connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      clearInterval(renew);
      requests?.close();
      if (channel.current?.requests === requests) channel.current = null;
      ws?.close();
    };
  }, [code, client, request, mergeChat]);
  const methods = useMemo(
    () => ({
      create: async (args: { mode: Mode; endingPreview?: boolean }) => {
        const created = await client.mutation(api.ticket.create, {
          mode: args.mode,
          endingPreview: args.endingPreview,
        });
        // Room creation is the only HTTP command, before a room socket exists.
        const response = await fetch(`${endpoint()}/ticket/${created.code}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${created.token}`,
          },
          body: JSON.stringify({ kind: "create" }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (!response.ok || data.error)
          throw new Error(data.error ?? "Could not create the room.");
        return created.code;
      },
      join: (args: RoomArgs) => request<string>(args.code, { kind: "join" }),
      play: (args: RoomArgs & { revision: number; action: Action }) =>
        new Promise<unknown>((resolve, reject) => {
          startTransition(async () => {
            addOptimisticMove(args);
            try {
              resolve(
                await request(args.code, {
                  kind: "play",
                  revision: args.revision,
                  action: args.action,
                }),
              );
            } catch (error) {
              reject(error);
            }
          });
        }),
      manage: (
        args: RoomArgs & {
          operation:
            | "bot"
            | "remove"
            | "mode"
            | "timer"
            | "rematch"
            | "leave"
            | "resign";
          player?: string;
          mode?: Mode;
          turnSeconds?: Game["turnSeconds"];
        },
      ) => {
        // Preserve the order of setup actions and their acknowledgements.
        const task = tableChanges.current
          .catch(() => {})
          .then(() => request(args.code, { ...args, kind: "manage" }));
        tableChanges.current = task;
        return task;
      },
      send: (args: RoomArgs & { text: string }) =>
        request(args.code, { kind: "send", text: args.text }),
      get: (args: RoomArgs) =>
        request<RoomView | null>(args.code, { kind: "get" }),
    }),
    [client, request, addOptimisticMove],
  );
  const loadMore = useCallback(
    (_count: number) => {
      const current = chatRef.current;
      if (current.code !== code) return;
      const before = current.messages.at(-1)?._id;
      void request<ChatPage>(code, { kind: "chat", before })
        .then((page) => mergeChat(code, page.messages, page.more))
        .catch(() => {});
    },
    [code, request, mergeChat],
  );
  return {
    ...methods,
    room,
    confirmedRoom: snapshot?.code === code ? snapshot.room : undefined,
    connectedServer: !code || connection === code,
    messages: chat.code === code ? chat.messages : [],
    chatStatus: chat.code === code && chat.more ? "CanLoadMore" : "Exhausted",
    loadMoreChat: loadMore,
  };
}
