import { localConfig, foreground } from "./dev-config.mjs";
try {
  localConfig();
  if (!process.env.PORT || !process.env.GAMES_WORKER_STORAGE)
    throw new Error("Start the Worker using pnpm run grams:dev.");
  foreground("wrangler", [
    "dev",
    "--config",
    "services/grams/wrangler.jsonc",
    "--env",
    "development",
    "--local",
    "--port",
    process.env.PORT,
    "--ip",
    "127.0.0.1",
    "--persist-to",
    process.env.GAMES_WORKER_STORAGE,
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
