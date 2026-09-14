import { useRef, useState, type ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ChevronDown, LayoutGrid, LogOut } from "lucide-react";

const games = [
  { id: "ticket", name: "Ticket to Ride", href: "/ticket" },
  { id: "grams", name: "Grams", href: "/grams" },
];

export default function PlatformHeader({
  username,
  game,
  onGameHome,
  children,
}: {
  username: string;
  game?: "ticket" | "grams";
  onGameHome?: () => void;
  children?: ReactNode;
}) {
  const { signOut } = useAuthActions();
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const current = games.find((item) => item.id === game);
  const matching = games.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <header className="masthead platform-header">
      <div className="platform-brand">
        {current ? (
          onGameHome ? (
            <button
              className="brand"
              onClick={onGameHome}
              aria-label={`${current.name} home`}
            >
              {current.name}
            </button>
          ) : (
            <a className="brand" href={current.href}>
              {current.name}
            </a>
          )
        ) : (
          <h1 className="brand">
            <a href="/">Games</a>
          </h1>
        )}
        <details
          className="game-switcher"
          name="platform-menu"
          onToggle={(event) => {
            if (event.currentTarget.open) search.current?.focus();
            else setQuery("");
          }}
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
          <summary aria-label="Find games" title="Find games">
            <LayoutGrid size={18} />
            <ChevronDown size={12} />
          </summary>
          <div className="account-menu-panel game-switcher-panel">
            <a href="/">All games</a>
            <input
              ref={search}
              type="search"
              aria-label="Search games"
              placeholder="Search games"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <nav aria-label="Choose a game">
              {matching.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  aria-current={item.id === game ? "page" : undefined}
                >
                  {item.name}
                </a>
              ))}
            </nav>
            {!matching.length && <p role="status">No games found.</p>}
          </div>
        </details>
      </div>
      <nav className="platform-actions" aria-label="Account and game controls">
        {children}
        <details
          className="account-menu"
          name="platform-menu"
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
            <span className="account-name">{username}</span>
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
  );
}
