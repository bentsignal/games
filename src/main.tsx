import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import App from "./App";
import "./styles.css";
const url = import.meta.env.VITE_CONVEX_URL;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {url ? (
      <ConvexProvider client={new ConvexReactClient(url)}>
        <App />
      </ConvexProvider>
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
