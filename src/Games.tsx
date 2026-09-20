import { lazy, Suspense, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
const Ticket = lazy(() => import("./App"));
const Grams = lazy(() => import("./components/Grams"));
export default function Games({ username }: { username: string }) {
  const { signOut } = useAuthActions();
  const path = location.pathname;
  const ticket =
    path.startsWith("/ticket") ||
    path.startsWith("/room/") ||
    path === "/ending-preview";
  const grams = path === "/grams" || path.startsWith("/grams/");
  useEffect(() => {
    document.title = ticket ? "Ticket to Ride" : grams ? "Grams" : "Games";
  }, [ticket, grams]);
  if (ticket)
    return (
      <Suspense fallback={null}>
        <Ticket username={username} />
      </Suspense>
    );
  if (grams)
    return (
      <Suspense fallback={null}>
        <Grams username={username} />
      </Suspense>
    );
  return (
    <main className="games-hub">
      <header>
        <h1>Games</h1>
        <div>
          <span>{username}</span>
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <nav aria-label="Games">
        <a className="game-paper ticket-paper" href="/ticket">
          <span className="paper-art ticket-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <h2>Ticket to Ride</h2>
          <span className="paper-arrow">↗</span>
        </a>
        <a className="game-paper grams-paper" href="/grams">
          <span className="paper-art grams-art">
            <img src="/grams-assets/v1/images/logo_600.png" alt="" />
          </span>
          <h2>Grams</h2>
          <span className="paper-arrow">↗</span>
        </a>
      </nav>
    </main>
  );
}
