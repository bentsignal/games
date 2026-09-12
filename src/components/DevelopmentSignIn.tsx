import { useState } from "react";

export default function DevelopmentSignIn() {
  const [username, setUsername] = useState("Developer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/__games/dev-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          });
          const session = await response.json();
          if (!response.ok) throw new Error(session.error);
          const suffix = import.meta.env.VITE_CONVEX_URL.replace(
            /[^a-zA-Z0-9]/g,
            "",
          );
          localStorage.setItem(
            `__convexAuthJWT_${suffix}`,
            session.accessToken,
          );
          localStorage.setItem(
            `__convexAuthRefreshToken_${suffix}`,
            session.refreshToken,
          );
          location.reload();
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "Could not sign in.",
          );
          setBusy(false);
        }
      }}
    >
      <h1>Development sign-in</h1>
      <label htmlFor="dev-username">Test username</label>
      <input
        id="dev-username"
        required
        autoComplete="username"
        value={username}
        minLength={3}
        maxLength={24}
        pattern="[a-zA-Z0-9_]{3,24}"
        onChange={(event) => setUsername(event.target.value)}
      />
      <p className="muted">
        Use any test username in this checkout’s temporary database.
      </p>
      <button className="primary full" disabled={busy}>
        Sign in
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
