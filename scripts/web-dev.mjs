import {
  proxyEnvironment,
  localConfig,
  foreground,
  webName,
} from "./dev-config.mjs";
try {
  localConfig();
  foreground("portless", [webName, "vite"], {
    env: {
      ...process.env,
      ...proxyEnvironment,
    },
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
