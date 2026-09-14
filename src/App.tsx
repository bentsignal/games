import { clientId } from "./clientId";
import TurnPanel from "./components/TurnPanel";
import GameEvents from "./components/GameEvents";
import CardDrawFlight, { type DrawFlight } from "./components/CardDrawFlight";
import DestinationFeedback, {
  useDestinationFeedback,
} from "./components/DestinationFeedback";
import { playerDisplayColors } from "./game/player-colors";
import { routeAtMapPoint, tracks } from "./game/map-layout";
import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  usePaginatedQuery,
  useConvex,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import {
  TrainFront,
  ArrowRight,
  Ticket as TicketIcon,
  Users,
  Copy,
  Check,
  X,
  Plus,
  Bot,
  Send,
  RotateCcw,
  Maximize,
  BookOpen,
  ChevronDown,
  Flag,
  LogOut,
  List,
  Compass,
  LoaderCircle,
  WifiOff,
} from "lucide-react";
import { api } from "../services/convex/convex/_generated/api";
import { ConvexError } from "convex/values";
import {
  COLORS,
  MODES,
  PALETTE,
  POINTS,
  ROUTES,
  TICKETS,
  TICKET_BY_ID,
  type Color,
  type Mode,
  type Route,
  type Ticket,
} from "./game/data";
import {
  connected,
  routeAvailable,
  paymentOptions,
  type Action,
  type Game,
  type View,
} from "./game/engine";
import TrainCard, { type CardPoint } from "./components/TrainCard";
import {
  cardPayment,
  automaticRoute,
  parallelBlockReason,
  TICKET_INKS,
  type TicketPreview,
} from "./game/interactions";
import Music from "./components/Music";
import Scoreboard, {
  ScoreRevealCard,
  useScoreReveal,
} from "./components/Scoreboard";
import { TrainArtwork, ConductorPortrait } from "./components/TrainArtwork";
import { cue } from "./audio";
import { useAuthActions } from "@convex-dev/auth/react";
const Board = lazy(() => import("./components/Board"));
function getToken() {
  let t = localStorage.getItem("railbound-session");
  if (!t) {
    t = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem("railbound-session", t);
  }
  return t;
}
const token = getToken();
const roomFromUrl = () =>
  location.pathname
    .match(/^\/(?:ticket\/)?room\/([a-z0-9]+)\/?$/i)?.[1]
    .toUpperCase() || "";
class BoardBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="board-error">
        <Compass size={36} />
        <h3>Map unavailable</h3>
        <p>You can still play using the route list. Try reloading the page.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function BoardView(props: React.ComponentProps<typeof Board>) {
  return (
    <BoardBoundary>
      <Suspense
        fallback={
          <div className="board-loading">
            <LoaderCircle className="spin" />
            <span>Loading map…</span>
          </div>
        }
      >
        <Board {...props} />
      </Suspense>
    </BoardBoundary>
  );
}
function Modal({
  children,
  onClose,
  label,
  wide = false,
}: {
  children: ReactNode;
  onClose?: () => void;
  label: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && onClose) onClose();
      if (e.key === "Tab" && el) {
        const items = el.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,a[href],[tabindex="0"]',
        );
        if (!items.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
      >
        {onClose && (
          <button
            className="icon close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
function TicketTile({
  ticket,
  complete,
  selected,
  onClick,
  onHover,
  ink,
  number,
}: {
  ticket: Ticket;
  complete?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onHover?: (cities: string[]) => void;
  ink?: string;
  number?: number;
}) {
  return (
    <button
      className={`ticket-tile ${selected ? "selected" : ""} ${complete ? "complete" : ""}`}
      style={ink ? ({ "--ticket-ink": ink } as React.CSSProperties) : undefined}
      onClick={() => {
        if (onClick) {
          cue("card");
          onClick();
        }
      }}
      onFocus={() => onHover?.([ticket.a, ticket.b])}
      onBlur={() => onHover?.([])}
      onMouseEnter={() => onHover?.([ticket.a, ticket.b])}
      onMouseLeave={() => onHover?.([])}
      aria-pressed={selected}
    >
      <div className="ticket-stamp">
        {number !== undefined && <b className="ticket-number">{number}</b>}
        {complete ? <Check size={18} /> : <TicketIcon size={18} />}
        <span>
          {ticket.set === "1910"
            ? "1910"
            : ticket.set === "mystery"
              ? "MYSTERY"
              : "USA"}
        </span>
      </div>
      <div className="ticket-cities">
        <strong>{ticket.a}</strong>
        <span>↓</span>
        <strong>{ticket.b}</strong>
      </div>
      <div className="ticket-value">
        {ticket.points}
        <small>POINTS</small>
      </div>
      {selected !== undefined && (
        <span className="ticket-check">
          {selected ? <Check size={15} /> : <Plus size={15} />}
        </span>
      )}
    </button>
  );
}
function Rules({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="How to play" onClose={onClose} wide>
      <div className="eyebrow">RULES</div>
      <h2>How to play</h2>
      <p>
        Build railways between cities to complete your secret destination
        tickets. The highest final score wins.
      </p>
      <div className="rules-grid">
        <article>
          <b>01 · Collect train cards</b>
          <p>
            Take two cards from the market or hidden deck. A face-up rainbow
            card is wild and uses your entire turn; you cannot take it as your
            second card. A hidden rainbow card counts as one draw.
          </p>
        </article>
        <article>
          <b>02 · Claim a route</b>
          <p>
            Click a track or open the route list. Pay one matching card for each
            space. Gray routes use any one color; rainbow cards can replace any
            cards. You choose exactly how many rainbow cards to spend.
          </p>
        </article>
        <article>
          <b>03 · Take new tickets</b>
          <p>
            Instead of drawing trains or claiming a route, draw destination
            tickets and keep at least one. Kept tickets stay secret and cannot
            be discarded. Rejected tickets return to the bottom of the deck.
          </p>
        </article>
        <article>
          <b>04 · Finish the game</b>
          <p>
            When a player finishes a turn with two or fewer trains, everyone
            gets one last turn—including that player. Completed tickets add
            their points; unfinished tickets subtract them.
          </p>
        </article>
      </div>
      <div className="rule-note">
        <strong>Details that matter</strong>
        <p>
          Each player starts with 45 trains and four cards. With 2–3 players
          only one half of a double route can be used. With 4–5 players both
          halves can be claimed by different players. Three face-up rainbow
          cards clear the market. Empty train decks refill from discards.
        </p>
        <p>
          Route lengths 1 / 2 / 3 / 4 / 5 / 6 score 1 / 2 / 4 / 7 / 10 / 15
          points. Longest route is a continuous trail that can revisit cities
          but never reuse a track. Tied players all receive the relevant bonus.
          Score ties break by completed tickets, then possession of the
          longest-route bonus.
        </p>
      </div>
      <div className="mode-rule-table">
        {Object.entries(MODES).map(([key, m]) => (
          <div key={key}>
            <strong>{m.name}</strong>
            <span>
              Start {m.initial}, keep {m.keep}+
            </span>
            <span>Draw {m.draw}, keep 1+</span>
            <span>
              {m.longest ? "+10 longest " : ""}
              {m.globe ? "+15 tickets" : ""}
              {!m.longest && !m.globe ? "No bonus" : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="muted small">
        Uses the USA 1910 ticket values and Anniversary Big Cities rules. An
        independent, unofficial implementation with original artwork. Ticket to
        Ride was designed by Alan R. Moon and is a trademark of Days of Wonder.
      </p>
    </Modal>
  );
}

export default function App({ username }: { username: string }) {
  const { signOut } = useAuthActions();
  const [watching, setWatching] = useState(() =>
    new URLSearchParams(location.search).has("watch"),
  );
  const [code, setCode] = useState(roomFromUrl),
    [name] = useState(username),
    [mode, setMode] = useState<Mode>("mega"),
    [joinCode, setJoinCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [rules, setRules] = useState(false),
    [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<Route | null>(null),
    [focus, setFocus] = useState<string[]>([]),
    [reset, setReset] = useState(0),
    [top, setTop] = useState(false),
    [tab, setTab] = useState<"tickets" | "chat" | "log" | "scoreboard">(
      "tickets",
    ),
    [routesOpen, setRoutesOpen] = useState(false),
    [filter, setFilter] = useState(""),
    [catalog, setCatalog] = useState(false),
    [resign, setResign] = useState(false);
  const [cardColor, setCardColor] = useState<Color | null>(null),
    [dragPoint, setDragPoint] = useState<CardPoint | null>(null),
    [dropRoute, setDropRoute] = useState<string>();
  const pendingDraw = useRef<{
    code: string;
    hand: Color[];
    from: DrawFlight["from"];
  } | null>(null);
  const [drawFlights, setDrawFlights] = useState<DrawFlight[]>([]);
  const flightSequence = useRef(0);
  const finishFlight = useCallback(
    (id: number) =>
      setDrawFlights((flights) => flights.filter((f) => f.id !== id)),
    [],
  );
  const dragSession = useRef<{ color: Color; point: CardPoint } | null>(null);
  const dragGhost = useRef<HTMLDivElement>(null);
  const dragFrame = useRef<number | null>(null);
  const lastDragTarget = useRef<string | undefined>(undefined);
  const releaseDrag = useRef<(point: CardPoint) => void>(() => {});
  const [ticketSelection, setTicketSelection] = useState<string[]>([]),
    [pinnedTickets, setPinnedTickets] = useState<string[]>([]),
    [hoveredTicket, setHoveredTicket] = useState<string>();
  const client = useConvex();
  const tableQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingTableRef = useRef(new Set<string>());
  const [pendingTable, setPendingTable] = useState<string[]>([]);
  const create = useMutation(api.rooms.create),
    join = useMutation(api.rooms.join),
    play = useMutation(api.rooms.play),
    manage = useMutation(api.rooms.manage).withOptimisticUpdate(
      (store, args) => {
        if (args.operation !== "mode" && args.operation !== "timer") return;
        const queryArgs = { code: args.code, token: args.token };
        const current = store.getQuery(api.rooms.get, queryArgs);
        if (current?.game)
          store.setQuery(api.rooms.get, queryArgs, {
            ...current,
            game: {
              ...current.game,
              ...(args.operation === "mode"
                ? { mode: args.mode! }
                : { turnSeconds: args.turnSeconds! }),
            },
          });
      },
    ),
    send = useMutation(api.rooms.send);
  const room = useQuery(api.rooms.get, code ? { code, token } : "skip");
  const game = room?.game as View | null | undefined;
  const me = game?.me;
  const playerColors = useMemo(
    () => playerDisplayColors(game, code),
    [game?.players, me?.id, code],
  );
  const completion = useDestinationFeedback(game, code);
  const scoreReveal = useScoreReveal(me || watching ? game : undefined, code);
  useEffect(() => {
    if (game?.phase === "finished") {
      setTab("scoreboard");
      setSelected(null);
    } else if (game?.phase === "lobby") setTab("tickets");
  }, [game?.phase, code]);
  const connection = useConvexConnectionState();
  const connectedServer = connection.isWebSocketConnected;
  const {
    results: messages,
    status: chatStatus,
    loadMore: loadMoreChat,
  } = usePaginatedQuery(
    api.rooms.chat,
    code && game ? { code, token } : "skip",
    { initialNumItems: 50 },
  );
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatNotices, setChatNotices] = useState<
    {
      _id: string;
      code: string;
      time: number;
      text: string;
      name: string;
      sender: string;
    }[]
  >([]);
  const chatMessages = [
    ...messages,
    ...chatNotices.filter((m) => m.code === code),
  ].sort((a, b) => a.time - b.time);
  const activeTab =
    game?.phase === "lobby" || (!me && tab === "tickets") ? "chat" : tab;
  const chatEnd = useRef<HTMLDivElement>(null);
  const messagesBox = useRef<HTMLDivElement>(null);
  const olderChatScroll = useRef<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const box = messagesBox.current;
    if (box) {
      const prior = olderChatScroll.current;
      box.scrollTop = prior
        ? prior.top + box.scrollHeight - prior.height
        : box.scrollHeight;
      olderChatScroll.current = null;
    }
  }, [chatMessages.length, activeTab]);
  useEffect(() => {
    const pop = () => {
      setCode(roomFromUrl());
      setWatching(new URLSearchParams(location.search).has("watch"));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (code) localStorage.setItem("railbound-last-room", code);
  }, [code]);
  const mine =
    !!me &&
    game?.phase === "playing" &&
    game.players[game.turn]?.id === me.id &&
    !me.bot;
  const wasMine = useRef(false);
  useEffect(() => {
    if (mine && !wasMine.current) cue("turn");
    wasMine.current = mine;
  }, [mine]);
  useEffect(() => {
    setTicketSelection([]);
    setHoveredTicket(undefined);
  }, [code, me?.pending.join("|")]);
  useEffect(() => {
    if (!mine) {
      dragSession.current = null;
      setCardColor(null);
      setDragPoint(null);
      setDropRoute(undefined);
    }
  }, [mine]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragSession.current = null;
        setCardColor(null);
        setDragPoint(null);
        setDropRoute(undefined);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const previewIds = me?.pending.length
    ? ticketSelection
    : pinnedTickets.filter((id) => me?.tickets.includes(id));
  const previews: TicketPreview[] = previewIds.map((id, i) => ({
    ticket: TICKET_BY_ID[id],
    color: TICKET_INKS[i % TICKET_INKS.length],
    hovered: id === hoveredTicket,
  }));
  if (hoveredTicket && !previewIds.includes(hoveredTicket))
    previews.push({
      ticket: TICKET_BY_ID[hoveredTicket],
      color: TICKET_INKS[previews.length % TICKET_INKS.length],
      hovered: true,
    });
  useEffect(() => {
    const pending = pendingDraw.current;
    if (
      !pending ||
      pending.code !== code ||
      !me ||
      me.hand.length !== pending.hand.length + 1
    )
      return;
    const remaining = [...me.hand];
    for (const color of pending.hand) {
      const index = remaining.indexOf(color);
      if (index >= 0) remaining.splice(index, 1);
    }
    if (remaining.length === 1) {
      pendingDraw.current = null;
      setDrawFlights((flights) => [
        ...flights,
        {
          id: ++flightSequence.current,
          color: remaining[0],
          from: pending.from,
        },
      ]);
    }
  }, [me?.hand, code]);
  useEffect(() => {
    pendingDraw.current = null;
    setDrawFlights([]);
  }, [code]);
  const host = !!me && game?.players[0]?.id === me.id;
  const canAct = mine && !busy && connectedServer && !me?.pending.length;
  const options =
    selected && game && me
      ? paymentOptions(game as unknown as Game, me, selected)
      : [];
  const eligible = useMemo(
    () =>
      cardColor && game && canAct && !game.drawn
        ? ROUTES.filter((r) => cardPayment(game, r, cardColor)).map((r) => r.id)
        : undefined,
    [cardColor, game, canAct],
  );
  function routeAt(point: CardPoint) {
    const world = document.querySelector<SVGGElement>("[data-map-world]");
    const map = world?.ownerSVGElement;
    if (!map) return undefined;
    const rect = map.getBoundingClientRect();
    if (
      point.x < rect.left ||
      point.x > rect.right ||
      point.y < rect.top ||
      point.y > rect.bottom
    )
      return undefined;
    const matrix = world.getScreenCTM();
    if (!matrix) return undefined;
    const local = new DOMPoint(point.x, point.y).matrixTransform(
      matrix.inverse(),
    );
    return routeAtMapPoint(local.x, local.y);
  }
  function dragCard(color: Color, point: CardPoint) {
    if (!canAct || game?.drawn) return;
    const starting = !dragSession.current;
    dragSession.current = { color, point };
    if (starting) {
      setCardColor(color);
      setDragPoint(point);
      setSelected(null);
    }
    // Pointer coordinates belong to the compositor, not React state. Resolve
    // at most one hit per animation frame and render only when the route changes.
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      const session = dragSession.current;
      if (!session) return;
      // Read SVG geometry before moving the ghost, avoiding a write/read layout flush.
      const hit = ROUTES.find((r) => r.id === routeAt(session.point));
      const target =
        hit && game
          ? (automaticRoute(game, hit, session.color)?.id ?? hit.id)
          : undefined;
      if (dragGhost.current)
        dragGhost.current.style.translate = `${session.point.x}px ${session.point.y}px`;
      if (target !== lastDragTarget.current) {
        lastDragTarget.current = target;
        setDropRoute(target);
        const paths =
          hit && game
            ? tracks
                .filter(
                  (t) =>
                    t.route.a === hit.a &&
                    t.route.b === hit.b &&
                    routeAvailable(game as unknown as Game, game.me!, t.route),
                )
                .map((t) => t.path)
                .join(" ")
            : "";
        document
          .querySelector("[data-drag-highlight]")
          ?.setAttribute("d", paths);
      }
    });
  }
  useEffect(() => {
    if (!dragPoint) {
      lastDragTarget.current = undefined;
      const overlay = document.querySelector("[data-drag-highlight]");
      if (overlay?.getAttribute("d")) overlay.setAttribute("d", "");
    }
  }, [dragPoint]);
  function cancelCard() {
    dragSession.current = null;
    setCardColor(null);
    setDragPoint(null);
    setDropRoute(undefined);
  }
  function dropCard(color: Color, point: CardPoint) {
    if (dragSession.current?.color !== color) return;
    const id = routeAt(point);
    cancelCard();
    const route = ROUTES.find((r) => r.id === id);
    if (route) claimWithCard(route, color);
  }
  releaseDrag.current = (point) => {
    const session = dragSession.current;
    if (session) dropCard(session.color, point);
  };
  useEffect(() => {
    const release = (event: MouseEvent) =>
      releaseDrag.current({ x: event.clientX, y: event.clientY });
    const cancel = () => {
      dragSession.current = null;
      setCardColor(null);
      setDragPoint(null);
      setDropRoute(undefined);
    };
    // Release at the window as well as the source card: browsers can transfer
    // capture during a native drag, zoom gesture, or a rapid pointer movement.
    window.addEventListener("pointerup", release, true);
    window.addEventListener("mouseup", release, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("mouseup", release, true);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  function claimWithCard(route: Route, color: Color) {
    if (!game || !canAct || game.drawn) return;
    route = automaticRoute(game, route, color) ?? route;
    const payment = cardPayment(game, route, color);
    if (!payment) {
      if (parallelBlockReason(game, route)) {
        setSelected(route);
        return;
      }
      setError("That route needs more matching cards or is already blocked.");
      return;
    }
    cancelCard();
    void action({ type: "claim", route: route.id, ...payment });
  }
  const dragRoute = ROUTES.find((r) => r.id === dropRoute),
    dragPayment =
      game && dragRoute && cardColor
        ? cardPayment(game, dragRoute, cardColor)
        : undefined;
  const visit = (roomCode: string) => {
    history.pushState(
      {},
      "",
      roomCode ? "/ticket/room/" + roomCode : "/ticket",
    );
    setCode(roomCode);
    setWatching(false);
    setSelected(null);
    setError("");
  };
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof ConvexError && typeof e.data === "string"
          ? e.data
          : e instanceof Error && !e.message.includes("[CONVEX")
            ? e.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(a: Action) {
    if (!room) return;
    await run(async () => {
      // Starting waits for earlier setup changes and reads their final revision.
      let revision = room.revision;
      if (a.type === "start") {
        await tableQueue.current;
        const latest = await client.query(api.rooms.get, { code, token });
        if (!latest?.game) return;
        revision = latest.revision;
      }
      if (a.type === "draw" && me) {
        const source =
          a.source < 0
            ? document.querySelector(".face-down-pile .train-card")
            : document.querySelector(
                `.market-cards [data-market-source="${a.source}"]`,
              );
        const rect = source?.getBoundingClientRect();
        if (rect)
          pendingDraw.current = {
            code,
            hand: [...me.hand],
            from: {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              width: rect.width,
            },
          };
      }
      try {
        await play({ code, token, revision, action: a });
      } catch (error) {
        if (a.type === "draw") pendingDraw.current = null;
        throw error;
      }
      if (a.type === "claim") {
        setSelected(null);
        setFocus([]);
      }
      if (["draw", "claim", "tickets"].includes(a.type))
        cue(a.type as "draw" | "claim" | "tickets");
    });
  }
  function saveName() {
    localStorage.setItem("railbound-name", name.trim());
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        location.origin + "/ticket/room/" + code,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy this room link from your browser address bar.");
    }
  };
  const select = (r: Route | null) => {
    if (r && cardColor && canAct) {
      claimWithCard(r, cardColor);
      return;
    }
    if (r && game) r = automaticRoute(game, r) ?? r;
    setSelected(r);
    if (r) setFocus([r.a, r.b]);
    else setFocus([]);
  };
  const chatSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = chatText.trim();
    if (!text || sendingChat) return;
    setSendingChat(true);
    try {
      await send({ code, token, text });
      setChatText((current) => (current.trim() === text ? "" : current));
    } catch (e) {
      const message =
        e instanceof ConvexError && typeof e.data === "string"
          ? e.data
          : "Message could not be sent. Please try again.";
      setChatNotices((current) => [
        ...current,
        {
          _id: clientId(),
          code,
          time: Date.now(),
          text: message,
          name: "Server",
          sender: "local-server",
        },
      ]);
    } finally {
      setSendingChat(false);
    }
  };
  const setTable = async (
    operation:
      "bot" | "remove" | "mode" | "timer" | "rematch" | "leave" | "resign",
    extra: {
      player?: string;
      mode?: Mode;
      turnSeconds?: 0 | 30 | 60 | 90 | 120;
    } = {},
  ) => {
    const key =
      operation === "mode" || operation === "timer"
        ? operation + ":" + clientId()
        : operation + (extra.player ?? "");
    if (pendingTableRef.current.has(key)) return;
    pendingTableRef.current.add(key);
    setPendingTable([...pendingTableRef.current]);
    // Send immediately so optimistic mode changes appear on the same click.
    // Start awaits this barrier; unrelated controls have no shared pending state.
    const task = manage({ code, token, operation, ...extra });
    tableQueue.current = Promise.all([
      tableQueue.current.catch(() => {}),
      task.catch(() => {}),
    ]);
    try {
      await task;
      if (operation === "leave") visit("");
      if (operation === "resign") {
        setResign(false);
        visit("");
      }
    } catch (e) {
      setError(
        e instanceof ConvexError && typeof e.data === "string"
          ? e.data
          : "Could not update the game. Please try again.",
      );
    } finally {
      pendingTableRef.current.delete(key);
      setPendingTable([...pendingTableRef.current]);
    }
  };
  return (
    <div className={`app ${code ? "at-table" : ""}`}>
      <header className="masthead">
        <button
          className="brand"
          onClick={() => visit("")}
          aria-label="Ticket to Ride home"
        >
          <span>Ticket to Ride</span>
        </button>
        <nav>
          <Music />
          {code && (
            <button className="room-code" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{code}</span>
            </button>
          )}
          <button className="nav-help" onClick={() => setRules(true)}>
            <BookOpen size={17} />
            <span>How to play</span>
          </button>
          <details
            className="account-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary>
              {username}
              <ChevronDown size={14} />
            </summary>
            <div className="account-menu-panel">
              <a className="games-back" href="/">
                Games
              </a>
              <button onClick={() => void signOut()}>
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </details>
        </nav>
      </header>
      {!connectedServer && code && (
        <div className="connection-banner">
          <WifiOff size={15} />
          Reconnecting… Your seat and progress are saved. Moves resume when
          connected.
        </div>
      )}
      {error && (
        <div role="alert" className="toast">
          <span>{error}</span>
          <button
            className="icon"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {!code && location.pathname.endsWith("/ending-preview") ? (
        <main className="ending-preview-page">
          <h1>Test the ending</h1>
          <p>
            This game has one turn left. Draw two cards to start the score
            reveal.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
              void run(async () =>
                visit(
                  await create({
                    token,
                    name,
                    mode: "mega",
                    endingPreview: true,
                  }),
                ),
              );
            }}
          >
            <button className="primary full" disabled={busy || !name.trim()}>
              Create ending preview <ArrowRight size={18} />
            </button>
          </form>
        </main>
      ) : !code ? (
        <main className="home-page">
          <section className="hero-copy">
            <h1>Ticket to Ride</h1>
            <form
              className="boarding-form"
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
                void run(async () =>
                  visit(await create({ token, name, mode })),
                );
              }}
            >
              <div className="mode-label">
                <label htmlFor="mode">GAME MODE</label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setCatalog(true)}
                >
                  View the tickets <ArrowRight size={12} />
                </button>
              </div>
              <div className="select-wrap">
                <select
                  id="mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                >
                  {Object.entries(MODES).map(([key, m]) => (
                    <option key={key} value={key}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={17} />
              </div>
              <p className="mode-description">{MODES[mode].description}</p>
              <button
                className="primary create-room"
                disabled={busy || !name.trim()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Plus size={18} />
                )}
                Create a game
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="join-divider">
              <span />
              Join your friends
              <span />
            </div>
            <form
              className="join-form"
              onSubmit={(e) => {
                e.preventDefault();
                visit(joinCode.toUpperCase().trim());
              }}
            >
              <input
                aria-label="Room code"
                placeholder="Enter room code"
                required
                minLength={8}
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <button
                className="secondary"
                disabled={busy || !name.trim() || joinCode.length !== 8}
              >
                Open <ArrowRight size={16} />
              </button>
            </form>
          </section>
          <section className="hero-world" aria-label="USA map">
            <div className="hero-board">
              <BoardView onSelect={() => {}} top={false} />
            </div>
          </section>
        </main>
      ) : room === undefined ? (
        <div className="page-loading">
          <LoaderCircle className="spin" />
          <h2>Loading game…</h2>
        </div>
      ) : !room ? (
        <div className="page-loading">
          <TicketIcon size={40} />
          <h2>That table couldn’t be found.</h2>
          <p>Check the eight-character room code and try again.</p>
          <button className="primary" onClick={() => visit("")}>
            Back to home
          </button>
        </div>
      ) : !game || (!me && !watching) ? (
        <main className="join-page">
          <div className="join-illustration">
            <TrainFront size={70} strokeWidth={1} />
          </div>
          <h1>Join game</h1>
          <p>
            Table <strong>{code}</strong> · {room.seats}/5 seats filled
          </p>
          {room.phase === "lobby" && room.seats < 5 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
                void run(async () => {
                  await join({ code, token, name });
                });
              }}
            >
              <button className="primary" disabled={busy || !name.trim()}>
                Join game <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <p>
              {room.phase === "lobby"
                ? "This table is full."
                : "The game has already started. Sign in with the account you used to join to recover your seat."}
            </p>
          )}
          <button
            className="secondary"
            onClick={() => {
              history.replaceState({}, "", `/ticket/room/${code}?watch=1`);
              setWatching(true);
              setTab("chat");
            }}
          >
            Watch game
          </button>
          <button className="text-button" onClick={() => visit("")}>
            Back to home
          </button>
        </main>
      ) : (
        <main
          className={`table-layout ${!me ? "spectating" : ""} ${game.phase === "lobby" ? "lobby-layout" : ""} ${game.phase === "finished" ? "finished-layout" : ""}`}
        >
          <section className="table-main">
            <div className="table-heading compact-heading">
              <div />
              <div className="table-meta">
                <span className="live-dot" />
                {game.phase === "lobby"
                  ? ""
                  : game.phase === "setup"
                    ? "CHOOSING TICKETS"
                    : game.phase === "finished"
                      ? ""
                      : `TURN ${game.turnNumber}`}
              </div>
            </div>
            {game.phase !== "lobby" && (
              <div className="player-strip">
                {game.players.map((p, i) => (
                  <div
                    className={`player-pill ${game.phase === "playing" && game.turn === i ? "active" : ""}`}
                    key={p.id}
                    aria-current={
                      game.phase === "playing" && game.turn === i
                        ? "true"
                        : undefined
                    }
                    style={
                      {
                        "--player": playerColors[p.id],
                      } as React.CSSProperties
                    }
                  >
                    <span
                      className="avatar"
                      style={{ background: playerColors[p.id] }}
                    >
                      <ConductorPortrait
                        index={p.color}
                        color={playerColors[p.id]}
                      />
                      <b className="player-number">{p.color + 1}</b>
                    </span>
                    <div>
                      <div className="player-heading">
                        <strong>
                          {p.name}
                          {p.id === me?.id ? " (you)" : ""}
                        </strong>
                      </div>
                      <small>
                        {game.phase === "lobby"
                          ? i === 0
                            ? "Host · ready to roll"
                            : "Ready to roll"
                          : game.phase === "setup"
                            ? p.ready
                              ? "Tickets chosen"
                              : "Choosing tickets"
                            : `${p.trains} trains · ${p.handCount} cards · ${p.ticketCount} tickets`}
                      </small>
                    </div>
                    {game.phase === "finished" && (
                      <b className="player-score">
                        {scoreReveal.done
                          ? game.results.find((r) => r.id === p.id)?.total
                          : (scoreReveal.totals[p.id] ?? 0)}
                        <small>PTS</small>
                      </b>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="board-shell">
              <BoardView
                colorSeed={code}
                completedTickets={completion?.tickets}
                game={game}
                selected={selected?.id}
                onSelect={select}
                focus={
                  scoreReveal.step?.ticket
                    ? [
                        TICKET_BY_ID[scoreReveal.step.ticket].a,
                        TICKET_BY_ID[scoreReveal.step.ticket].b,
                      ]
                    : focus
                }
                scoreRoutes={scoreReveal.step?.routes}
                reset={reset}
                top={top}
                previews={
                  game.phase === "finished" && !scoreReveal.done ? [] : previews
                }
                eligible={eligible}
                controls={
                  <>
                    <button
                      className="icon"
                      onClick={() => setReset((v) => v + 1)}
                      aria-label="Reset map"
                      title="Reset map"
                    >
                      <RotateCcw size={17} />
                    </button>
                    <button
                      className={`icon ${top ? "is-active" : ""}`}
                      onClick={() => setTop(!top)}
                      aria-label="Toggle close-up view"
                      title="Close-up view"
                    >
                      <Maximize size={17} />
                    </button>
                    <button
                      className="icon"
                      onClick={() => setRoutesOpen(true)}
                      aria-label="Open route list"
                      title="Route list"
                    >
                      <List size={17} />
                    </button>
                  </>
                }
              />
              <GameEvents
                game={me || watching ? game : undefined}
                room={code}
                revealDone={scoreReveal.done}
              />
              {game.phase === "finished" && !scoreReveal.done && (
                <ScoreRevealCard
                  game={game}
                  reveal={scoreReveal}
                  colors={playerColors}
                />
              )}
              {completion && game.phase !== "finished" && (
                <DestinationFeedback
                  key={completion.id}
                  tickets={completion.tickets}
                />
              )}
              {game.finalTurns !== null && game.phase !== "finished" && (
                <div className="final-round">
                  <Flag size={15} />
                  FINAL ROUND · {game.finalTurns} turns remain
                </div>
              )}
              {selected && game.phase !== "lobby" && (
                <div className="route-popover">
                  <button
                    className="icon close"
                    onClick={() => select(null)}
                    aria-label="Close route"
                  >
                    <X size={16} />
                  </button>
                  <div className="eyebrow">
                    {selected.color.toUpperCase()} ROUTE · {selected.length}{" "}
                    TRAINS · {POINTS[selected.length]} POINTS
                  </div>
                  <h3>
                    {selected.a} <ArrowRight size={16} /> {selected.b}
                  </h3>
                  {game.claimed[selected.id] ? (
                    <p>
                      Claimed by{" "}
                      {
                        game.players.find(
                          (p) => p.id === game.claimed[selected.id],
                        )?.name
                      }
                    </p>
                  ) : options.length ? (
                    <div className="quick-payments">
                      {options
                        .filter(
                          (o, i, all) =>
                            i === all.findIndex((v) => v.color === o.color),
                        )
                        .map((o) => (
                          <button
                            key={o.color}
                            className="payment-card"
                            style={
                              {
                                "--card": PALETTE[o.color],
                              } as React.CSSProperties
                            }
                            disabled={!canAct || !!game.drawn}
                            aria-label={`Claim route with ${selected.length - o.wilds} ${o.color}${o.wilds ? ` and ${o.wilds} rainbow cards` : ""}`}
                            onClick={() =>
                              action({
                                type: "claim",
                                route:
                                  automaticRoute(game, selected, o.color)?.id ??
                                  selected.id,
                                ...o,
                              })
                            }
                          >
                            <TrainArtwork color={o.color} />
                            <span>
                              {selected.length - o.wilds} {o.color}
                              {o.wilds ? ` + ${o.wilds} ★` : ""}
                            </span>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <p>
                      {game.phase === "finished"
                        ? "Unclaimed."
                        : parallelBlockReason(game, selected) ||
                          "Not enough matching cards or trains."}
                    </p>
                  )}
                </div>
              )}
            </div>
            {game.phase !== "lobby" && me && (
              <section className="hand-panel">
                <div className="hand-title">
                  <h3>
                    Cards <span>{me.hand.length}</span>
                  </h3>
                  <p>
                    <TrainFront size={14} />
                    {me.trains} trains remaining
                  </p>
                </div>
                <div className="hand-cards">
                  {COLORS.map((c) => (
                    <TrainCard
                      key={c}
                      color={c}
                      count={me.hand.filter((v) => v === c).length}
                      disabled={!me.hand.includes(c)}
                      selected={cardColor === c}
                      onClick={() => {
                        if (canAct && !game.drawn) {
                          setCardColor(cardColor === c ? null : c);
                          setSelected(null);
                        }
                      }}
                      onDrag={canAct && !game.drawn ? dragCard : undefined}
                      onDrop={dropCard}
                      onCancel={cancelCard}
                    />
                  ))}
                </div>
              </section>
            )}
          </section>
          <aside
            className={`table-sidebar ${me?.pending.length ? "choosing-tickets" : ""}`}
          >
            <div className="table-actions">
              {!me && game.phase === "lobby" && game.players.length < 5 && (
                <button
                  className="primary full"
                  disabled={busy}
                  onClick={() => void run(() => join({ code, token, name }))}
                >
                  Join game
                </button>
              )}
              {game.phase === "finished" && host && (
                <button
                  className="primary full"
                  disabled={pendingTable.includes("rematch")}
                  onClick={() => setTable("rematch")}
                >
                  <RotateCcw size={17} /> Play again
                </button>
              )}
              {game.phase === "lobby" &&
                (host ? (
                  <button
                    className="primary full"
                    disabled={
                      busy || game.players.length < 2 || !connectedServer
                    }
                    onClick={() => action({ type: "start" })}
                    aria-busy={busy}
                  >
                    Start game <ArrowRight size={18} />
                  </button>
                ) : (
                  <p className="waiting-note">Waiting for the host to start…</p>
                ))}
              <button
                className="secondary full leave-table"
                disabled={
                  pendingTable.includes("leave") ||
                  pendingTable.includes("resign")
                }
                onClick={() =>
                  !me
                    ? visit("")
                    : game.phase === "lobby"
                      ? setTable("leave")
                      : !me?.bot && game.phase !== "finished"
                        ? setResign(true)
                        : visit("")
                }
              >
                <LogOut size={16} /> Leave table
              </button>
            </div>
            {!me && <p className="spectator-status">SPECTATING</p>}
            {game.phase !== "lobby" && game.phase !== "finished" && (
              <TurnPanel game={game} mine={mine} serverNow={room!.serverNow} />
            )}
            {me?.pending.length && !me.bot ? (
              <TicketChoice
                game={game}
                busy={busy}
                selected={ticketSelection}
                onSelection={setTicketSelection}
                onHover={setHoveredTicket}
                onKeep={(ids) => action({ type: "keep", tickets: ids })}
              />
            ) : (
              <>
                {game.phase === "lobby" ? (
                  <>
                    <div className="lobby-options">
                      <div>
                        {" "}
                        <label htmlFor="table-mode">GAME MODE</label>
                        <select
                          id="table-mode"
                          value={game.mode}
                          disabled={!host || busy}
                          aria-busy={pendingTable.some((key) =>
                            key.startsWith("mode"),
                          )}
                          onChange={(e) =>
                            setTable("mode", { mode: e.target.value as Mode })
                          }
                        >
                          {Object.entries(MODES).map(([k, m]) => (
                            <option key={k} value={k}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        {" "}
                        <label htmlFor="turn-timer">TURN TIMER</label>
                        <select
                          id="turn-timer"
                          title="At expiry, draw face-down cards to finish the turn."
                          value={game.turnSeconds ?? 0}
                          disabled={!host}
                          aria-busy={pendingTable.some((key) =>
                            key.startsWith("timer"),
                          )}
                          onChange={(e) =>
                            setTable("timer", {
                              turnSeconds: Number(e.target.value) as
                                0 | 30 | 60 | 90 | 120,
                            })
                          }
                        >
                          <option value={0}>Off</option>
                          <option value={30}>30 seconds</option>
                          <option value={60}>60 seconds</option>
                          <option value={90}>90 seconds</option>
                          <option value={120}>2 minutes</option>
                        </select>
                      </div>
                    </div>{" "}
                    <p className="mode-description">
                      {MODES[game.mode].description}
                    </p>
                    <button className="invite-box" onClick={copy}>
                      <div>
                        <small>YOUR PRIVATE ROOM</small>
                        <strong>{code}</strong>
                      </div>
                      {copied ? <Check size={21} /> : <Copy size={21} />}
                    </button>
                    <p className="small muted">
                      Click to copy the invitation link. Your friends can join
                      after signing in with Google.
                    </p>
                    {host && (
                      <button
                        className="add-bot"
                        onClick={() => setTable("bot")}
                        disabled={
                          pendingTable.includes("bot") ||
                          busy ||
                          game.players.length >= 5
                        }
                        aria-busy={pendingTable.includes("bot")}
                      >
                        <Plus size={16} />
                        Add computer opponent
                      </button>
                    )}
                    <div className="seat-list" aria-label="Players">
                      {game.players.map((p) => (
                        <div key={p.id}>
                          <span style={{ color: playerColors[p.id] }}>
                            {p.bot ? <Bot size={19} /> : <Users size={19} />}
                          </span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.bot
                              ? "COMPUTER"
                              : p.id === game.players[0].id
                                ? "HOST"
                                : "PLAYER"}
                          </small>
                          {host && p.id !== me?.id && (
                            <button
                              className="icon"
                              disabled={pendingTable.includes("remove" + p.id)}
                              aria-label={`Remove ${p.name}`}
                              onClick={() =>
                                setTable("remove", { player: p.id })
                              }
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                      {Array.from(
                        { length: 5 - game.players.length },
                        (_, i) => (
                          <div
                            className="open-seat"
                            key={`open-${i}`}
                            aria-hidden="true"
                          >
                            <Users size={19} />
                            <span>
                              {i === 0 && pendingTable.includes("bot")
                                ? "Adding computer…"
                                : "Open seat"}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </>
                ) : game.phase === "finished" ? null : (
                  <>
                    <div className="market-heading">
                      <h3>Cards</h3>
                      <span>{game.deckCount + game.discardCount} in deck</span>
                    </div>
                    <div className="market-cards">
                      {[0, 1, 2, 3, 4].map((slot) => {
                        const i = (
                          game.marketSlots ??
                          game.market.map((_, index) => index)
                        ).indexOf(slot);
                        const c = game.market[i];
                        return c ? (
                          <TrainCard
                            key={slot}
                            marketSource={i}
                            color={c}
                            label={`Draw ${c === "wild" ? "rainbow" : c} market card ${slot + 1}`}
                            onClick={() =>
                              action({ type: "draw", source: i, expected: c })
                            }
                            disabled={!canAct || (!!game.drawn && c === "wild")}
                          />
                        ) : (
                          <div
                            key={slot}
                            className="empty-market-slot"
                            aria-label={`Empty market slot ${slot + 1}`}
                          />
                        );
                      })}
                    </div>
                    <div
                      className={`draw-piles ${!me ? "spectator-hidden" : ""}`}
                    >
                      <div className="face-down-pile">
                        <TrainCard
                          color="back"
                          onClick={() => action({ type: "draw", source: -1 })}
                          disabled={
                            !canAct || game.deckCount + game.discardCount === 0
                          }
                          label="Draw from hidden deck"
                        />
                        <span>Draw a random card</span>
                      </div>
                      <button
                        className="destination-draw"
                        disabled={
                          !canAct || game.drawn > 0 || !game.ticketCount
                        }
                        onClick={() => action({ type: "tickets" })}
                      >
                        <TicketIcon size={21} />
                        <span>
                          <strong>Draw destination tickets</strong>
                          <small>
                            Draw {MODES[game.mode].draw} · keep at least 1
                          </small>
                        </span>
                        <span className="deck-badge">{game.ticketCount}</span>
                      </button>
                    </div>
                    {canAct &&
                      game.deckCount +
                        game.discardCount +
                        game.market.length +
                        game.ticketCount ===
                        0 &&
                      !ROUTES.some(
                        (r) =>
                          paymentOptions(game as unknown as Game, me!, r)
                            .length,
                      ) && (
                        <button
                          className="secondary full"
                          onClick={() => action({ type: "pass" })}
                        >
                          Pass · no legal moves
                        </button>
                      )}
                  </>
                )}
                <div className="sidebar-tabs" role="tablist">
                  {game.phase === "finished" && (
                    <button
                      role="tab"
                      aria-selected={activeTab === "scoreboard"}
                      onClick={() => setTab("scoreboard")}
                    >
                      Scoreboard
                    </button>
                  )}
                  {game.phase !== "lobby" && me && (
                    <button
                      role="tab"
                      aria-selected={activeTab === "tickets"}
                      onClick={() => setTab("tickets")}
                    >
                      Tickets <span>{me?.tickets.length || 0}</span>
                    </button>
                  )}
                  <button
                    role="tab"
                    aria-selected={activeTab === "chat"}
                    onClick={() => setTab("chat")}
                  >
                    Chat <span>{messages.length}</span>
                  </button>
                  {game.phase !== "lobby" && (
                    <button
                      role="tab"
                      aria-selected={activeTab === "log"}
                      onClick={() => setTab("log")}
                    >
                      Activity
                    </button>
                  )}
                </div>
                <div
                  className={`sidebar-content ${activeTab === "chat" ? "chat-content" : ""}`}
                >
                  {activeTab === "scoreboard" && game.phase === "finished" ? (
                    <Scoreboard
                      game={game}
                      reveal={scoreReveal}
                      colors={playerColors}
                    />
                  ) : activeTab === "tickets" ? (
                    <>
                      {me?.tickets.length ? (
                        me.tickets.map((id) => (
                          <TicketTile
                            key={id}
                            ticket={TICKET_BY_ID[id]}
                            complete={connected(
                              game,
                              me.id,
                              TICKET_BY_ID[id].a,
                              TICKET_BY_ID[id].b,
                            )}
                            selected={pinnedTickets.includes(id)}
                            ink={
                              TICKET_INKS[
                                Math.max(0, pinnedTickets.indexOf(id)) %
                                  TICKET_INKS.length
                              ]
                            }
                            onHover={(cities) =>
                              setHoveredTicket(cities.length ? id : undefined)
                            }
                            onClick={() =>
                              setPinnedTickets((ids) =>
                                ids.includes(id)
                                  ? ids.filter((t) => t !== id)
                                  : [...ids, id],
                              )
                            }
                          />
                        ))
                      ) : (
                        <div className="empty-note">
                          <TicketIcon size={27} />
                          <p>Your destination tickets appear here.</p>
                        </div>
                      )}
                    </>
                  ) : activeTab === "chat" ? (
                    <div className="chat-box">
                      <div
                        className="messages"
                        ref={messagesBox}
                        role="log"
                        aria-label="Conversation"
                        aria-live="polite"
                      >
                        {chatStatus === "CanLoadMore" && (
                          <button
                            className="text-button"
                            onClick={() => {
                              const box = messagesBox.current;
                              if (box)
                                olderChatScroll.current = {
                                  height: box.scrollHeight,
                                  top: box.scrollTop,
                                };
                              loadMoreChat(50);
                            }}
                          >
                            Load older messages
                          </button>
                        )}
                        {chatMessages.length ? (
                          chatMessages.map((m) => (
                            <div
                              className={`message ${m.sender === "local-server" ? "server-message" : m.sender === me?.id ? "own" : ""}`}
                              key={m._id}
                            >
                              <div>
                                <strong>{m.name}</strong>
                                <time>
                                  {new Date(m.time).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </time>
                              </div>
                              <p>{m.text}</p>
                            </div>
                          ))
                        ) : (
                          <div className="empty-note">
                            <Send size={25} />
                            <p>No messages yet.</p>
                          </div>
                        )}
                        <div ref={chatEnd} />
                      </div>
                      <form onSubmit={chatSubmit}>
                        <input
                          aria-label="Chat message"
                          maxLength={500}
                          placeholder="Message the table…"
                          value={chatText}
                          onChange={(e) => setChatText(e.target.value)}
                        />
                        <button
                          className="icon"
                          aria-label="Send message"
                          aria-busy={sendingChat}
                          disabled={sendingChat || !chatText.trim()}
                        >
                          <Send size={18} />
                        </button>
                      </form>
                    </div>
                  ) : (
                    <ol className="activity">
                      {game.log.length ? (
                        [...game.log]
                          .reverse()
                          .map((l, i) => (
                            <li key={i}>{l.replace(/^All aboard! /, "")}</li>
                          ))
                      ) : (
                        <li>
                          The table is open. Invite your friends to begin.
                        </li>
                      )}
                    </ol>
                  )}
                </div>
              </>
            )}
          </aside>
        </main>
      )}
      {drawFlights.map((flight) => (
        <CardDrawFlight
          key={flight.id}
          flight={flight}
          onFinish={finishFlight}
        />
      ))}
      {dragPoint && cardColor && (
        <div
          className="card-drag-ghost"
          ref={dragGhost}
          style={
            {
              left: 0,
              top: 0,
              translate: `${dragPoint.x}px ${dragPoint.y}px`,
              "--card": PALETTE[cardColor],
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          <TrainArtwork color={cardColor} />
          <b>
            {dragPayment && dragRoute
              ? `${dragRoute.length - dragPayment.wilds} ${dragPayment.color}${dragPayment.wilds ? ` + ${dragPayment.wilds} ★` : ""}`
              : cardColor}
          </b>
        </div>
      )}
      {cardColor && !dragPoint && (
        <div className="card-held-note">
          Choose a highlighted route{" "}
          <button onClick={cancelCard} aria-label="Put cards back">
            <X size={14} />
          </button>
        </div>
      )}
      {rules && <Rules onClose={() => setRules(false)} />}
      {resign && (
        <Modal label="Hand over your seat" onClose={() => setResign(false)}>
          <Bot size={34} />
          <h2>Hand over to a computer?</h2>
          <p>
            A computer will play the rest of this game with your cards and
            tickets. This cannot be reversed during this game.
          </p>
          <button
            className="primary full"
            disabled={pendingTable.includes("resign")}
            onClick={() => setTable("resign")}
          >
            Hand over my seat
          </button>
          <button className="secondary full" onClick={() => setResign(false)}>
            Keep playing
          </button>
        </Modal>
      )}
      {routesOpen && game && me && (
        <Modal label="Route list" wide onClose={() => setRoutesOpen(false)}>
          <div className="eyebrow">ROUTES</div>
          <h2>Routes</h2>
          <input
            className="route-search"
            aria-label="Search routes"
            placeholder="Search a city or color…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="route-list">
            {ROUTES.filter((r) =>
              `${r.a} ${r.b} ${r.color}`
                .toLowerCase()
                .includes(filter.toLowerCase()),
            ).map((r) => {
              const opts = paymentOptions(game as unknown as Game, me, r);
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    select(r);
                    setRoutesOpen(false);
                  }}
                >
                  <span
                    className="route-swatch"
                    style={{ background: PALETTE[r.color] }}
                  />
                  <span>
                    <strong>
                      {r.a} → {r.b}
                    </strong>
                    <small>
                      {r.length}{" "}
                      {r.color === "gray" ? "any one color" : r.color} cards ·{" "}
                      {POINTS[r.length]} points
                    </small>
                  </span>
                  <span
                    className={`route-status ${opts.length ? "affordable" : ""}`}
                  >
                    {game.claimed[r.id]
                      ? "Claimed"
                      : opts.length
                        ? "Can claim"
                        : "View"}
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {catalog && (
        <Modal
          label="Destination ticket catalog"
          wide
          onClose={() => setCatalog(false)}
        >
          <div className="eyebrow">USA 1910</div>
          <h2>Destination tickets</h2>
          <p>
            30 Classic · 35 USA 1910 · 4 Mystery Train. Big Cities draws from 35
            of these tickets.
          </p>
          <div className="catalog-grid">
            {TICKETS.map((t) => (
              <TicketTile key={t.id} ticket={t} />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
function TicketChoice({
  game,
  busy,
  selected,
  onSelection,
  onHover,
  onKeep,
}: {
  game: View;
  busy: boolean;
  selected: string[];
  onSelection: (ids: string[]) => void;
  onHover: (id?: string) => void;
  onKeep: (ids: string[]) => void;
}) {
  const me = game.me!;
  const min = Math.min(
    game.phase === "setup" ? MODES[game.mode].keep : 1,
    me.pending.length,
  );
  return (
    <section
      role="dialog"
      aria-label="Choose destination tickets"
      aria-modal="false"
      className="ticket-picker"
    >
      <div className="picker-heading">
        <TicketIcon size={23} />
        <h2>Choose your tickets</h2>
      </div>
      <p>Keep at least {min}. Hover to preview; select to compare.</p>
      <div className="ticket-choices">
        {me.pending.map((id) => (
          <TicketTile
            key={id}
            ticket={TICKET_BY_ID[id]}
            selected={selected.includes(id)}
            number={
              selected.includes(id) ? selected.indexOf(id) + 1 : undefined
            }
            ink={
              TICKET_INKS[
                Math.max(0, selected.indexOf(id)) % TICKET_INKS.length
              ]
            }
            onHover={(cities) => onHover(cities.length ? id : undefined)}
            onClick={() =>
              onSelection(
                selected.includes(id)
                  ? selected.filter((t) => t !== id)
                  : [...selected, id],
              )
            }
          />
        ))}
      </div>
      <div className="choice-footer">
        <span>{selected.length} selected · paths are suggestions</span>
        <button
          className="primary"
          disabled={busy || selected.length < min}
          onClick={() => onKeep(selected)}
        >
          Keep {selected.length} tickets <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}
