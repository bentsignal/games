import {
  COLORS,
  MODES,
  POINTS,
  ROUTES,
  ROUTE_BY_ID,
  TICKET_BY_ID,
  ticketDeck,
  type Color,
  type Mode,
  type Route,
} from "./data";

export interface Player {
  id: string;
  name: string;
  color: number;
  hand: Color[];
  tickets: string[];
  pending: string[];
  score: number;
  trains: number;
  bot: boolean;
}
export interface Result {
  id: string;
  routePoints: number;
  ticketPoints: number;
  completed: number;
  longest: number;
  longestBonus: number;
  globeBonus: number;
  total: number;
  winner: boolean;
}
export interface Game {
  roundId?: number;
  turnSeconds?: 0 | 30 | 60 | 90 | 120;
  turnDeadline?: number;
  mode: Mode;
  phase: "lobby" | "setup" | "playing" | "finished";
  players: Player[];
  turn: number;
  turnNumber: number;
  drawn: number;
  deck: Color[];
  discard: Color[];
  market: Color[];
  // Physical positions stay fixed even when the deck runs out. Optional for old rooms.
  marketSlots?: number[];
  ticketDeck: string[];
  claimed: Record<string, string>;
  finalTurns: number | null;
  log: string[];
  results: Result[];
  passes: number;
}
export type Action =
  | { type: "start" }
  | { type: "keep"; tickets: string[] }
  | { type: "draw"; source: number; expected?: Color }
  | { type: "tickets" }
  | { type: "claim"; route: string; color: Color; wilds: number }
  | { type: "pass" };
export function shuffle<T>(items: T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function newPlayer(
  id: string,
  name: string,
  color: number,
  bot = false,
): Player {
  return {
    id,
    name,
    color,
    bot,
    hand: [],
    tickets: [],
    pending: [],
    score: 0,
    trains: 45,
  };
}
export function newGame(mode: Mode, host: Player): Game {
  return {
    roundId: Date.now(),
    mode,
    phase: "lobby",
    players: [host],
    turn: 0,
    turnNumber: 0,
    drawn: 0,
    deck: [],
    discard: [],
    market: [],
    ticketDeck: [],
    claimed: {},
    finalTurns: null,
    log: [],
    results: [],
    passes: 0,
  };
}
function insist(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function log(g: Game, s: string) {
  g.log.push(s);
  g.log = g.log.slice(-80);
}
function takeCard(g: Game): Color | undefined {
  if (!g.deck.length && g.discard.length) {
    g.deck = shuffle(g.discard);
    g.discard = [];
  }
  return g.deck.pop();
}
export function refillMarket(g: Game) {
  g.marketSlots ??= g.market.map((_, i) => i);
  for (let tries = 0; tries < 100; tries++) {
    while (g.market.length < 5) {
      const c = takeCard(g);
      if (!c) break;
      g.marketSlots.push(
        [0, 1, 2, 3, 4].find((s) => !g.marketSlots!.includes(s))!,
      );
      g.market.push(c);
    }
    if (g.market.filter((c) => c === "wild").length < 3) return;
    // A valid market may be impossible when players hoard the colored cards.
    const available = [...g.market, ...g.deck, ...g.discard];
    if (available.filter((c) => c !== "wild").length < 3) {
      g.discard.push(...g.market);
      g.market = [];
      g.marketSlots = [];
      return;
    }
    g.discard.push(...g.market);
    g.market = [];
    g.marketSlots = [];
  }
  // Bounded fallback: randomize available cards and construct a legal market.
  const available = shuffle([...g.deck, ...g.discard, ...g.market]);
  g.deck = [];
  g.discard = [];
  g.market = [];
  g.marketSlots = [];
  for (const c of available) {
    if (
      g.market.length < 5 &&
      (c !== "wild" || g.market.filter((v) => v === "wild").length < 2)
    ) {
      g.marketSlots.push(g.market.length);
      g.market.push(c);
    } else g.deck.push(c);
  }
}
export function connected(
  g: Pick<Game, "claimed">,
  id: string,
  a: string,
  b: string,
): boolean {
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const c = queue.pop()!;
    if (c === b) return true;
    for (const r of ROUTES) {
      if (g.claimed[r.id] !== id) continue;
      const n = r.a === c ? r.b : r.b === c ? r.a : null;
      if (n && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}
export function longestTrail(g: Pick<Game, "claimed">, id: string): number {
  const edges = ROUTES.filter((r) => g.claimed[r.id] === id);
  const adjacency = new Map<string, number[]>();
  edges.forEach((r, i) => {
    for (const c of [r.a, r.b])
      adjacency.set(c, [...(adjacency.get(c) || []), i]);
  });
  const memo = new Map<string, number>();
  function walk(city: string, used: bigint): number {
    const key = city + ":" + used;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let best = 0;
    for (const i of adjacency.get(city) || []) {
      const bit = 1n << BigInt(i);
      if (used & bit) continue;
      const r = edges[i];
      best = Math.max(
        best,
        r.length + walk(r.a === city ? r.b : r.a, used | bit),
      );
    }
    memo.set(key, best);
    return best;
  }
  return Math.max(0, ...[...adjacency.keys()].map((c) => walk(c, 0n)));
}
export function scoreGame(g: Game): Result[] {
  const rows = g.players.map((p) => {
    let ticketPoints = 0,
      completed = 0;
    for (const id of p.tickets) {
      const t = TICKET_BY_ID[id];
      const done = connected(g, p.id, t.a, t.b);
      ticketPoints += done ? t.points : -t.points;
      if (done) completed++;
    }
    return {
      id: p.id,
      routePoints: p.score,
      ticketPoints,
      completed,
      longest: longestTrail(g, p.id),
      longestBonus: 0,
      globeBonus: 0,
      total: 0,
      winner: false,
    };
  });
  const maxLength = Math.max(...rows.map((r) => r.longest)),
    maxTickets = Math.max(...rows.map((r) => r.completed));
  for (const r of rows) {
    r.longestBonus = MODES[g.mode].longest && r.longest === maxLength ? 10 : 0;
    r.globeBonus = MODES[g.mode].globe && r.completed === maxTickets ? 15 : 0;
    r.total = r.routePoints + r.ticketPoints + r.longestBonus + r.globeBonus;
  }
  const sorted = [...rows].sort(
    (a, b) =>
      b.total - a.total ||
      b.completed - a.completed ||
      b.longestBonus - a.longestBonus,
  );
  const best = sorted[0];
  for (const r of rows)
    r.winner =
      r.total === best.total &&
      r.completed === best.completed &&
      r.longestBonus === best.longestBonus;
  return rows;
}
function endTurn(g: Game) {
  g.drawn = 0;
  if (g.finalTurns !== null) {
    g.finalTurns--;
    if (g.finalTurns === 0) {
      g.phase = "finished";
      g.results = scoreGame(g);
      log(g, "The final whistle. All destination tickets are revealed.");
      return;
    }
  } else if (g.players.some((p) => p.trains <= 2)) {
    g.finalTurns = g.players.length;
    log(
      g,
      "Final round! Everyone, including the triggering player, has one last turn.",
    );
  }
  g.turn = (g.turn + 1) % g.players.length;
  g.turnNumber++;
}
type RouteState = { claimed: Game["claimed"]; players: { id: string }[] };
export function routeAvailable(g: RouteState, p: Player, r: Route): boolean {
  if (g.claimed[r.id] || p.trains < r.length) return false;
  const sibling = ROUTES.find(
    (s) =>
      s.id !== r.id &&
      ((s.a === r.a && s.b === r.b) || (s.a === r.b && s.b === r.a)) &&
      g.claimed[s.id],
  );
  return !sibling || (g.players.length >= 4 && g.claimed[sibling.id] !== p.id);
}
export function paymentOptions(
  g: RouteState,
  p: Player,
  r: Route,
): { color: Color; wilds: number }[] {
  if (!routeAvailable(g, p, r)) return [];
  const wilds = p.hand.filter((c) => c === "wild").length;
  const options: { color: Color; wilds: number }[] = [];
  for (const c of COLORS.filter(
    (c) => c !== "wild" && (r.color === "gray" || r.color === c),
  )) {
    const count = p.hand.filter((x) => x === c).length;
    for (
      let w = Math.max(0, r.length - count);
      w <= Math.min(wilds, r.length);
      w++
    )
      options.push({ color: c, wilds: w });
  }
  return options.filter(
    (o, i) =>
      o.wilds !== r.length ||
      i === options.findIndex((v) => v.wilds === r.length),
  );
}
export function canPass(g: Game, p: Player): boolean {
  return (
    !g.deck.length &&
    !g.discard.length &&
    !g.market.length &&
    !g.ticketDeck.length &&
    !ROUTES.some((r) => paymentOptions(g, p, r).length)
  );
}
export function applyAction(original: Game, id: string, action: Action): Game {
  const g = structuredClone(original);
  const p = g.players.find((p) => p.id === id);
  insist(p, "You are not seated in this game.");
  if (action.type === "start") {
    insist(g.phase === "lobby", "The game has already started.");
    insist(g.players[0].id === id, "Only the host can start.");
    insist(
      g.players.length >= 2 && g.players.length <= 5,
      "Seat 2–5 players to start.",
    );
    g.deck = shuffle(
      COLORS.flatMap((c) =>
        Array.from({ length: c === "wild" ? 14 : 12 }, () => c),
      ),
    );
    g.ticketDeck = shuffle(ticketDeck(g.mode));
    for (const player of g.players) {
      player.hand = g.deck.splice(0, 4);
      player.pending = g.ticketDeck.splice(0, MODES[g.mode].initial);
    }
    refillMarket(g);
    g.phase = "setup";
    g.turnNumber = 1;
    log(g, "All aboard! Choose your starting destination tickets.");
    return g;
  }
  if (action.type === "keep") {
    insist(
      g.phase === "setup" ||
        (g.phase === "playing" && g.players[g.turn].id === id),
      "Wait for your turn.",
    );
    insist(p.pending.length, "No tickets to choose.");
    const unique = [...new Set(action.tickets)];
    const minimum = g.phase === "setup" ? MODES[g.mode].keep : 1;
    insist(
      unique.length >= Math.min(minimum, p.pending.length) &&
        unique.every((t) => p.pending.includes(t)) &&
        unique.length === action.tickets.length,
      `Keep at least ${minimum} of the offered tickets.`,
    );
    g.ticketDeck.push(...p.pending.filter((t) => !unique.includes(t)));
    p.tickets.push(...unique);
    p.pending = [];
    log(g, `${p.name} kept ${unique.length} destination tickets.`);
    if (g.phase === "setup") {
      if (g.players.every((p) => !p.pending.length)) {
        g.phase = "playing";
        log(g, `${g.players[g.turn].name} takes the first turn.`);
      }
    } else {
      g.passes = 0;
      endTurn(g);
    }
    return g;
  }
  insist(g.phase === "playing", "The game is not accepting turns.");
  insist(g.players[g.turn].id === id, "It is not your turn.");
  insist(!p.pending.length, "Choose your destination tickets first.");
  if (action.type === "draw") {
    insist(
      Number.isInteger(action.source) &&
        action.source >= -1 &&
        action.source < g.market.length,
      "That card is no longer available.",
    );
    let card: Color | undefined;
    if (action.source === -1) {
      card = takeCard(g);
      insist(card, "The train deck is empty.");
    } else {
      card = g.market[action.source];
      insist(
        !action.expected || card === action.expected,
        "The market changed; choose again.",
      );
      insist(
        !(g.drawn === 1 && card === "wild"),
        "A face-up rainbow card takes your whole turn.",
      );
      g.marketSlots ??= g.market.map((_, i) => i);
      const replacement = takeCard(g);
      if (replacement) g.market[action.source] = replacement;
      else {
        g.market.splice(action.source, 1);
        g.marketSlots.splice(action.source, 1);
      }
    }
    p.hand.push(card);
    g.drawn += action.source >= 0 && card === "wild" ? 2 : 1;
    g.passes = 0;
    log(
      g,
      `${p.name} drew ${action.source === -1 ? "a hidden train card" : card === "wild" ? "a rainbow card" : `a ${card} train card`}.`,
    );
    refillMarket(g);
    const canDrawAgain =
      g.deck.length + g.discard.length > 0 ||
      g.market.some((c) => c !== "wild");
    if (g.drawn >= 2 || !canDrawAgain) endTurn(g);
    return g;
  }
  insist(g.drawn === 0, "Finish drawing your second train card first.");
  if (action.type === "tickets") {
    insist(g.ticketDeck.length, "No destination tickets remain.");
    p.pending = g.ticketDeck.splice(0, MODES[g.mode].draw);
    return g;
  }
  if (action.type === "claim") {
    const r = ROUTE_BY_ID[action.route];
    insist(r, "Unknown route.");
    insist(routeAvailable(g, p, r), "This route is unavailable.");
    insist(
      paymentOptions(g, p, r).some(
        (o) => o.color === action.color && o.wilds === action.wilds,
      ),
      "You do not have the required cards.",
    );
    const spend: Color[] = [
      ...Array<Color>(r.length - action.wilds).fill(action.color),
      ...Array<Color>(action.wilds).fill("wild"),
    ];
    for (const c of spend) {
      const i = p.hand.indexOf(c);
      insist(i >= 0, "Missing payment card.");
      p.hand.splice(i, 1);
    }
    g.discard.push(...spend);
    g.claimed[r.id] = id;
    p.trains -= r.length;
    p.score += POINTS[r.length];
    g.passes = 0;
    log(g, `${p.name} claimed ${r.a} → ${r.b} (+${POINTS[r.length]}).`);
    refillMarket(g);
    endTurn(g);
    return g;
  }
  if (action.type === "pass") {
    insist(canPass(g, p), "You still have a legal move.");
    g.passes++;
    log(g, `${p.name} passed: no legal moves.`);
    if (g.passes >= g.players.length) {
      g.phase = "finished";
      g.results = scoreGame(g);
    } else endTurn(g);
    return g;
  }
  throw new Error("Unknown action.");
}
export type PublicPlayer = Omit<Player, "hand" | "tickets" | "pending"> & {
  handCount: number;
  ticketCount: number;
  ready: boolean;
};
export type View = Omit<Game, "players" | "deck" | "discard" | "ticketDeck"> & {
  players: PublicPlayer[];
  me: Player | null;
  deckCount: number;
  discardCount: number;
  ticketCount: number;
  revealed: Record<string, string[]>;
};
export function playerView(g: Game, id: string): View {
  const { deck, discard, ticketDeck, players, ...rest } = g;
  return {
    ...rest,
    players: players.map(({ hand, tickets, pending, ...p }) => ({
      ...p,
      handCount: hand.length,
      ticketCount: tickets.length,
      ready: !pending.length,
    })),
    me: players.find((p) => p.id === id) || null,
    deckCount: deck.length,
    discardCount: discard.length,
    ticketCount: ticketDeck.length,
    revealed:
      g.phase === "finished"
        ? Object.fromEntries(players.map((p) => [p.id, p.tickets]))
        : {},
  };
}

// Bots use only their own hand/tickets and the public board/market.
export function botAction(g: Game, p: Player): Action {
  if (p.pending.length)
    return {
      type: "keep",
      tickets: p.pending.slice(0, g.phase === "setup" ? MODES[g.mode].keep : 1),
    };
  const needed = new Set<string>();
  for (const tid of p.tickets) {
    const t = TICKET_BY_ID[tid];
    if (connected(g, p.id, t.a, t.b)) continue;
    const dist: Record<string, number> = { [t.a]: 0 },
      prev: Record<string, Route> = {};
    const visited = new Set<string>();
    for (;;) {
      const c = Object.keys(dist)
        .filter((c) => !visited.has(c))
        .sort((a, b) => dist[a] - dist[b])[0];
      if (!c || c === t.b) break;
      visited.add(c);
      for (const r of ROUTES) {
        if (r.a !== c && r.b !== c) continue;
        if (g.claimed[r.id] && g.claimed[r.id] !== p.id) continue;
        if (!g.claimed[r.id] && !routeAvailable(g, p, r)) continue;
        const n = r.a === c ? r.b : r.a;
        const cost = g.claimed[r.id] === p.id ? 0.01 : r.length;
        if (dist[n] === undefined || dist[n] > dist[c] + cost) {
          dist[n] = dist[c] + cost;
          prev[n] = r;
        }
      }
    }
    let c = t.b;
    const seen = new Set<string>();
    while (prev[c] && !seen.has(c)) {
      seen.add(c);
      const r = prev[c];
      if (!g.claimed[r.id]) needed.add(r.id);
      c = r.a === c ? r.b : r.a;
    }
  }
  if (!g.drawn) {
    const options = ROUTES.flatMap((r) => {
      const o = paymentOptions(g, p, r)[0];
      return o ? [{ r, o }] : [];
    }).sort(
      (a, b) =>
        Number(needed.has(b.r.id)) * 30 +
        b.r.length * 2 -
        b.o.wilds -
        (Number(needed.has(a.r.id)) * 30 + a.r.length * 2 - a.o.wilds),
    );
    if (options.length) {
      const { r, o } = options[0];
      return { type: "claim", route: r.id, ...o };
    }
    if (!needed.size && g.ticketDeck.length && p.trains > 12)
      return { type: "tickets" };
  }
  const wants = COLORS.map((c) => ({
    c,
    weight:
      ROUTES.filter(
        (r) => needed.has(r.id) && (r.color === c || r.color === "gray"),
      ).length *
        3 +
      p.hand.filter((v) => v === c).length,
  }));
  const face = g.market
    .map((c, i) => ({
      c,
      i,
      weight: c === "wild" ? 100 : wants.find((w) => w.c === c)!.weight,
    }))
    .filter((c) => !g.drawn || c.c !== "wild")
    .sort((a, b) => b.weight - a.weight);
  if (
    face.length &&
    (face[0].weight > 0 || (!g.deck.length && !g.discard.length))
  )
    return { type: "draw", source: face[0].i, expected: face[0].c };
  if (g.deck.length || g.discard.length) return { type: "draw", source: -1 };
  if (face.length) return { type: "draw", source: face[0].i };
  if (g.ticketDeck.length) return { type: "tickets" };
  return { type: "pass" };
}

// Timeout finishes only the current turn, preserving a partially taken action.
export function expireTurn(original: Game): Game {
  if (original.phase !== "playing") return original;
  let g = structuredClone(original);
  const p = g.players[g.turn],
    turn = g.turnNumber;
  log(g, `${p.name} ran out of time.`);
  if (p.pending.length)
    return applyAction(g, p.id, {
      type: "keep",
      tickets: p.pending.slice(0, 1),
    });
  for (
    let i = 0;
    i < 2 && g.phase === "playing" && g.turnNumber === turn;
    i++
  ) {
    if (g.deck.length + g.discard.length) {
      g = applyAction(g, p.id, { type: "draw", source: -1 });
    } else {
      // No hidden cards remain: finish with what was available, never choose a route.
      g.passes++;
      if (g.passes >= g.players.length * 2) {
        g.phase = "finished";
        g.results = scoreGame(g);
      } else endTurn(g);
      break;
    }
  }
  return g;
}
