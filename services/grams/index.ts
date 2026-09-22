import { ticketFetch, type TicketEnv } from "./ticket";
export { TicketRoom } from "./ticket";
import { DurableObject } from "cloudflare:workers";
import { signTicket, verifyTicket } from "../../shared/realtimeAuth";
import { gramsCodePattern } from "../../shared/gramsRooms";
import {
  fresh,
  command,
  finish,
  leave,
  view,
  type State,
  type Identity,
} from "./engine";
interface Env extends TicketEnv {
  GRAMS: DurableObjectNamespace<GramsRoom>;
  GRAMS_REALTIME_SECRET: string;
  CONVEX_URL: string;
  ALLOWED_ORIGINS: string;
}
type Attachment = {
  authorized: boolean;
  identity: Identity;
  expires: number;
  window: number;
  count: number;
};
type Data = {
  creator?: string;
  state: State;
  instance: string;
  disconnected: Record<string, number>;
  retryAt: number;
  retryDelay: number;
};
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const code = url.pathname.startsWith("/grams/")
      ? url.pathname.slice("/grams/".length)
      : "friends";
    if (url.pathname.startsWith("/ticket/")) return ticketFetch(req, env);
    if (url.pathname === "/health")
      return Response.json({
        ok: true,
        game: "grams",
        transport: "durable-object",
      });
    if (
      (url.pathname !== "/grams" && !gramsCodePattern.test(code)) ||
      req.headers.get("Upgrade")?.toLowerCase() !== "websocket"
    )
      return new Response("Not found", { status: 404 });
    if (
      !env.ALLOWED_ORIGINS.split(",").includes(req.headers.get("Origin") ?? "")
    )
      return new Response("Origin not allowed", { status: 403 });
    try {
      const protocols = (req.headers.get("Sec-WebSocket-Protocol") ?? "")
        .split(",")
        .map((s) => s.trim());
      if (protocols.length !== 2 || protocols[0] !== "grams")
        throw new Error("Invalid protocol");
      const ticket = verifyTicket(
        protocols[1],
        env.GRAMS_REALTIME_SECRET,
        `grams:${code}`,
      );
      if (
        ![ticket.id, ticket.userId, ticket.name].every(
          (s) => typeof s === "string" && s.length > 0 && s.length <= 100,
        )
      )
        throw new Error("Invalid identity");
      const headers = new Headers(req.headers);
      headers.set(
        "X-Grams-Identity",
        JSON.stringify({
          id: ticket.id,
          userId: ticket.userId,
          name: ticket.name,
        }),
      );
      headers.delete("Sec-WebSocket-Protocol");
      headers.set("X-Grams-Code", code);
      headers.set("X-Grams-Create", ticket.create === true ? "true" : "false");
      return env.GRAMS.get(env.GRAMS.idFromName(code)).fetch(
        new Request(req, { headers }),
      );
    } catch {
      return new Response("Sign in again", { status: 401 });
    }
  },
} satisfies ExportedHandler<Env>;
export class GramsRoom extends DurableObject<Env> {
  data!: Data;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<Data>("data")) ?? {
        state: fresh(),
        instance: crypto.randomUUID(),
        disconnected: {},
        retryAt: 0,
        retryDelay: 1000,
      };
    });
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }
  async fetch(req: Request) {
    const identity = JSON.parse(
      req.headers.get("X-Grams-Identity")!,
    ) as Identity;
    if (
      this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN)
        .length >= 36
    )
      return new Response("Room connections full", { status: 429 });
    const same = this.ctx
      .getWebSockets()
      .filter(
        (ws) =>
          ws.readyState === WebSocket.OPEN &&
          (ws.deserializeAttachment() as Attachment).identity.id ===
            identity.id,
      );
    if (same.length >= 2)
      return new Response("Close another Grams tab first", { status: 429 });
    const pair = new WebSocketPair();
    const [client, ws] = Object.values(pair);
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment({
      identity,
      authorized: false,
      expires: Date.now() + 3600000,
      window: Date.now(),
      count: 0,
    } satisfies Attachment);
    await this.ctx.blockConcurrencyWhile(async () => {
      const code = req.headers.get("X-Grams-Code");
      const create = req.headers.get("X-Grams-Create") === "true";
      if (code !== "friends") {
        const error =
          !this.data.creator && !create
            ? "Lobby not found. Check the code with your friend."
            : create && this.data.creator && this.data.creator !== identity.id
              ? "That lobby code is already taken. Create another lobby."
              : undefined;
        if (error) {
          this.send(ws, { type: "grams-error", error });
          ws.close(4004, "Lobby unavailable");
          return;
        }
        if (!this.data.creator) {
          this.data.creator = identity.id;
          command(this.data.state, identity, { kind: "requestJoin" });
        }
      }
      ws.serializeAttachment({
        ...(ws.deserializeAttachment() as Attachment),
        authorized: true,
      });
      delete this.data.disconnected[identity.id];
      await this.settle();
      await this.persist();
      this.send(ws, {
        type: "grams-state",
        state: view(this.data.state, identity),
      });
      this.send(ws, {
        type: "grams-feed",
        feed: { events: this.data.state.events, seq: this.data.state.seq },
      });
      await this.schedule();
    });
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": "grams" },
    });
  }
  send(ws: WebSocket, message: unknown) {
    try {
      ws.send(JSON.stringify(message));
    } catch {}
  }
  broadcast() {
    for (const ws of this.ctx.getWebSockets())
      this.send(ws, {
        type: "grams-state",
        state: view(
          this.data.state,
          (ws.deserializeAttachment() as Attachment).identity,
        ),
      });
  }
  feed() {
    for (const ws of this.ctx.getWebSockets())
      this.send(ws, {
        type: "grams-feed",
        feed: { events: this.data.state.events, seq: this.data.state.seq },
      });
  }
  async persist() {
    await this.ctx.storage.put("data", this.data);
  }
  async settle() {
    if (!finish(this.data.state)) return false;
    const s = this.data.state;
    const result = {
      id: `${this.data.instance}:${s.round}`,
      round: s.round,
      startedAt: s.startAt,
      finishedAt: Date.now(),
      word: s.word,
      players: structuredClone(s.players),
    };
    this.data.retryAt = Date.now() + 1000;
    await this.ctx.storage.put({
      data: this.data,
      [`result:${result.id}`]: result,
    });
    this.broadcast();
    this.feed();
    return true;
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4096) {
      ws.close(1009, "Message too large");
      return;
    }
    const a = ws.deserializeAttachment() as Attachment;
    if (a.authorized === false) return;
    if (a.expires <= Date.now()) {
      ws.close(4001, "Sign in again");
      return;
    }
    if (Date.now() - a.window > 1000) {
      a.window = Date.now();
      a.count = 0;
    }
    if (++a.count > 25) {
      ws.close(4008, "Please slow down");
      return;
    }
    ws.serializeAttachment(a);
    let op: any;
    try {
      op = JSON.parse(message);
      if (op.type !== "grams-command" || !Number.isSafeInteger(op.request))
        throw new Error();
    } catch {
      ws.close(1008, "Invalid message");
      return;
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      try {
        await this.settle();
        const old = this.data.state;
        const next = structuredClone(old);
        const result = command(next, a.identity, op.args);
        // Rejected guesses are private replies: no room write and no broadcast.
        if (op.args.kind === "wordSubmit" && !result?.accepted) {
          this.send(ws, { type: "grams-reply", request: op.request, result });
          await this.schedule();
          return;
        }
        this.data.state = next;
        if (op.args.kind === "leave")
          delete this.data.disconnected[a.identity.id];
        await this.persist();
        if (op.args.kind === "wordSubmit") {
          const p = next.players.find((p) => p.id === a.identity.id)!;
          for (const socket of this.ctx.getWebSockets())
            this.send(socket, {
              type: "grams-score",
              id: p.id,
              score: p.score,
              serverNow: Date.now(),
              me:
                (socket.deserializeAttachment() as Attachment).identity.id ===
                p.id
                  ? {
                      id: p.id,
                      name: p.name,
                      pfp: p.pfp,
                      score: p.score,
                      wins: p.wins,
                      words: p.words,
                    }
                  : undefined,
            });
        } else if (!["chatSent", "emoteSent"].includes(op.args.kind))
          this.broadcast();
        this.send(ws, { type: "grams-reply", request: op.request, result });
        if (next.seq !== old.seq) this.feed();
        await this.schedule();
      } catch (error) {
        this.send(ws, {
          type: "grams-reply",
          request: op.request,
          error: error instanceof Error ? error.message : "Please try again.",
        });
      }
    });
  }
  async webSocketClose(ws: WebSocket) {
    ws.close(1000, "Disconnected");
    await this.disconnected(ws);
  }
  async webSocketError(ws: WebSocket) {
    ws.close(1011, "Reconnect");
    await this.disconnected(ws);
  }
  async disconnected(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment;
    await this.ctx.blockConcurrencyWhile(async () => {
      const another = this.ctx
        .getWebSockets()
        .some(
          (other) =>
            other !== ws &&
            other.readyState === WebSocket.OPEN &&
            (other.deserializeAttachment() as Attachment).identity.id ===
              a.identity.id,
        );
      if (
        !another &&
        this.data.state.players.some((p) => p.id === a.identity.id)
      )
        this.data.disconnected[a.identity.id] = Date.now() + 90000;
      await this.persist();
      await this.schedule();
    });
  }
  async schedule() {
    const deadlines: number[] = [];
    if (this.data.state.phase === "playing")
      deadlines.push(this.data.state.endAt);
    for (const deadline of Object.values(this.data.disconnected))
      deadlines.push(
        this.data.state.phase === "playing"
          ? Math.max(deadline, this.data.state.endAt)
          : deadline,
      );
    for (const ws of this.ctx.getWebSockets())
      if (ws.readyState === WebSocket.OPEN)
        deadlines.push((ws.deserializeAttachment() as Attachment).expires);
    if (this.data.retryAt) deadlines.push(this.data.retryAt);
    if (deadlines.length)
      await this.ctx.storage.setAlarm(
        Math.max(Date.now() + 100, Math.min(...deadlines)),
      );
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.settle();
      for (const ws of this.ctx.getWebSockets())
        if ((ws.deserializeAttachment() as Attachment).expires <= Date.now())
          ws.close(4001, "Refresh session");
      let changed = false;
      for (const [id, deadline] of Object.entries(this.data.disconnected))
        if (deadline <= Date.now() && this.data.state.phase !== "playing") {
          leave(this.data.state, id);
          delete this.data.disconnected[id];
          changed = true;
        }
      if (changed) {
        this.broadcast();
        this.feed();
      }
      await this.persist();
    });
    if (this.data.retryAt && this.data.retryAt <= Date.now())
      await this.flushResults();
    await this.schedule();
  }
  async flushResults() {
    const records = await this.ctx.storage.list<any>({
      prefix: "result:",
      limit: 20,
    });
    let failed = false;
    for (const [key, result] of records) {
      try {
        const token = signTicket(
          {
            iss: "games-realtime",
            aud: "grams:result",
            exp: Math.floor(Date.now() / 1000) + 300,
            result,
          },
          this.env.GRAMS_REALTIME_SECRET,
        );
        const response = await fetch(`${this.env.CONVEX_URL}/api/mutation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "realtime:saveResult",
            args: [{ token }],
            format: "convex_encoded_json",
          }),
          signal: AbortSignal.timeout(8000),
        });
        const body = (await response.json()) as { status: string };
        if (!response.ok || body.status !== "success")
          throw new Error("Result delivery failed");
        await this.ctx.storage.delete(key);
      } catch {
        failed = true;
        break;
      }
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      const remaining =
        (await this.ctx.storage.list({ prefix: "result:", limit: 1 })).size > 0;
      this.data.retryDelay = failed
        ? Math.min(this.data.retryDelay * 2, 3600000)
        : 1000;
      this.data.retryAt = remaining ? Date.now() + this.data.retryDelay : 0;
      await this.persist();
    });
  }
}
