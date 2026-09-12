import { defineConfig, loadEnv } from "vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { developmentAuth } from "./scripts/dev-auth.ts";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host = env.GAMES_WEB_ORIGIN
    ? new URL(env.GAMES_WEB_ORIGIN).hostname
    : "games.bentsignal.local";
  return {
    optimizeDeps: { entries: ["index.html"] },
    plugins: [
      developmentAuth(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
    server: { host: "127.0.0.1", allowedHosts: [host] },
  };
});
