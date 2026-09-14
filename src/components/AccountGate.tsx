import { useState, type ReactNode } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  useOauth,
  useSignInWithGoogle,
} from "@convex-dev/auth/providers/oauth/react";
import { api } from "../../services/convex/convex/_generated/api";
import { ConvexError } from "convex/values";
import DevelopmentSignIn from "./DevelopmentSignIn";

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
  if (isAuthenticated && user?.username && !user.previewAccessDenied)
    return <div className="auth-reveal">{children(user.username)}</div>;
  const loading = isLoading || (isAuthenticated && user === undefined);
  if (loading) return null;
  if (isAuthenticated && user?.previewAccessDenied)
    return (
      <main className="auth-screen auth-reveal">
        <section
          className="account-page preview-access"
          aria-labelledby="preview-access-title"
        >
          <h1 id="preview-access-title">Preview access is limited</h1>
          <p>This account isn’t on the preview list.</p>
          <p className="muted">
            Your account is ready. Access will open here once it is approved.
          </p>
          <button className="primary full" onClick={() => void signOut()}>
            Sign out
          </button>
        </section>
      </main>
    );
  return (
    <main className="auth-screen auth-reveal">
      <div className={isAuthenticated ? "account-page" : "sign-in-page"}>
        {isAuthenticated ? (
          <>
            <h1>Choose a username</h1>
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
                className="account-secondary"
                type="button"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </form>
          </>
        ) : import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === "1" ? (
          <DevelopmentSignIn />
        ) : (
          <button
            className="primary google-sign-in"
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
        )}
        {(error || flowError) && (
          <p role="alert">
            {error ||
              flowError?.message ||
              "Sign-in didn’t finish. Please try again."}
          </p>
        )}
      </div>
    </main>
  );
}
