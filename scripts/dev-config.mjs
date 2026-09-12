import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, basename } from "node:path";
import { parseEnv } from "node:util";
import { spawnSync, spawn } from "node:child_process";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const envPath = join(root, ".env.local");
export const workerVarsPath = join(
  root,
  "services/grams/.dev.vars.development",
);
export const statePath = join(root, ".dev/setup.json");
export const checkoutId = createHash("sha256")
  .update(root)
  .digest("hex")
  .slice(0, 8);
export const webName = `${checkoutId}.games.bentsignal`;
export const workerName = `${checkoutId}.grams.bentsignal`;
export const webOrigin = `https://${webName}.localhost:1355`;
export const workerOrigin = `https://${workerName}.localhost:1355`;

export function readEnv(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

export function writeEnv(path, values) {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const keys = new Set(Object.keys(values));
  const lines = existing.split("\n").filter((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return !match || !keys.has(match[1]);
  });
  // Values written here are single-line URLs, base64 keys, and random tokens.
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n"\\]/.test(value))
      throw new Error(`Unsupported value for ${key}`);
    lines.push(`${key}="${value}"`);
  }
  writeFileSync(path, lines.filter(Boolean).join("\n") + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function assertNoDeploymentOverrides(env = process.env) {
  for (const key of [
    "CONVEX_DEPLOY_KEY",
    "CONVEX_DEPLOYMENT_TOKEN",
    "CONVEX_SELF_HOSTED_URL",
    "CONVEX_SELF_HOSTED_ADMIN_KEY",
  ]) {
    if (env[key])
      throw new Error(`Unset ${key} before local setup or development.`);
  }
  if (
    env.CONVEX_DEPLOYMENT &&
    env.CONVEX_DEPLOYMENT !== readEnv(envPath).CONVEX_DEPLOYMENT
  ) {
    throw new Error(
      "Unset the shell CONVEX_DEPLOYMENT override; local commands use .env.local.",
    );
  }
}

export function selectedDevelopment() {
  assertNoDeploymentOverrides();
  const env = readEnv(envPath);
  assertNoDeploymentOverrides(env);
  const match = env.CONVEX_DEPLOYMENT?.match(/^dev:([a-z0-9-]+)$/);
  if (!match)
    throw new Error(
      "No isolated cloud development deployment selected. Run pnpm run setup.",
    );
  const deployment = match[1];
  const url = `https://${deployment}.convex.cloud`;
  if (env.VITE_CONVEX_URL !== url)
    throw new Error(
      "VITE_CONVEX_URL does not match CONVEX_DEPLOYMENT. Run pnpm run setup.",
    );
  return { env, deployment, url, siteUrl: `https://${deployment}.convex.site` };
}

export function localConfig() {
  const config = selectedDevelopment();
  if (!existsSync(statePath))
    throw new Error("Local setup is incomplete. Run pnpm run setup.");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (
    state.checkoutId !== checkoutId ||
    state.deployment !== config.deployment
  ) {
    throw new Error(
      "This checkout's deployment changed. Run pnpm run setup --new for an isolated deployment.",
    );
  }
  const worker = readEnv(workerVarsPath);
  if (
    !worker.GRAMS_REALTIME_SECRET ||
    worker.CONVEX_URL !== config.url ||
    worker.ALLOWED_ORIGINS !== webOrigin ||
    config.env.VITE_GRAMS_URL !== workerOrigin ||
    config.env.GAMES_WEB_ORIGIN !== webOrigin
  ) {
    throw new Error(
      "Local frontend and Worker configuration is incomplete or mismatched. Run pnpm run setup.",
    );
  }
  return { ...config, worker, state };
}

export function bin(name) {
  return join(
    root,
    "node_modules/.bin",
    name + (process.platform === "win32" ? ".cmd" : ""),
  );
}

export function run(name, args, options = {}) {
  const result = spawnSync(bin(name), args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${name} ${args[0]} failed. See the output above.`);
  return result.stdout;
}

export function foreground(name, args, options = {}) {
  const child = spawn(bin(name), args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error(
      `Could not start ${name}. Run pnpm install --frozen-lockfile.`,
    );
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });
}

export function checkoutLabel() {
  const user = (process.env.USER || process.env.USERNAME || "developer")
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase();
  const directory = basename(root.replace(/\/$/, ""))
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase();
  return `dev/${user}/${directory}-${checkoutId}`;
}
