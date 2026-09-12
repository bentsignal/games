import { doctor } from "./doctor.mjs";
import {
  run,
  foreground,
  envPath,
  webOrigin,
  workerOrigin,
  proxyPort,
  proxyEnvironment,
} from "./dev-config.mjs";

try {
  doctor();
  // Complete the first backend push before the browser or Worker can use it.
  run("convex", ["dev", "--once", "--env-file", envPath]);
  run(
    "portless",
    ["proxy", "start", "--port", String(proxyPort), "--no-tls", "--lan"],
    { env: { ...process.env, ...proxyEnvironment } },
  );
  console.log(
    `Frontend: ${webOrigin}\nGrams: ${workerOrigin}\nCtrl-C stops all three development processes.`,
  );
  foreground("turbo", ["run", "dev", "dev:web"], {
    env: {
      ...process.env,
      ...proxyEnvironment,
    },
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
