import { defineConfig } from "vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
export default defineConfig({
  optimizeDeps: { entries: ["index.html"] },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: { host: "0.0.0.0", allowedHosts: ["games.bentsignal.local"] },
});
