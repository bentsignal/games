import { defineConfig, loadEnv } from "vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { developmentAuth } from "./scripts/dev-auth.ts";
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host = env.GAMES_WEB_ORIGIN
    ? new URL(env.GAMES_WEB_ORIGIN).hostname
    : "games.bentsignal.local";
  const proxyRealtime =
    command === "serve" && env.GAMES_WEB_ORIGIN && env.VITE_GRAMS_URL;
  return {
    // Browsers only need the worktree's Games hostname. The dev server resolves
    // the internal Worker hostname and forwards both HTTP and WebSocket traffic.
    define: proxyRealtime
      ? {
          "import.meta.env.VITE_GRAMS_URL": JSON.stringify(
            `${env.GAMES_WEB_ORIGIN}/_realtime`,
          ),
        }
      : {},
    optimizeDeps: { entries: ["index.html"] },
    plugins: [
      developmentAuth(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
    server: {
      host: "127.0.0.1",
      allowedHosts: [host],
      proxy: proxyRealtime
        ? {
            "/_realtime/": {
              target: env.VITE_GRAMS_URL,
              changeOrigin: true,
              ws: true,
              rewrite: (path) => path.replace(/^\/_realtime/, ""),
            },
          }
        : undefined,
    },
  };
});
