import { ROUTES, type Color, type Route, type Ticket } from "./data";
import { paymentOptions, type Game, type View } from "./engine";

// Dropping a card pays with that color and the fewest necessary locomotives.
// A locomotive drop contributes at least one wild; the preview shows the payment.
export function cardPayment(game: View, route: Route, color: Color) {
  if (!game.me) return undefined;
  const options = paymentOptions(game as unknown as Game, game.me, route);
  return options
    .filter((o) =>
      color === "wild"
        ? o.wilds > 0
        : o.color === color && o.wilds < route.length,
    )
    .sort((a, b) => a.wilds - b.wilds)[0];
}
export const TICKET_INKS = [
  "#087f8c",
  "#b94b79",
  "#8962ba",
  "#ba7827",
  "#45763c",
];
export interface TicketPreview {
  ticket: Ticket;
  color: string;
  hovered?: boolean;
}
// A suggested connection, not a prescribed itinerary. Existing owned rails cost
// almost nothing, so previews reveal how a new ticket could reuse your network.
export function ticketPath(
  game: View | undefined | null,
  ticket: Ticket,
): string[] {
  const player = game?.me?.id;
  const distance = new Map<string, number>([[ticket.a, 0]]),
    previous = new Map<string, { city: string; route: string }>(),
    visited = new Set<string>();
  for (;;) {
    let city: string | undefined,
      best = Infinity;
    for (const [name, d] of distance)
      if (!visited.has(name) && d < best) {
        city = name;
        best = d;
      }
    if (!city || city === ticket.b) break;
    visited.add(city);
    for (const r of ROUTES) {
      if (r.a !== city && r.b !== city) continue;
      const owner = game?.claimed[r.id];
      if (owner && owner !== player) continue;
      if (
        !owner &&
        game &&
        game.players.length < 4 &&
        ROUTES.some(
          (s) =>
            s.id !== r.id && s.a === r.a && s.b === r.b && game.claimed[s.id],
        )
      )
        continue;
      const next = r.a === city ? r.b : r.a,
        cost = best + (owner === player && owner ? r.length * 0.06 : r.length);
      if (cost < (distance.get(next) ?? Infinity)) {
        distance.set(next, cost);
        previous.set(next, { city, route: r.id });
      }
    }
  }
  const path: string[] = [];
  let city = ticket.b;
  while (city !== ticket.a) {
    const step = previous.get(city);
    if (!step) return [];
    path.unshift(step.route);
    city = step.city;
  }
  return path;
}
