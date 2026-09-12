import { localConfig, foreground, workerName, root } from "./dev-config.mjs";
import { join } from "node:path";
import { existsSync } from "node:fs";
try {
  const { deployment } = localConfig();
  // Set this before Portless adds its own CA. Miniflare needs the system roots
  // for outbound HTTPS, and workerd's default CA path is absent on NixOS.
  const env = { ...process.env };
  if (!env.NODE_EXTRA_CA_CERTS && existsSync("/etc/NIXOS"))
    env.NODE_EXTRA_CA_CERTS = "/etc/ssl/certs/ca-certificates.crt";
  foreground("portless", [workerName, "node", "scripts/grams-runtime.mjs"], {
    env: {
      ...env,
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
