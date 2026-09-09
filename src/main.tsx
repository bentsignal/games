import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import "@fontsource/rye/400.css";
import "@fontsource/bree-serif/400.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import Games from "./Games";
import AccountGate from "./components/AccountGate";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import "./styles.css";
import "./classic.css";
const url = import.meta.env.VITE_CONVEX_URL;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {url ? (
      <ConvexAuthProvider client={new ConvexReactClient(url)} api={api.auth}>
        <AccountGate>
          {(username) => <Games key={username} username={username} />}
        </AccountGate>
      </ConvexAuthProvider>
    ) : (
      <main className="config-error">
        <h1>Connect the railway</h1>
        <p>
          Set VITE_CONVEX_URL in .env.local, then restart the development
          server.
        </p>
      </main>
    )}
  </React.StrictMode>,
);
