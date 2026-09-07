import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
// Uses CLI admin authorization and real Auth v2 sessions on development only.
export async function signIn(page: Page, username: string) {
  if (process.env.PLAYWRIGHT_BASE_URL?.startsWith("https:"))
    throw new Error(
      "Test fixtures run on development only. Verify production OAuth in Helium.",
    );
  const bundle = JSON.parse(
    execFileSync(
      "npx",
      ["convex", "run", "testing:signIn", JSON.stringify({ username })],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  await page.evaluate(({ accessToken, refreshToken }) => {
    const suffix = "httpssincerejellyfish682convexcloud";
    localStorage.setItem("__convexAuthJWT_" + suffix, accessToken);
    localStorage.setItem("__convexAuthRefreshToken_" + suffix, refreshToken);
  }, bundle);
  await page.reload();
}
