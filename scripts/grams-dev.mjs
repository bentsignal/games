import { localConfig, foreground, workerName, root } from "./dev-config.mjs";
import { join } from "node:path";
try {
  const { deployment } = localConfig();
  foreground("portless", [workerName, "node", "scripts/grams-runtime.mjs"], {
    env: {
      ...process.env,
      PORTLESS_LAN: "0",
      PORTLESS_PORT: "1355",
      PORTLESS_TLD: "localhost",
      GAMES_WORKER_STORAGE: join(root, ".dev/worker", deployment),
    },
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
