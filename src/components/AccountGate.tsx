import { useState, type ReactNode } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  useOauth,
  useSignInWithGoogle,
} from "@convex-dev/auth/providers/oauth/react";
import { api } from "../../convex/_generated/api";
import { ConvexError } from "convex/values";

export default function AccountGate({
  children,
}: {
  children: (username: string) => ReactNode;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const { signInGoogle } = useSignInWithGoogle(api.auth);
  const { flowError } = useOauth();
  const { signOut } = useAuthActions();
  const onboard = useMutation(api.users.onboard);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (isAuthenticated && user?.username) return children(user.username);
  const loading = isLoading || (isAuthenticated && user === undefined);
  return (
    <div className="app">
      <header className="masthead">
        <span className="brand">Ticket to Ride</span>
      </header>
      <main className="account-page">
        <h1>
          {loading
            ? "Signing you in…"
            : isAuthenticated
              ? "Choose a username"
              : "Sign in to play"}
        </h1>
        {!loading &&
          (isAuthenticated ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await onboard({
                    username,
                    legacyToken:
                      localStorage.getItem("railbound-session") ?? undefined,
                  });
                } catch (e) {
                  setError(
                    e instanceof ConvexError
                      ? String(e.data)
                      : "Couldn’t save your username. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="username">Username</label>
              <input
                id="username"
                autoComplete="username"
                autoFocus
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]{3,24}"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="muted">
                3–24 letters, numbers, or underscores. Other players will see
                this name.
              </p>
              <button className="primary full" disabled={busy}>
                Continue
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </form>
          ) : (
            <button
              className="primary full google-sign-in"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await signInGoogle();
                } catch {
                  setError("Couldn’t sign in. Please try again.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sign in with Google
            </button>
          ))}
        {(error || flowError) && (
          <p role="alert">
            {error ||
              flowError?.message ||
              "Sign-in didn’t finish. Please try again."}
          </p>
        )}
        <p className="account-privacy">
          <a href="/privacy.html">Privacy</a>
        </p>
      </main>
    </div>
  );
}
