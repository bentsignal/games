import { defineConfig } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
const env = existsSync(".env.local")
  ? parseEnv(readFileSync(".env.local", "utf8"))
  : {};
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      env.GAMES_WEB_ORIGIN ||
      "https://games.bentsignal.local",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  reporter: "list",
});
