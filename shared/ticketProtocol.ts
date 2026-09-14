import type { Game, View, Action, Result } from "../src/game/engine";
import type { Mode } from "../src/game/data";
export type Identity = { id: string; userId: string; name: string };
export type RoomView = {
  code: string;
  revision: number;
  serverNow: number;
  game: View;
  seats: number;
  phase: Game["phase"];
};
export type ChatMessage = {
  _id: string;
  sender: string;
  name: string;
  text: string;
  time: number;
};
export type Command =
  | { kind: "create" }
  | { kind: "get" }
  | { kind: "join" }
  | { kind: "play"; revision: number; action: Action }
  | {
      kind: "manage";
      operation:
        "bot" | "remove" | "mode" | "timer" | "rematch" | "leave" | "resign";
      player?: string;
      mode?: Mode;
      turnSeconds?: Game["turnSeconds"];
    }
  | { kind: "send"; text: string }
  | { kind: "chat"; before?: string };
export type TicketResult = {
  id: string;
  code: string;
  roundId: number;
  mode: Mode;
  finishedAt: number;
  players: { id: string; name: string; bot: boolean }[];
  scores: Result[];
};
