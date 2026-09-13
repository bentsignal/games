import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  root,
  envPath,
  statePath,
  workerVarsPath,
  checkoutId,
  checkoutLabel,
  webOrigin,
  workerOrigin,
  assertNoDeploymentOverrides,
  selectedDevelopment,
  readEnv,
  writeEnv,
  run,
  bin,
} from "./dev-config.mjs";

function remoteEnv(args, input) {
  // Capture all output: a failed CLI command must never print a secret.
  const result = spawnSync(bin("convex"), ["env", ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Could not ${args[0]} development environment configuration. Check Convex login/access and whether the deployment expired. Use pnpm run setup --new to replace an expired deployment.`,
    );
  return result.stdout.trim();
}

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--new", "--help"].includes(arg)))
    throw new Error("Usage: pnpm run setup [--new]");
  if (args.includes("--help")) {
    console.log(
      "pnpm run setup: create/configure this checkout's isolated Convex development deployment.\npnpm run setup --new: select a fresh deployment (old deployments expire after seven days).\nDefaults to BSX:games. Set GAMES_CONVEX_PROJECT=team-slug:project-slug to use another project.",
    );
    process.exit(0);
  }
  assertNoDeploymentOverrides();
  assertNoDeploymentOverrides(readEnv(envPath));
  assertNoDeploymentOverrides(readEnv(join(root, ".env")));
  const existing = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : null;
  if (
    !existing ||
    existing.checkoutId !== checkoutId ||
    args.includes("--new")
  ) {
    const project = process.env.GAMES_CONVEX_PROJECT ?? "BSX:games";
    if (project && !/^[a-zA-Z0-9-]+:[a-zA-Z0-9-]+$/.test(project))
      throw new Error("GAMES_CONVEX_PROJECT must be team-slug:project-slug.");
    const reference = `${project ? project + ":" : ""}${checkoutLabel()}-${randomBytes(3).toString("hex")}`;
    console.log(`Creating an isolated development deployment in ${project}.`);
    run("convex", [
      "deployment",
      "create",
      reference,
      "--type",
      "dev",
      "--select",
      "--expiration",
      "in 7 days",
    ]);
    const { deployment } = selectedDevelopment();
    mkdirSync(join(root, ".dev"), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          checkoutId,
          deployment,
          reference,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  }
  const { deployment, url, siteUrl } = selectedDevelopment();
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.deployment !== deployment)
    throw new Error(
      "The selected deployment is not owned by this checkout. Run pnpm run setup --new.",
    );
  const target = ["--deployment", deployment];
  const names = new Set(
    remoteEnv(["list", "--names-only", ...target]).split(/\s+/),
  );
  const set = (name, value) => remoteEnv(["set", name, ...target], value);
  const get = (name) => remoteEnv(["get", name, ...target]);
  if (!names.has("AUTH_PRIVATE_KEY") || !names.has("AUTH_JWKS")) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    set(
      "AUTH_PRIVATE_KEY",
      Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString(
        "base64",
      ),
    );
    set(
      "AUTH_JWKS",
      JSON.stringify({
        keys: [
          {
            ...publicKey.export({ format: "jwk" }),
            kid: randomUUID(),
            alg: "RS256",
            use: "sig",
          },
        ],
      }),
    );
  }
  if (!names.has("GRAMS_REALTIME_SECRET"))
    set("GRAMS_REALTIME_SECRET", randomBytes(32).toString("hex"));
  // Temporary deployments use admin-created test sessions, not Google OAuth.
  // The OAuth component still requires values when Convex validates its config.
  if (!names.has("AUTH_GOOGLE_CLIENT_ID"))
    set("AUTH_GOOGLE_CLIENT_ID", "unused-local-development");
  if (!names.has("AUTH_GOOGLE_CLIENT_SECRET"))
    set("AUTH_GOOGLE_CLIENT_SECRET", "unused-local-development");
  set("GAMES_DEV_SITE_URL", siteUrl);
  set("GAMES_DEV_WEB_ORIGIN", webOrigin);
  writeEnv(envPath, {
    VITE_GRAMS_URL: workerOrigin,
    GAMES_WEB_ORIGIN: webOrigin,
    VITE_DEV_AUTH: "1",
    GAMES_DEV_LAN: "1",
  });
  writeEnv(workerVarsPath, {
    CONVEX_URL: url,
    ALLOWED_ORIGINS: webOrigin,
    GRAMS_REALTIME_SECRET: get("GRAMS_REALTIME_SECRET"),
  });
  console.log(
    `Configured ${deployment}. Secrets were stored without printing their values.`,
  );
  console.log(
    "Run pnpm run doctor, then pnpm run dev. See docs/development.md for authentication setup.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
