import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
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
  Trophy,
  MapPin,
  LogOut,
  List,
  Compass,
  LoaderCircle,
  Home,
  WifiOff,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { ConvexError } from "convex/values";
import {
  COLORS,
  MODES,
  PALETTE,
  PLAYER_COLORS,
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
  paymentOptions,
  type Action,
  type Game,
  type View,
} from "./game/engine";
import Music from "./components/Music";
import { TrainArtwork, ConductorPortrait } from "./components/TrainArtwork";
import { cue } from "./audio";
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
  location.pathname.match(/^\/room\/([a-z0-9]+)\/?$/i)?.[1].toUpperCase() || "";
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
            <span>Setting the table…</span>
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
function TrainCard({
  color,
  count,
  onClick,
  disabled,
  label,
}: {
  color: Color | "back";
  count?: number;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      className={`train-card ${color === "wild" ? "wild" : ""} ${color === "back" ? "back" : ""}`}
      style={
        {
          "--card": color === "back" ? "#2b5148" : PALETTE[color],
        } as React.CSSProperties
      }
      onClick={onClick}
      disabled={disabled}
      aria-label={label || `${color} ${count ?? ""}`}
      title={
        color === "wild"
          ? "Locomotive · wild"
          : color === "back"
            ? "Draw a hidden train card"
            : color
      }
    >
      <span className="card-corner">
        {color === "wild"
          ? "★"
          : color === "back"
            ? "?"
            : color[0].toUpperCase()}
      </span>
      <TrainArtwork color={color} />
      <span className="card-name">
        {color === "back" ? "DECK" : color === "wild" ? "LOCO" : color}
      </span>
      {count !== undefined && <b className="card-count">{count}</b>}
    </button>
  );
}
function TicketTile({
  ticket,
  complete,
  selected,
  onClick,
  onHover,
}: {
  ticket: Ticket;
  complete?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onHover?: (cities: string[]) => void;
}) {
  return (
    <button
      className={`ticket-tile ${selected ? "selected" : ""} ${complete ? "complete" : ""}`}
      onClick={onClick}
      onMouseEnter={() => onHover?.([ticket.a, ticket.b])}
      onMouseLeave={() => onHover?.([])}
      aria-pressed={selected}
    >
      <div className="ticket-stamp">
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
      <div className="eyebrow">THE CONDUCTOR’S HANDBOOK</div>
      <h2>A continent of possibilities.</h2>
      <p>
        Build railways between cities to complete your secret destination
        tickets. The highest final score wins.
      </p>
      <div className="rules-grid">
        <article>
          <b>01 · Collect train cards</b>
          <p>
            Take two cards from the market or hidden deck. A face-up locomotive
            is wild and uses your entire turn; you cannot take it as your second
            card. A hidden locomotive counts as one draw.
          </p>
        </article>
        <article>
          <b>02 · Claim a route</b>
          <p>
            Click a track or open the route list. Pay one matching card for each
            space. Gray routes use any one color; locomotives can replace any
            cards. You choose exactly how many locomotives to spend.
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
          <b>04 · Reach the final whistle</b>
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
          halves can be claimed by different players. Three face-up locomotives
          clear the market. Empty train decks refill from discards.
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

export default function App() {
  const [code, setCode] = useState(roomFromUrl),
    [name, setName] = useState(localStorage.getItem("railbound-name") || ""),
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
    [tab, setTab] = useState<"tickets" | "chat" | "log">("tickets"),
    [routesOpen, setRoutesOpen] = useState(false),
    [filter, setFilter] = useState(""),
    [catalog, setCatalog] = useState(false),
    [resign, setResign] = useState(false),
    [payment, setPayment] = useState("");
  const create = useMutation(api.rooms.create),
    join = useMutation(api.rooms.join),
    play = useMutation(api.rooms.play),
    manage = useMutation(api.rooms.manage),
    send = useMutation(api.rooms.send);
  const room = useQuery(api.rooms.get, code ? { code, token } : "skip");
  const game = room?.game as View | null | undefined;
  const me = game?.me;
  const connection = useConvexConnectionState();
  const connectedServer = connection.isWebSocketConnected;
  const messages =
    useQuery(api.rooms.chat, code && game ? { code, token } : "skip") || [];
  const [chatText, setChatText] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, tab]);
  useEffect(() => {
    const pop = () => setCode(roomFromUrl());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (code) localStorage.setItem("railbound-last-room", code);
  }, [code]);
  useEffect(() => {
    setPayment("");
  }, [selected?.id, room?.revision]);
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
  const host = !!me && game?.players[0]?.id === me.id;
  const canAct = mine && !busy && connectedServer && !me?.pending.length;
  const options =
    selected && game && me
      ? paymentOptions(game as unknown as Game, me, selected)
      : [];
  const chosen =
    options.find((o) => `${o.color}:${o.wilds}` === payment) || options[0];
  const visit = (roomCode: string) => {
    history.pushState({}, "", roomCode ? "/room/" + roomCode : "/");
    setCode(roomCode);
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
      await play({ code, token, revision: room.revision, action: a });
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
      await navigator.clipboard.writeText(location.origin + "/room/" + code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy this room link from your browser address bar.");
    }
  };
  const select = (r: Route | null) => {
    setSelected(r);
    if (r) setFocus([r.a, r.b]);
    else setFocus([]);
  };
  const chatSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (chatText.trim())
      void run(async () => {
        await send({ code, token, text: chatText });
        setChatText("");
      });
  };
  const setTable = (
    operation: "bot" | "remove" | "mode" | "rematch" | "leave" | "resign",
    extra: { player?: string; mode?: Mode } = {},
  ) =>
    run(async () => {
      await manage({ code, token, operation, ...extra });
      if (operation === "leave") visit("");
      if (operation === "resign") setResign(false);
    });
  return (
    <div className={`app ${code ? "at-table" : ""}`}>
      <header className="masthead">
        <button
          className="brand"
          onClick={() => visit("")}
          aria-label="Railbound home"
        >
          <span className="brand-icon">
            <TrainFront size={23} />
          </span>
          <span>Railbound</span>
        </button>
        <div className="nav-center">
          THE GREAT AMERICAN RAILWAY GAME <span>EST. 1910</span>
        </div>
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
      {!code ? (
        <main className="home-page">
          <section className="hero-copy">
            <div className="eyebrow">
              <span className="little-line" /> THE GREAT AMERICAN RAILWAY GAME
            </div>
            <h1>
              Railbound
              <span className="title-ribbon">USA · 1910</span>
            </h1>
            <p className="hero-description">
              Claim the rails. Connect the continent.
            </p>
            <div className="hero-tags">
              <span>
                <Users size={15} />
                2–5 players
              </span>
              <span>
                <Compass size={15} />
                Play with friends
              </span>
              <span>
                <TicketIcon size={15} />
                USA + 1910
              </span>
            </div>
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
              <label htmlFor="name">YOUR CONDUCTOR NAME</label>
              <input
                id="name"
                required
                maxLength={24}
                placeholder="What should we call you?"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="mode-label">
                <label htmlFor="mode">CHOOSE YOUR ADVENTURE</label>
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
                Create a private table
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="join-divider">
              <span />
              OR JOIN YOUR FRIENDS
              <span />
            </div>
            <form
              className="join-form"
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
                void run(async () =>
                  visit(
                    await join({
                      code: joinCode.toUpperCase().trim(),
                      name,
                      token,
                    }),
                  ),
                );
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
                Join <ArrowRight size={16} />
              </button>
            </form>
            {localStorage.getItem("railbound-last-room") && (
              <button
                className="resume text-button"
                onClick={() =>
                  visit(localStorage.getItem("railbound-last-room")!)
                }
              >
                Return to your last table <ArrowRight size={14} />
              </button>
            )}
          </section>
          <section className="hero-world">
            <div className="edition-label">
              <span>THE RAILROAD ATLAS</span>
              <strong>
                USA <i>1910</i>
              </strong>
              <span>69 TICKETS · ONE GREAT ADVENTURE</span>
            </div>
            <div className="hero-board">
              <BoardView onSelect={() => {}} top={false} />
            </div>
            <div className="postmark">
              <Compass size={32} />
              <span>
                ALL ABOARD!
                <br />
                NEXT STOP: GAME NIGHT
              </span>
            </div>
            <div className="hero-caption">
              <span className="live-dot" /> A COAST-TO-COAST ADVENTURE{" "}
              <span>Map preview · USA 1910</span>
            </div>
          </section>
          <footer className="home-footer">
            <span>✦ ALL ABOARD THE EVENING EXPRESS ✦</span>
            <span>2–5 friends · Private tables · No account needed</span>
          </footer>
        </main>
      ) : room === undefined ? (
        <div className="page-loading">
          <LoaderCircle className="spin" />
          <h2>Finding your table…</h2>
        </div>
      ) : !room ? (
        <div className="page-loading">
          <TicketIcon size={40} />
          <h2>That table couldn’t be found.</h2>
          <p>Check the eight-character room code and try again.</p>
          <button className="primary" onClick={() => visit("")}>
            Back to the station
          </button>
        </div>
      ) : !game ? (
        <main className="join-page">
          <div className="join-illustration">
            <TrainFront size={70} strokeWidth={1} />
          </div>
          <div className="eyebrow">AN INVITATION TO ADVENTURE</div>
          <h1>A seat with your name on it.</h1>
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
              <label htmlFor="join-name">YOUR CONDUCTOR NAME</label>
              <input
                id="join-name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={24}
              />
              <button className="primary" disabled={busy || !name.trim()}>
                Take your seat <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <p>
              {room.phase === "lobby"
                ? "This table is full."
                : "The game has already started. Reopen this link in the browser where you joined to recover your seat."}
            </p>
          )}
          <button className="text-button" onClick={() => visit("")}>
            Back to the station
          </button>
        </main>
      ) : (
        <main className="table-layout">
          <section className="table-main">
            <div className="table-heading">
              <div>
                <div className="eyebrow">
                  NORTH AMERICA · {MODES[game.mode].name.toUpperCase()}
                </div>
                <h1>
                  {game.phase === "lobby"
                    ? "A new adventure awaits."
                    : game.phase === "finished"
                      ? "The final whistle."
                      : "Coast to coast."}
                </h1>
              </div>
              <div className="table-meta">
                <span className="live-dot" />
                {game.phase === "lobby"
                  ? "BOARDING"
                  : game.phase === "setup"
                    ? "CHOOSING TICKETS"
                    : game.phase === "finished"
                      ? "JOURNEY COMPLETE"
                      : `TURN ${game.turnNumber}`}
              </div>
            </div>
            <div className="player-strip">
              {game.players.map((p, i) => (
                <div
                  className={`player-pill ${game.phase === "playing" && game.turn === i ? "active" : ""}`}
                  key={p.id}
                  style={
                    {
                      "--player": PLAYER_COLORS[p.color],
                    } as React.CSSProperties
                  }
                >
                  <span
                    className="avatar"
                    style={{ background: PLAYER_COLORS[p.color] }}
                  >
                    <ConductorPortrait index={p.color} />
                    <b className="player-number">{p.color + 1}</b>
                  </span>
                  <div>
                    <strong>
                      {p.name}
                      {p.id === me?.id ? " (you)" : ""}
                    </strong>
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
                  {game.phase !== "lobby" && (
                    <b className="player-score">
                      {game.phase === "finished"
                        ? (game.results.find((r) => r.id === p.id)?.total ??
                          p.score)
                        : p.score}
                      <small>PTS</small>
                    </b>
                  )}
                </div>
              ))}
            </div>
            <div className="board-shell">
              <BoardView
                game={game}
                selected={selected?.id}
                onSelect={select}
                focus={focus}
                reset={reset}
                top={top}
              />
              <div className="board-tools">
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
              </div>
              <div className="map-instruction">
                Click a route · Drag to pan · Scroll or pinch to zoom
              </div>
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
                    <>
                      <label htmlFor="payment">PAY WITH</label>
                      <select
                        id="payment"
                        value={chosen ? `${chosen.color}:${chosen.wilds}` : ""}
                        onChange={(e) => setPayment(e.target.value)}
                      >
                        {options.map((o) => (
                          <option
                            key={`${o.color}:${o.wilds}`}
                            value={`${o.color}:${o.wilds}`}
                          >
                            {selected.length - o.wilds} {o.color}{" "}
                            {o.wilds
                              ? `+ ${o.wilds} locomotive${o.wilds > 1 ? "s" : ""}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="primary"
                        disabled={!canAct || game.drawn > 0}
                        onClick={() =>
                          chosen &&
                          action({
                            type: "claim",
                            route: selected.id,
                            ...chosen,
                          })
                        }
                      >
                        Claim route <ArrowRight size={16} />
                      </button>
                      {!mine && <small>Available on your turn.</small>}
                    </>
                  ) : (
                    <p>
                      {game.phase === "finished"
                        ? "Unclaimed at the final whistle."
                        : "Not enough matching cards, trains, or the parallel route is blocked."}
                    </p>
                  )}
                </div>
              )}
            </div>
            {game.phase !== "lobby" && me && (
              <section className="hand-panel">
                <div className="hand-title">
                  <div className="eyebrow">YOUR CARRIAGE</div>
                  <h3>
                    Train cards <span>{me.hand.length}</span>
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
                      onClick={() => {
                        setFilter(c);
                        setRoutesOpen(true);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </section>
          <aside className="table-sidebar">
            {game.phase === "lobby" ? (
              <>
                <div className="sidebar-title">
                  <div className="eyebrow">THE DEPARTURE LOUNGE</div>
                  <h2>All aboard.</h2>
                  <p>
                    Invite your friends. Choose an adventure. The continent is
                    yours.
                  </p>
                </div>
                <button className="invite-box" onClick={copy}>
                  <div>
                    <small>YOUR PRIVATE ROOM</small>
                    <strong>{code}</strong>
                  </div>
                  {copied ? <Check size={21} /> : <Copy size={21} />}
                </button>
                <p className="small muted">
                  Click to copy the invitation link. Your friends can join
                  without an account.
                </p>
                <label htmlFor="table-mode">YOUR ADVENTURE</label>
                <select
                  id="table-mode"
                  value={game.mode}
                  disabled={!host || busy}
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
                <p className="mode-description">
                  {MODES[game.mode].description}
                </p>
                <div className="seat-list">
                  {game.players.map((p) => (
                    <div key={p.id}>
                      <span style={{ color: PLAYER_COLORS[p.color] }}>
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
                          aria-label={`Remove ${p.name}`}
                          onClick={() => setTable("remove", { player: p.id })}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  {game.players.length < 5 && host && (
                    <button
                      className="add-bot"
                      onClick={() => setTable("bot")}
                      disabled={busy}
                    >
                      <Plus size={16} />
                      Add computer opponent
                    </button>
                  )}
                </div>
                {host ? (
                  <button
                    className="primary full"
                    disabled={
                      busy || game.players.length < 2 || !connectedServer
                    }
                    onClick={() => action({ type: "start" })}
                  >
                    Start the journey <ArrowRight size={18} />
                  </button>
                ) : (
                  <div className="waiting-note">
                    Waiting for the host to start…
                  </div>
                )}
                <button
                  className="text-button leave"
                  onClick={() => setTable("leave")}
                  disabled={busy}
                >
                  <LogOut size={14} />
                  Leave table
                </button>
              </>
            ) : game.phase === "finished" ? (
              <div className="results-side">
                <div className="eyebrow">JOURNEY COMPLETE</div>
                <Trophy size={38} className="trophy" />
                <h2>
                  {game.results
                    .filter((r) => r.winner)
                    .map((r) => game.players.find((p) => p.id === r.id)?.name)
                    .join(" & ")}{" "}
                  {game.results.filter((r) => r.winner).length === 1
                    ? "wins!"
                    : "win!"}
                </h2>
                <p>Every journey has a story. Here’s how this one ended.</p>
                {[...game.results]
                  .sort((a, b) => b.total - a.total)
                  .map((r) => (
                    <div
                      className={`result-row ${r.winner ? "winner" : ""}`}
                      key={r.id}
                    >
                      <strong>
                        {game.players.find((p) => p.id === r.id)?.name}
                        <b>{r.total}</b>
                      </strong>
                      <dl>
                        <div>
                          <dt>Routes</dt>
                          <dd>{r.routePoints}</dd>
                        </div>
                        <div>
                          <dt>Tickets ({r.completed} complete)</dt>
                          <dd>
                            {r.ticketPoints > 0 ? "+" : ""}
                            {r.ticketPoints}
                          </dd>
                        </div>
                        <div>
                          <dt>Longest trail ({r.longest})</dt>
                          <dd>+{r.longestBonus}</dd>
                        </div>
                        <div>
                          <dt>Globetrotter</dt>
                          <dd>+{r.globeBonus}</dd>
                        </div>
                      </dl>
                      <details>
                        <summary>Reveal destination tickets</summary>
                        {game.revealed[r.id]?.map((id) => (
                          <p key={id} className="revealed-ticket">
                            {connected(
                              game,
                              r.id,
                              TICKET_BY_ID[id].a,
                              TICKET_BY_ID[id].b,
                            )
                              ? "✓"
                              : "×"}{" "}
                            {TICKET_BY_ID[id].a} → {TICKET_BY_ID[id].b}{" "}
                            <b>{TICKET_BY_ID[id].points}</b>
                          </p>
                        ))}
                      </details>
                    </div>
                  ))}
                {host && (
                  <button
                    className="primary full"
                    disabled={busy}
                    onClick={() => setTable("rematch")}
                  >
                    <RotateCcw size={17} />
                    Play again
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className={`turn-banner ${mine ? "your-turn" : ""}`}>
                  <span className="turn-light" />
                  <div>
                    <strong>
                      {game.phase === "setup"
                        ? "Plan your journey"
                        : mine
                          ? "Your turn, conductor."
                          : `${game.players[game.turn]?.name}’s turn`}
                    </strong>
                    <small>
                      {game.phase === "setup"
                        ? "Everyone is choosing starting tickets."
                        : mine
                          ? game.drawn
                            ? "Choose one more train card."
                            : "Draw cards, claim a route, or take tickets."
                          : "Plan ahead while the railway grows."}
                    </small>
                  </div>
                </div>
                <div className="market-heading">
                  <h3>The rail yard</h3>
                  <span>{game.deckCount + game.discardCount} in deck</span>
                </div>
                <div className="market-cards">
                  {game.market.map((c, i) => (
                    <TrainCard
                      key={i}
                      color={c}
                      label={`Draw ${c} market card ${i + 1}`}
                      onClick={() =>
                        action({ type: "draw", source: i, expected: c })
                      }
                      disabled={!canAct || (!!game.drawn && c === "wild")}
                    />
                  ))}
                  <TrainCard
                    color="back"
                    onClick={() => action({ type: "draw", source: -1 })}
                    disabled={
                      !canAct || game.deckCount + game.discardCount === 0
                    }
                    label="Draw from hidden deck"
                  />
                </div>
                <p className="market-help">
                  A face-up locomotive uses both draws.
                </p>
                <button
                  className="destination-draw"
                  disabled={!canAct || game.drawn > 0 || !game.ticketCount}
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
                {canAct &&
                  game.deckCount +
                    game.discardCount +
                    game.market.length +
                    game.ticketCount ===
                    0 &&
                  !ROUTES.some(
                    (r) =>
                      paymentOptions(game as unknown as Game, me!, r).length,
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
              <button
                role="tab"
                aria-selected={tab === "tickets"}
                onClick={() => setTab("tickets")}
              >
                Tickets <span>{me?.tickets.length || 0}</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "chat"}
                onClick={() => setTab("chat")}
              >
                Chat <span>{messages.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "log"}
                onClick={() => setTab("log")}
              >
                Activity
              </button>
            </div>
            <div className="sidebar-content">
              {tab === "tickets" ? (
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
                        onHover={setFocus}
                        onClick={() =>
                          setFocus([TICKET_BY_ID[id].a, TICKET_BY_ID[id].b])
                        }
                      />
                    ))
                  ) : (
                    <div className="empty-note">
                      <TicketIcon size={27} />
                      <p>
                        Your secret destinations will appear here when the
                        journey begins.
                      </p>
                    </div>
                  )}
                </>
              ) : tab === "chat" ? (
                <div className="chat-box">
                  <div className="messages">
                    {messages.length ? (
                      messages.map((m) => (
                        <div
                          className={`message ${m.sender === me?.id ? "own" : ""}`}
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
                        <p>
                          A little conversation goes a long way.
                          <br />
                          Say hello to your fellow travelers.
                        </p>
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
                      disabled={busy || !chatText.trim()}
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </div>
              ) : (
                <ol className="activity">
                  {game.log.length ? (
                    [...game.log].reverse().map((l, i) => <li key={i}>{l}</li>)
                  ) : (
                    <li>The table is open. Invite your friends to begin.</li>
                  )}
                </ol>
              )}
            </div>
            {(game.phase === "playing" || game.phase === "setup") &&
              !me?.bot && (
                <button
                  className="text-button resign"
                  onClick={() => setResign(true)}
                >
                  <LogOut size={12} />
                  Let a computer finish my game
                </button>
              )}
          </aside>
        </main>
      )}
      {rules && <Rules onClose={() => setRules(false)} />}
      {game && me && me.pending.length > 0 && !me.bot && (
        <TicketChoice
          key={me.pending.join(",")}
          game={game}
          busy={busy}
          onKeep={(ids) => action({ type: "keep", tickets: ids })}
        />
      )}
      {resign && (
        <Modal label="Hand over your seat" onClose={() => setResign(false)}>
          <Bot size={34} />
          <h2>Hand over to a computer?</h2>
          <p>
            A computer will play the rest of this game with your cards and
            tickets. You can stay to watch and chat. This cannot be reversed
            during this game.
          </p>
          <button
            className="primary full"
            disabled={busy}
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
          <div className="eyebrow">THE RAILWAY DIRECTORY</div>
          <h2>Find your next connection.</h2>
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
          <div className="eyebrow">THE COMPLETE USA 1910 COLLECTION</div>
          <h2>69 ways to go somewhere.</h2>
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
  onKeep,
}: {
  game: View;
  busy: boolean;
  onKeep: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const me = game.me!;
  const min = game.phase === "setup" ? MODES[game.mode].keep : 1;
  return (
    <Modal label="Choose destination tickets" wide>
      <div className="eyebrow">YOUR SECRET ITINERARY</div>
      <h2>Where will the rails take you?</h2>
      <p>
        Keep at least <strong>{Math.min(min, me.pending.length)}</strong>{" "}
        destination tickets. Complete a journey to earn its points; leave it
        unfinished and lose those points.
      </p>
      <div className="ticket-choices">
        {me.pending.map((id) => (
          <TicketTile
            key={id}
            ticket={TICKET_BY_ID[id]}
            selected={selected.includes(id)}
            onClick={() =>
              setSelected((s) =>
                s.includes(id) ? s.filter((t) => t !== id) : [...s, id],
              )
            }
          />
        ))}
      </div>
      <div className="choice-footer">
        <span>
          {selected.length} selected · keep {Math.min(min, me.pending.length)}{" "}
          or more
        </span>
        <button
          className="primary"
          disabled={busy || selected.length < Math.min(min, me.pending.length)}
          onClick={() => onKeep(selected)}
        >
          Keep {selected.length} tickets <ArrowRight size={17} />
        </button>
      </div>
    </Modal>
  );
}
