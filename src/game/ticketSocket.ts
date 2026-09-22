import type { Command } from "../../shared/ticketProtocol";

// Requests are acknowledged once on their original connection. An interruption
// rejects pending actions; reconnecting reads state instead of replaying moves.
export class TicketSocket {
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private socket: Pick<WebSocket, "send" | "close" | "readyState">,
  ) {}
  request<T>(args: Command): Promise<T> {
    if (this.socket.readyState !== 1)
      return Promise.reject(
        new Error("Reconnecting. Please try again when connected."),
      );
    const request = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close(
          "The server has not confirmed the move. Reconnecting to check the game.",
        );
        this.socket.close();
      }, 15000);
      this.pending.set(request, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.socket.send(JSON.stringify({ type: "command", request, args }));
      } catch {
        this.close();
        this.socket.close();
      }
    });
  }
  reply(message: { request: number; result?: unknown; error?: string }) {
    const pending = this.pending.get(message.request);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.request);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  }
  close(message = "Connection interrupted. Reconnecting to check the game.") {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
}
