import type { RoomView } from "../../shared/ticketProtocol";
import type { Action } from "./engine";
import { ROUTE_BY_ID, POINTS } from "./data";
import { paymentOptions } from "./engine";
export type PendingMove = { code: string; revision: number; action: Action };

// Predict only facts visible to this player. Turn advancement, draws, final
// scoring, and hidden cards remain authoritative server updates.
export function optimisticRoom(
  room: RoomView | null | undefined,
  move: PendingMove,
) {
  if (
    !room ||
    room.code !== move.code ||
    room.revision !== move.revision ||
    move.action.type !== "claim"
  )
    return room;
  const { game } = room,
    me = game.me,
    action = move.action;
  const route = ROUTE_BY_ID[action.route];
  if (
    !me ||
    me.bot ||
    !route ||
    game.phase !== "playing" ||
    game.players[game.turn]?.id !== me.id ||
    game.drawn ||
    me.pending.length ||
    game.claimed[route.id]
  )
    return room;
  if (
    !paymentOptions(game, me, route).some(
      (p) => p.color === action.color && p.wilds === action.wilds,
    )
  )
    return room;
  const hand = [...me.hand];
  for (let i = 0; i < route.length - action.wilds; i++)
    hand.splice(hand.indexOf(action.color), 1);
  for (let i = 0; i < action.wilds; i++) hand.splice(hand.indexOf("wild"), 1);
  const score = me.score + POINTS[route.length],
    trains = me.trains - route.length;
  return {
    ...room,
    game: {
      ...game,
      claimed: { ...game.claimed, [route.id]: me.id },
      me: { ...me, hand, score, trains },
      players: game.players.map((p) =>
        p.id === me.id ? { ...p, score, trains, handCount: hand.length } : p,
      ),
    },
  };
}
