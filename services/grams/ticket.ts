import { DurableObject } from "cloudflare:workers";
import { signTicket, verifyTicket } from "../../shared/realtimeAuth";
import {
  applyAction,
  expireTurn,
  botAction,
  newGame,
  newPlayer,
  playerView,
  type Game,
} from "../../src/game/engine";
import { COLORS, type Mode } from "../../src/game/data";
import { endingPreview } from "../../src/game/ending-preview";
import { manageGame, nextBot, scheduleTurn } from "./ticket-engine";
import { ROOM_IDLE_MS } from "./retention";
import type {
  Identity,
  Command,
  ChatMessage,
  TicketResult,
} from "../../shared/ticketProtocol";
export interface TicketEnv {
  TICKET: DurableObjectNamespace<TicketRoom>;
  GRAMS_REALTIME_SECRET: string;
  CONVEX_URL: string;
  ALLOWED_ORIGINS: string;
  ROOM_IDLE_MS?: number;
}
type Ticket = Identity & {
  code: string;
  create?: { mode: Mode; endingPreview?: boolean };
};
type Data = {
  code: string;
  lastActivity?: number;
  game: Game | null;
  revision: number;
  preview: boolean;
  instance: string;
  botAt: number;
  retryAt: number;
  retryDelay: number;
  outbox: TicketResult[];
  savedRound?: number;
  cleanupAt?: number;
  chatSeq: number;
  lastChat: Record<string, number>;
};
type Attachment = Identity & {
  code: string;
  expires: number;
  lastRequest: number;
  window: number;
  count: number;
};
export async function ticketFetch(
  req: Request,
  env: TicketEnv,
): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  if (!env.ALLOWED_ORIGINS.split(",").includes(origin))
    return new Response("Origin not allowed", { status: 403 });
  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  const code = new URL(req.url).pathname.match(
    /^\/ticket\/([A-Z2-9]{8})$/,
  )?.[1];
  if (!code) return new Response("Not found", { status: 404, headers: cors });
  const websocket = req.headers.get("Upgrade")?.toLowerCase() === "websocket";
  if (!websocket && req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });
  let ticket: Ticket;
  try {
    const protocols = (req.headers.get("Sec-WebSocket-Protocol") ?? "")
      .split(",")
      .map((s) => s.trim());
    if (websocket && (protocols.length !== 2 || protocols[0] !== "ticket"))
      throw new Error();
    ticket = verifyTicket(
      websocket
        ? protocols[1]
        : (req.headers.get("Authorization") ?? "").replace(/^Bearer /, ""),
      env.GRAMS_REALTIME_SECRET,
      "ticket:room",
    ) as Ticket;
    if (
      ticket.code !== code ||
      ![ticket.id, ticket.userId, ticket.name].every(
        (s) => typeof s === "string" && s.length > 0 && s.length <= 100,
      )
    )
      throw new Error();
  } catch {
    return Response.json(
      { error: "Sign in again." },
      { status: 401, headers: cors },
    );
  }
  const headers = new Headers(req.headers);
  headers.set("X-Ticket-Identity", JSON.stringify(ticket));
  headers.delete("Authorization");
  headers.delete("Sec-WebSocket-Protocol");
  const response = await env.TICKET.get(env.TICKET.idFromName(code)).fetch(
    new Request(req, { headers }),
  );
  if (websocket) return response;
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(cors))
    result.headers.set(key, value);
  return result;
}
function validate(input: unknown): asserts input is Command {
  if (!input || typeof input !== "object") throw new Error("Invalid command.");
  const a = input as Record<string, any>;
  if (["create", "get", "join"].includes(a.kind)) return;
  if (
    a.kind === "chat" &&
    (a.before === undefined || /^chat:\d{12}$/.test(a.before))
  )
    return;
  if (
    a.kind === "send" &&
    typeof a.text === "string" &&
    a.text.trim().length > 0 &&
    a.text.length <= 500 &&
    (a.clientId === undefined ||
      (typeof a.clientId === "string" &&
        /^[a-zA-Z0-9-]{1,80}$/.test(a.clientId)))
  )
    return;
  if (
    a.kind === "manage" &&
    ["bot", "remove", "mode", "timer", "rematch", "leave", "resign"].includes(
      a.operation,
    ) &&
    (a.player === undefined || typeof a.player === "string") &&
    (a.mode === undefined ||
      ["classic", "1910", "big", "mega"].includes(a.mode)) &&
    (a.turnSeconds === undefined ||
      [0, 30, 60, 90, 120].includes(a.turnSeconds))
  )
    return;
  if (
    a.kind === "play" &&
    Number.isSafeInteger(a.revision) &&
    a.revision >= 0 &&
    a.action &&
    typeof a.action === "object"
  ) {
    const x = a.action;
    if (["start", "tickets", "pass"].includes(x.type)) return;
    if (
      x.type === "keep" &&
      Array.isArray(x.tickets) &&
      x.tickets.length <= 20 &&
      x.tickets.every((t: unknown) => typeof t === "string")
    )
      return;
    if (
      x.type === "draw" &&
      Number.isInteger(x.source) &&
      x.source >= -1 &&
      x.source <= 4 &&
      (x.expected === undefined || COLORS.includes(x.expected))
    )
      return;
    if (
      x.type === "claim" &&
      typeof x.route === "string" &&
      COLORS.includes(x.color) &&
      Number.isInteger(x.wilds) &&
      x.wilds >= 0 &&
      x.wilds <= 6
    )
      return;
  }
  throw new Error("Invalid command.");
}
export class TicketRoom extends DurableObject<TicketEnv> {
  data!: Data;
  constructor(ctx: DurableObjectState, env: TicketEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<Data>("data")) ?? {
        code: "",
        game: null,
        revision: 0,
        preview: false,
        instance: crypto.randomUUID(),
        botAt: 0,
        retryAt: 0,
        retryDelay: 1000,
        outbox: [],
        chatSeq: 0,
        lastChat: {},
      };
      // Pre-existing rooms receive a full day after their next wakeup.
      if (!this.data.lastActivity && this.data.code) {
        this.data.lastActivity = Date.now();
        await ctx.storage.put("data", this.data);
        await this.schedule();
      }
    });
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }
  view(id: string) {
    const { game, code, revision } = this.data;
    return game
      ? {
          code,
          revision,
          serverNow: Date.now(),
          game: playerView(game, id),
          seats: game.players.length,
          phase: game.phase,
        }
      : null;
  }
  send(ws: WebSocket, message: unknown) {
    try {
      ws.send(JSON.stringify(message));
    } catch {}
  }
  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (a.expires <= Date.now()) {
        ws.close(4001, "Sign in again");
        continue;
      }
      this.send(ws, { type: "state", room: this.view(a.id) });
    }
  }
  async schedule() {
    const times = [
      this.data.botAt,
      this.data.retryAt,
      this.data.cleanupAt ?? 0,
      this.data.game?.turnDeadline ?? 0,
      this.data.lastActivity && !this.data.outbox.length
        ? this.data.lastActivity + (this.env.ROOM_IDLE_MS ?? ROOM_IDLE_MS)
        : 0,
    ].filter((t) => t > 0);
    if (times.length)
      await this.ctx.storage.setAlarm(
        Math.max(Date.now() + 1, Math.min(...times)),
      );
    else await this.ctx.storage.deleteAlarm();
  }
  async persist() {
    // Persist state and its next wakeup together, including result delivery retries.
    await this.ctx.storage.transaction(async () => {
      await this.ctx.storage.put("data", this.data);
      await this.schedule();
    });
  }
  async commit(game: Game, playerActivity = false) {
    const before = this.data.game!;
    scheduleTurn(before, game);
    this.data.game = game.players.length ? game : null;
    if (playerActivity) this.data.lastActivity = Date.now();
    if (!this.data.game) {
      this.data.cleanupAt = Date.now() + 1;
      this.data.lastChat = {};
    }
    this.data.revision++;
    this.data.botAt = nextBot(game) ? Date.now() + 600 : 0;
    if (
      game.phase === "finished" &&
      !this.data.preview &&
      this.data.savedRound !== game.roundId
    ) {
      const roundId = game.roundId!;
      this.data.outbox.push({
        id: `${this.data.instance}:${roundId}`,
        code: this.data.code,
        roundId,
        mode: game.mode,
        finishedAt: Date.now(),
        players: game.players.map((p) => ({
          id: p.id,
          name: p.name,
          bot: p.bot,
        })),
        scores: game.results,
      });
      this.data.savedRound = roundId;
      this.data.retryAt = Date.now() + 1;
    }
    await this.persist();
    this.broadcast();
  }
  async settle() {
    const g = this.data.game;
    if (
      g?.phase === "playing" &&
      g.turnDeadline &&
      g.turnDeadline <= Date.now()
    ) {
      await this.commit(expireTurn(g));
      return true;
    }
    return false;
  }
  async fetch(req: Request) {
    const identity = JSON.parse(
      req.headers.get("X-Ticket-Identity")!,
    ) as Ticket;
    if (req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.ctx.blockConcurrencyWhile(async () => {
        await this.expireIfIdle();
        if (this.ctx.getWebSockets().length >= 40)
          return new Response("Room connections full", { status: 429 });
        await this.settle();
        const [client, ws] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(ws);
        ws.serializeAttachment({
          id: identity.id,
          userId: identity.userId,
          name: identity.name,
          code: identity.code,
          lastRequest: 0,
          window: Date.now(),
          count: 0,
          expires: Date.now() + 3600000,
        } satisfies Attachment);
        this.send(ws, { type: "state", room: this.view(identity.id) });
        return new Response(null, {
          status: 101,
          webSocket: client,
          headers: { "Sec-WebSocket-Protocol": "ticket" },
        });
      });
    }
    // Read a bounded body before entering the room's serialized command handler.
    let input: unknown;
    try {
      const reader = req.body?.getReader();
      if (!reader) throw new Error("Missing command.");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 4096) {
          await reader.cancel();
          throw new Error("Command too large.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      input = JSON.parse(new TextDecoder().decode(bytes));
      validate(input);
    } catch {
      return Response.json({ error: "Invalid command." }, { status: 400 });
    }
    const command = input as Command;
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        return Response.json({ result: await this.command(identity, command) });
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Please try again.",
          },
          { status: 400 },
        );
      }
    });
  }
  async command(identity: Ticket, args: Command): Promise<unknown> {
    const { id, name } = identity;
    await this.expireIfIdle();
    if (args.kind === "create") {
      if (!identity.create) throw new Error("Create a room first.");
      if (this.data.code) {
        if (this.data.game?.players[0]?.id === id) return this.data.code;
        throw new Error("Room code already used. Create another room.");
      }
      this.data.code = identity.code;
      this.data.lastActivity = Date.now();
      this.data.preview = identity.create.endingPreview ?? false;
      this.data.game = this.data.preview
        ? endingPreview(id, name, identity.code)
        : newGame(identity.create.mode, newPlayer(id, name, 0));
      await this.persist();
      this.broadcast();
      return identity.code;
    }
    const timedOut = await this.settle();
    if (args.kind === "get") return this.view(id);
    if (!this.data.game) throw new Error("That room does not exist.");
    let g = structuredClone(this.data.game);
    if (args.kind === "chat") {
      const entries = await this.ctx.storage.list<ChatMessage>({
        prefix: "chat:",
        reverse: true,
        limit: 51,
        ...(args.before ? { end: args.before } : {}),
      });
      return {
        messages: [...entries.values()].slice(0, 50),
        more: entries.size > 50,
      };
    }
    if (args.kind === "send") {
      if (Date.now() - (this.data.lastChat[id] ?? 0) < 750)
        throw new Error("Please slow down.");
      const now = Date.now();
      this.data.lastChat = Object.fromEntries(
        Object.entries(this.data.lastChat).filter(
          ([, time]) => now - time < 750,
        ),
      );
      this.data.lastChat[id] = now;
      this.data.lastActivity = now;
      const key = `chat:${String(++this.data.chatSeq).padStart(12, "0")}`;
      const message: ChatMessage = {
        _id: key,
        ...(args.clientId ? { clientId: args.clientId } : {}),
        sender: id,
        name: g.players.find((p) => p.id === id)?.name ?? name,
        text: args.text.trim(),
        time: now,
      };
      await this.ctx.storage.transaction(async () => {
        await this.ctx.storage.put(key, message);
        await this.ctx.storage.put("data", this.data);
      });
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment;
        if (a.expires > Date.now()) this.send(ws, { type: "chat", message });
        else ws.close(4001, "Sign in again");
      }
      return message;
    }
    if (args.kind === "join") {
      if (g.players.some((p) => p.id === id)) return this.data.code;
      if (g.phase !== "lobby")
        throw new Error(
          "This train has departed. Ask the host for the next game.",
        );
      if (g.players.length >= 5) throw new Error("This room is full.");
      const color = [0, 1, 2, 3, 4].find(
        (c) => !g.players.some((p) => p.color === c),
      )!;
      g.players.push(newPlayer(id, name, color));
    } else if (args.kind === "manage") g = manageGame(g, id, args);
    else if (args.kind === "play") {
      if (timedOut) return null;
      if (
        args.revision !== this.data.revision &&
        !(args.action.type === "keep" && g.phase === "setup")
      )
        throw new Error("The game changed. Please try your move again.");
      if (g.players.find((p) => p.id === id)?.bot)
        throw new Error("This seat is now controlled by the computer.");
      g = applyAction(g, id, args.action);
    }
    await this.commit(g, true);
    return args.kind === "join" ? this.data.code : null;
  }
  async alarm() {
    const result = await this.ctx.blockConcurrencyWhile(async () => {
      const expired = await this.settle();
      if (!expired && this.data.botAt && this.data.botAt <= Date.now()) {
        const g = this.data.game,
          p = g && nextBot(g);
        this.data.botAt = 0;
        if (g && p) await this.commit(applyAction(g, p.id, botAction(g, p)));
      }
      const result =
        this.data.retryAt && this.data.retryAt <= Date.now()
          ? this.data.outbox[0]
          : undefined;
      if (result) this.data.retryAt = Date.now() + 10000;
      if (this.data.cleanupAt && this.data.cleanupAt <= Date.now()) {
        const entries = await this.ctx.storage.list({
          prefix: "chat:",
          limit: 100,
        });
        await this.ctx.storage.delete([...entries.keys()]);
        this.data.cleanupAt = entries.size === 100 ? Date.now() + 1 : 0;
      }
      await this.persist();
      await this.expireIfIdle();
      return result;
    });
    // External result delivery must not hold the room's command lock.
    if (result) await this.deliverResult(result);
  }
  async deliverResult(result: TicketResult) {
    let accepted = false;
    try {
      const token = signTicket(
        {
          iss: "games-realtime",
          aud: "ticket:result",
          exp: Date.now() / 1000 + 60,
          result,
        },
        this.env.GRAMS_REALTIME_SECRET,
      );
      const response = await fetch(this.env.CONVEX_URL + "/api/mutation", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "ticket:saveResult",
          args: { token },
          format: "json",
        }),
      });
      accepted =
        response.ok &&
        ((await response.json()) as { status: string }).status === "success";
    } catch {
      /* The persistent outbox is retried after interruption or failure. */
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      // Commands may have changed the game or appended another result during fetch.
      if (this.data.outbox[0]?.id !== result.id) return;
      if (accepted) {
        this.data.outbox.shift();
        this.data.retryDelay = 1000;
        this.data.retryAt = this.data.outbox.length ? Date.now() + 1 : 0;
      } else {
        this.data.retryAt = Date.now() + this.data.retryDelay;
        this.data.retryDelay = Math.min(this.data.retryDelay * 2, 300000);
      }
      await this.persist();
      await this.expireIfIdle();
    });
  }
  async expireIfIdle() {
    if (
      !this.data.lastActivity ||
      this.data.lastActivity + (this.env.ROOM_IDLE_MS ?? ROOM_IDLE_MS) >
        Date.now() ||
      this.data.outbox.length
    )
      return false;
    for (const ws of this.ctx.getWebSockets()) ws.close(4004, "Room expired");
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    this.data = {
      code: "",
      game: null,
      revision: 0,
      preview: false,
      instance: crypto.randomUUID(),
      botAt: 0,
      retryAt: 0,
      retryDelay: 1000,
      outbox: [],
      chatSeq: 0,
      lastChat: {},
    };
    return true;
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (
      typeof message !== "string" ||
      new TextEncoder().encode(message).length > 4096
    ) {
      ws.close(1009, "Message too large");
      return;
    }
    let frame: { type: string; request: number; args: Command };
    try {
      frame = JSON.parse(message);
      if (
        frame?.type !== "command" ||
        !Number.isSafeInteger(frame.request) ||
        frame.request < 1
      )
        throw new Error();
    } catch {
      ws.close(1008, "Invalid command");
      return;
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      const identity = ws.deserializeAttachment() as Attachment;
      if (!identity.userId || identity.expires <= Date.now()) {
        ws.close(4001, "Sign in again");
        return;
      }
      if (Date.now() - identity.window >= 1000) {
        identity.window = Date.now();
        identity.count = 0;
      }
      if (++identity.count > 100) {
        ws.close(4008, "Please slow down");
        return;
      }
      if (frame.request <= identity.lastRequest) {
        this.send(ws, {
          type: "reply",
          request: frame.request,
          error: "This command has already been received.",
        });
        return;
      }
      identity.lastRequest = frame.request;
      ws.serializeAttachment(identity);
      try {
        validate(frame.args);
        const result = await this.command(identity, frame.args);
        // Send the authoritative view with the acknowledgement. The client can
        // settle its optimistic action without waiting for a different channel.
        this.send(ws, {
          type: "reply",
          request: frame.request,
          result,
          ...(["play", "manage", "join", "get"].includes(frame.args.kind)
            ? { room: this.view(identity.id) }
            : {}),
        });
      } catch (error) {
        this.send(ws, {
          type: "reply",
          request: frame.request,
          error: error instanceof Error ? error.message : "Please try again.",
          room: this.view(identity.id),
        });
      }
    });
  }
  webSocketClose(ws: WebSocket) {
    ws.close(1000, "Disconnected");
  }
  webSocketError(ws: WebSocket) {
    ws.close(1011, "Reconnect");
  }
}
