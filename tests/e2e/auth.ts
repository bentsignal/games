import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
// Uses CLI admin authorization and real Auth v2 sessions on development only.
export async function signIn(page: Page, username: string) {
  const env = parseEnv(readFileSync(".env.local", "utf8"));
  const deployment = env.CONVEX_DEPLOYMENT?.match(/^dev:([a-z0-9-]+)$/)?.[1];
  const base = process.env.PLAYWRIGHT_BASE_URL || env.GAMES_WEB_ORIGIN;
  if (
    !deployment ||
    !base ||
    new URL(base).origin !== env.GAMES_WEB_ORIGIN ||
    env.VITE_CONVEX_URL !== `https://${deployment}.convex.cloud` ||
    process.env.CONVEX_DEPLOY_KEY ||
    env.CONVEX_DEPLOY_KEY
  ) {
    throw new Error(
      "Browser fixtures require the configured local development app.",
    );
  }
  const bundle = JSON.parse(
    execFileSync(
      "pnpm",
      [
        "exec",
        "convex",
        "run",
        "testing:signIn",
        JSON.stringify({ username }),
        "--deployment",
        deployment,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  await page.evaluate(
    ({ accessToken, refreshToken, url }) => {
      const suffix = url.replace(/[^a-zA-Z0-9]/g, "");
      localStorage.setItem("__convexAuthJWT_" + suffix, accessToken);
      localStorage.setItem("__convexAuthRefreshToken_" + suffix, refreshToken);
    },
    { ...bundle, url: env.VITE_CONVEX_URL },
  );
  await page.reload();
}
