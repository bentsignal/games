import { doctor } from "./doctor.mjs";
import {
  run,
  foreground,
  envPath,
  webOrigin,
  workerOrigin,
} from "./dev-config.mjs";

try {
  doctor();
  // Complete the first backend push before the browser or Worker can use it.
  run("convex", ["dev", "--once", "--env-file", envPath]);
  run(
    "portless",
    ["proxy", "start", "--port", "1355", "--https", "--tld", "localhost"],
    { env: { ...process.env, PORTLESS_LAN: "0" } },
  );
  console.log(
    `Frontend: ${webOrigin}\nGrams: ${workerOrigin}\nCtrl-C stops all three development processes.`,
  );
  foreground("turbo", ["run", "dev", "dev:web"], {
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
