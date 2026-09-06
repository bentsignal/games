import { CITIES, ROUTES, type Color, type Route, type Ticket } from "./data";
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

// A double connection is one drop target. Prefer the first printed lane,
// independent of the side the pointer hits. Continue the side of an existing
// parallel line where the two links meet without a sharp turn.
export function automaticRoute(game: View, hit: Route, color?: Color) {
  const siblings = ROUTES.filter((r) => r.a === hit.a && r.b === hit.b);
  const available = siblings.filter((r) =>
    color
      ? !!cardPayment(game, r, color)
      : !!game.me &&
        paymentOptions(game as unknown as Game, game.me, r).length > 0,
  );
  function direction(r: Route) {
    const a = CITIES[r.a],
      b = CITIES[r.b];
    const dx = (b[0] - a[0]) * 1260,
      dy = (a[1] - b[1]) * 830;
    const length = Math.hypot(dx, dy);
    return [dx / length, dy / length];
  }
  function side(r: Route) {
    const pair = ROUTES.filter((s) => s.a === r.a && s.b === r.b);
    if (pair.length !== 2) return undefined;
    const sign = pair[0].id === r.id ? -1 : 1;
    const [dx, dy] = direction(r);
    return [-dy * sign, dx * sign];
  }
  function continuity(r: Route) {
    const lane = side(r);
    if (!lane) return 0;
    let penalty = 0;
    for (const previous of ROUTES) {
      if (game.claimed[previous.id] !== game.me?.id) continue;
      const city = [r.a, r.b].find((c) => c === previous.a || c === previous.b);
      const previousLane = side(previous);
      if (!city || !previousLane) continue;
      const currentDirection = direction(r),
        previousDirection = direction(previous);
      const orientation =
        (r.a === city ? 1 : -1) * (previous.a === city ? 1 : -1);
      const dot =
        orientation *
        (currentDirection[0] * previousDirection[0] +
          currentDirection[1] * previousDirection[1]);
      if (dot < -0.5)
        penalty +=
          (lane[0] - previousLane[0]) ** 2 + (lane[1] - previousLane[1]) ** 2;
    }
    return penalty;
  }
  available.sort((a, b) => continuity(a) - continuity(b));
  if (color) {
    // Preserve the card-color choice on colored pairs, spending fewer wilds.
    return available.sort(
      (a, b) =>
        cardPayment(game, a, color)!.wilds - cardPayment(game, b, color)!.wilds,
    )[0];
  }
  return available.find((r) => r.color === hit.color) ?? available[0];
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
