import { localConfig, foreground, webName } from "./dev-config.mjs";
try {
  localConfig();
  foreground("portless", [webName, "vite"], {
    env: {
      ...process.env,
      PORTLESS_LAN: "0",
      PORTLESS_PORT: "1355",
      PORTLESS_TLD: "localhost",
    },
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
