import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { developmentEnvironment, signIn } from "./auth";
test("Grams preserves its interface and plays a complete round with two accounts", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(110000);
  const { deployment } = developmentEnvironment();
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.stack || e.message));
  b.on("pageerror", (e) => errors.push(e.stack || e.message));
  try {
    await a.goto(baseURL! + "/grams");
    await signIn(a, "Grams_A_QA");
    await a
      .frameLocator('iframe[title="Grams"]')
      .getByRole("button", { name: "Create a lobby", exact: true })
      .click();
    await expect(a).toHaveURL(/\/grams\/room\/[A-Z2-9]{8}$/);
    const invitation = a.url();
    const fa = a.frameLocator('iframe[title="Grams"]');
    await expect(fa.locator("#name-input")).toHaveCount(0);
    await a.screenshot({ path: "/tmp/grams-home.png" });
    await expect(fa.locator("#start")).toBeVisible();
    await b.goto(invitation);
    await signIn(b, "Grams_B_QA");
    const fb = b.frameLocator('iframe[title="Grams"]');
    await expect(fb.locator("#player-list-wrapper")).toContainText(
      "Grams_B_QA",
    );
    await expect(fa.locator("#player-list-wrapper")).toContainText(
      "Grams_B_QA",
    );
    await fa.locator("#chat-input").fill("Grams is back!");
    await fa.locator("#chat-input").press("Enter");
    await expect(fb.locator("#chat")).toContainText("Grams is back!");
    expect(errors).toEqual([]);
    await fa.locator("#emote-button").click();
    await fa.locator("#ben-emote-1").click();
    await expect(
      fb.locator('img.emote[src="images/ben-emote-1.jpg"]'),
    ).toHaveCount(1);
    const roundStartedAfter = Date.now();
    await fa.locator("#start").click();
    await expect(fa.locator(".letter-available.filled")).toHaveCount(6, {
      timeout: 10000,
    });
    const letters = await fa
      .locator(".letter-available.filled")
      .allTextContents();
    const dict = JSON.parse(
      readFileSync("services/convex/convex/gramsData/allow.json", "utf8"),
    ) as Record<string, Record<string, string[]>>;
    const words = Object.values(dict).flatMap((groups) =>
      Object.values(groups).flat(),
    );
    const word = words.find((w) => {
      const pool = [...letters];
      return (
        w.length >= 3 &&
        [...w].every((c) => {
          const i = pool.indexOf(c);
          if (i < 0) return false;
          pool.splice(i, 1);
          return true;
        })
      );
    })!;
    expect(word).toBeTruthy();
    await fa.locator("#timer").click();
    await a.keyboard.type(word);
    await a.keyboard.press("Enter");
    await expect(fa.locator("#wordCount")).toHaveText("Words: 1");
    await expect(fb.locator("#player-list-wrapper")).toContainText(
      /Score: [1-9]/,
    );
    await a.screenshot({ path: "/tmp/grams-playing.png" });
    await a.reload();
    await expect(fa.locator("#name-input")).toHaveCount(0);
    await expect(fa.locator("#wordCount")).toHaveText("Words: 1");
    await expect(fa.locator(".letter-available.filled")).toHaveCount(6);

    await expect(fa.locator("#results-wrapper")).toBeVisible({
      timeout: 70000,
    });
    await expect(fa.locator("#results-wrapper")).toContainText(word);
    await expect(fb.locator("#results-wrapper")).toContainText(word);
    await a.screenshot({ path: "/tmp/grams-results.png" });
    await expect
      .poll(
        () => {
          const output = execFileSync(
            "pnpm",
            [
              "exec",
              "convex",
              "data",
              "gramsRounds",
              "--deployment",
              deployment,
              "--format",
              "json",
              "--limit",
              "20",
            ],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
          );
          const rounds = JSON.parse(output.trim() || "[]") as Array<{
            startedAt: number;
            players: Array<{ name: string; words: string[] }>;
          }>;
          return rounds.some(
            (round) =>
              round.startedAt >= roundStartedAfter &&
              round.players.some(
                (player) =>
                  player.name === "Grams_A_QA" && player.words.includes(word),
              ) &&
              round.players.some((player) => player.name === "Grams_B_QA"),
          );
        },
        {
          timeout: 15000,
          message: "Completed round reaches the isolated Convex database",
        },
      )
      .toBe(true);
    expect(errors).toEqual([]);
    await fa.locator("#leave").click();
    await fb.locator("#leave").click();
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("Grams preserves the first lobby click while scripts load", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page, "Grams_Load_QA");
  let releaseScript!: () => void;
  const scriptReady = new Promise<void>((resolve) => {
    releaseScript = resolve;
  });
  await page.route("**/grams-assets/v1/index.js", async (route) => {
    await scriptReady;
    await route.continue();
  });
  try {
    await page.goto("/grams", { waitUntil: "commit" });
    const frame = page.frameLocator('iframe[title="Grams"]');
    const create = frame.getByRole("button", {
      name: "Create a lobby",
      exact: true,
    });
    await expect(create).toBeDisabled();
    await expect(
      frame.getByRole("button", { name: "Join", exact: true }),
    ).toBeDisabled();
    await expect(
      frame.getByRole("textbox", { name: "Lobby code" }),
    ).toBeDisabled();
    releaseScript();
    await create.click();
    await expect(page).toHaveURL(/\/grams\/room\/[A-Z2-9]{8}$/);
    await expect(frame.locator("#start")).toBeVisible();
    await frame.locator("#leave").click();
  } finally {
    releaseScript();
  }
});

test("hub links to both games with one account", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "Hub_QA");
  await expect(
    page.getByRole("heading", { name: "Games", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/games-hub.png" });
  await page.getByRole("link", { name: /Ticket to Ride/ }).click();
  await expect(page.locator(".platform-header")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a game", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Find games", { exact: true }).click();
  await page.getByRole("searchbox", { name: "Search games" }).fill("missing");
  await expect(page.getByRole("status")).toHaveText("No games found.");
  await page.getByRole("searchbox", { name: "Search games" }).fill("gRaM");
  await expect(
    page.getByRole("navigation", { name: "Choose a game" }).getByRole("link"),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "Grams", exact: true }).click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("button", { name: "Create a lobby", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".platform-header .brand")).toHaveText("Grams");
  const header = await page.locator(".platform-header").boundingBox();
  const frame = await page.locator("iframe").boundingBox();
  expect(frame!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await page.getByLabel("Find games", { exact: true }).click();
  await page.getByRole("searchbox").press("Escape");
  await expect(page.getByRole("searchbox")).toBeHidden();
  await page.getByLabel("Find games", { exact: true }).click();
  await page.getByRole("link", { name: "All games", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Games", exact: true }),
  ).toBeVisible();
  await page.locator(".platform-actions .account-menu summary").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  if (process.env.PLAYWRIGHT_PREVIEW === "1")
    await expect(
      page.getByRole("button", { name: "Sign in with Google" }),
    ).toBeVisible();
  else
    await expect(
      page.getByRole("heading", { name: "Sign in (dev)" }),
    ).toBeVisible();
});

test("Grams preserves its welcome screen, joins automatically, and keeps lobbies separate", async ({
  browser,
  baseURL,
}) => {
  const hostContext = await browser.newContext();
  const friendContext = await browser.newContext();
  const host = await hostContext.newPage();
  const friend = await friendContext.newPage();
  const frame = host.frameLocator('iframe[title="Grams"]');
  const friendFrame = friend.frameLocator('iframe[title="Grams"]');
  const errors: string[] = [];
  host.on("pageerror", (error) => errors.push(error.message));
  friend.on("pageerror", (error) => errors.push(error.message));
  try {
    await host.goto(baseURL! + "/grams");
    await signIn(host, "Grams_Lobbies_Host_QA");
    await expect(
      frame.getByRole("button", { name: "Create a lobby", exact: true }),
    ).toBeVisible();
    await expect(
      frame.locator(
        "#connection-wrapper h1, #lobby-account, #lobby-size, #lobby-status, #join-lobby label",
      ),
    ).toHaveCount(0);
    await expect(frame.locator("#name-input")).toHaveCount(0);
    await expect(frame.locator("#world")).toBeVisible();
    await expect(frame.locator("#sunset")).toHaveCSS(
      "animation-name",
      "sunset-sky",
    );
    await expect(frame.locator("#home-logo")).toBeVisible();
    await host.setViewportSize({ width: 390, height: 844 });
    await expect(
      frame.getByRole("button", { name: "Create a lobby", exact: true }),
    ).toBeInViewport();
    await expect(
      frame.getByRole("button", { name: "Join", exact: true }),
    ).toBeInViewport();
    await host.screenshot({ path: "/tmp/grams-lobbies-mobile.png" });
    await host.setViewportSize({ width: 1440, height: 1000 });
    const logo = await frame.locator("#home-logo").boundingBox();
    const form = await frame.locator("#connection-container").boundingBox();
    expect(logo!.x + logo!.width).toBeLessThan(form!.x);
    await host.screenshot({ path: "/tmp/grams-lobbies-desktop.png" });
    let navigations = 0;
    host.on("request", (request) => {
      if (request.isNavigationRequest()) navigations++;
    });
    await hostContext.setOffline(true);
    await frame
      .getByRole("button", { name: "Create a lobby", exact: true })
      .click();
    await expect(frame.locator("#create-lobby")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(frame.locator("#create-lobby .lobby-spinner")).toBeVisible();
    await expect(frame.locator("#join-lobby-button")).toBeDisabled();
    await host.screenshot({ path: "/tmp/grams-lobby-loading.png" });
    expect(navigations).toBe(0);
    await hostContext.setOffline(false);
    await expect(host).toHaveURL(/\/grams\/room\/[A-Z2-9]{8}$/);
    const firstCode = new URL(host.url()).pathname.split("/").at(-1)!;
    await expect(frame.locator("#player-list-wrapper")).toContainText(
      "Grams_Lobbies_Host_QA",
    );
    await expect(frame.locator("#home-container")).toBeHidden();
    const inviteBounds = await frame.locator("#invite-friends").boundingBox();
    const playersBounds = await frame
      .locator("#player-list-wrapper")
      .boundingBox();
    expect(inviteBounds!.x).toBeGreaterThan(
      playersBounds!.x + playersBounds!.width,
    );
    await host.screenshot({ path: "/tmp/grams-lobby-in-game.png" });
    await frame
      .getByRole("button", { name: `Invite friends · ${firstCode}` })
      .click();
    await expect(frame.locator("#invite-status")).toContainText(
      /Link copied|address bar/,
    );

    await friend.goto(baseURL! + "/grams");
    await signIn(friend, "Grams_Lobbies_Friend_QA");
    await expect(
      friendFrame.getByLabel("Lobby code", { exact: true }),
    ).toBeVisible();
    friend.on("request", (request) => {
      if (request.isNavigationRequest()) navigations++;
    });
    await friendFrame.getByLabel("Lobby code", { exact: true }).fill("bad");
    await friendFrame
      .getByRole("button", { name: "Join", exact: true })
      .click();
    await expect(friendFrame.getByRole("alert")).toContainText(
      "eight-character",
    );
    await friendFrame
      .getByLabel("Lobby code", { exact: true })
      .fill("ZZZZZZZZ");
    await friendFrame
      .getByRole("button", { name: "Join", exact: true })
      .click();
    await expect(friendFrame.getByRole("alert")).toContainText(
      "Lobby not found",
    );
    await friendFrame
      .getByLabel("Lobby code", { exact: true })
      .fill(firstCode.toLowerCase());
    await friendFrame
      .getByRole("button", { name: "Join", exact: true })
      .click();
    await expect(friendFrame.locator("#player-list-wrapper")).toContainText(
      "Grams_Lobbies_Friend_QA",
    );
    await expect(frame.locator("#player-list-wrapper")).toContainText(
      "Grams_Lobbies_Friend_QA",
    );
    await frame.locator("#chat-input").fill("First lobby conversation");
    await frame.locator("#chat-input").press("Enter");
    await expect(friendFrame.locator("#chat")).toContainText(
      "First lobby conversation",
    );
    await friendFrame.locator("#leave").click();
    await expect(friend).toHaveURL(/\/grams$/);
    await friendFrame
      .getByRole("button", { name: "Create a lobby", exact: true })
      .click();
    await expect(friend).toHaveURL(/\/grams\/room\/[A-Z2-9]{8}$/);
    expect(friend.url()).not.toEqual(host.url());
    await expect(friendFrame.locator("#start")).toBeVisible();
    await expect(friendFrame.locator("#chat")).not.toContainText(
      "First lobby conversation",
    );
    await expect(friendFrame.locator("#player-list-wrapper")).not.toContainText(
      "Grams_Lobbies_Host_QA",
    );
    await frame.locator("#chat-input").fill("Private to the first lobby");
    await frame.locator("#chat-input").press("Enter");
    await expect(frame.locator("#chat")).toContainText(
      "Private to the first lobby",
    );
    await expect(friendFrame.locator("#chat")).not.toContainText(
      "Private to the first lobby",
    );
    await frame.locator("#leave").click();
    await expect(host).toHaveURL(/\/grams$/);
    await expect(
      frame.getByRole("button", { name: "Create a lobby", exact: true }),
    ).toBeVisible();
    await friendFrame.locator("#leave").click();
    await expect(friend).toHaveURL(/\/grams$/);
    expect(navigations).toBe(0);
    await host.goBack();
    await expect(frame.locator("#start")).toBeVisible();
    await host.goForward();
    await expect(
      frame.getByRole("button", { name: "Create a lobby", exact: true }),
    ).toBeEnabled();
    await frame
      .getByRole("button", { name: "Create a lobby", exact: true })
      .click();
    await frame.locator("#start").click();
    await expect(frame.locator("#pre-game-countdown")).toBeVisible();
    await frame.locator("#leave").click();
    await frame
      .getByRole("button", { name: "Create a lobby", exact: true })
      .click();
    await expect(frame.locator("#pre-game-waiting")).toBeVisible();
    await expect(frame.locator("#pre-game-countdown")).toBeHidden();
    await frame.locator("#start").click();
    await expect(frame.locator(".letter-available.filled")).toHaveCount(6);
    await frame.locator("#leave").click();
    await expect(host).toHaveURL(/\/grams$/);
    expect(navigations).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await friendContext.close();
  }
});
