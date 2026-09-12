import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { Plugin } from "vite";

const exec = promisify(execFile);
export function developmentAuth(
  root = fileURLToPath(new URL("../", import.meta.url)),
): Plugin {
  return {
    name: "games-development-auth",
    apply: "serve",
    configureServer(server) {
      if (server.config.env.VITE_DEV_AUTH !== "1") return;
      const env = parseEnv(readFileSync(`${root}.env.local`, "utf8"));
      const state = JSON.parse(readFileSync(`${root}.dev/setup.json`, "utf8"));
      const deployment =
        env.CONVEX_DEPLOYMENT?.match(/^dev:([a-z0-9-]+)$/)?.[1];
      if (
        !deployment ||
        state.deployment !== deployment ||
        env.VITE_CONVEX_URL !== `https://${deployment}.convex.cloud` ||
        env.CONVEX_DEPLOY_KEY ||
        process.env.CONVEX_DEPLOY_KEY
      ) {
        throw new Error(
          "Development sign-in requires this checkout's isolated development deployment. Run pnpm run setup.",
        );
      }
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== "/__games/dev-login") return next();
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        const forwarded = String(req.headers["x-forwarded-for"] ?? "");
        const isLoopback = (ip: string) =>
          ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip.trim());
        if (
          req.method !== "POST" ||
          req.headers.origin !== env.GAMES_WEB_ORIGIN ||
          !req.headers["content-type"]?.startsWith("application/json") ||
          !isLoopback(req.socket.remoteAddress ?? "") ||
          (forwarded && !forwarded.split(",").every(isLoopback))
        ) {
          res.statusCode = 403;
          return res.end(
            JSON.stringify({
              error:
                "Development sign-in is available only from the local app.",
            }),
          );
        }
        try {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 256)
              throw new Error("Invalid username");
          }
          const { username } = JSON.parse(body);
          if (
            typeof username !== "string" ||
            !/^[a-zA-Z0-9_]{3,24}$/.test(username)
          )
            throw new Error("Invalid username");
          const { stdout } = await exec(
            `${root}node_modules/.bin/convex`,
            [
              "run",
              "testing:signIn",
              JSON.stringify({ username }),
              "--deployment",
              deployment,
            ],
            { cwd: root, timeout: 30000, maxBuffer: 64 * 1024 },
          );
          const session = JSON.parse(stdout);
          res.end(
            JSON.stringify({
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
            }),
          );
        } catch {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error:
                "Could not create a development session. Use a 3–24 character username and check the Convex dev server.",
            }),
          );
        }
      });
    },
  };
}
