import { localConfig, foreground, envPath } from "./dev-config.mjs";
try {
  localConfig();
  foreground("convex", ["dev", "--env-file", envPath]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
