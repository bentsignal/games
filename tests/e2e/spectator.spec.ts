import { test, expect } from "@playwright/test";
import { signIn } from "./auth";

test("late spectators watch live play and scoring, chat, refresh, and leave without taking a seat", async ({
  browser,
  baseURL,
}) => {
  const hostContext = await browser.newContext({ baseURL });
  const watchContext = await browser.newContext({ baseURL });
  const host = await hostContext.newPage();
  const watcher = await watchContext.newPage();
  const errors: string[] = [];
  watcher.on("pageerror", (error) => errors.push(error.message));
  try {
    await host.goto("/ticket/ending-preview");
    await signIn(host, "SpectatorHost_QA");
    await host.getByRole("button", { name: "Create ending preview" }).click();
    await expect(host).toHaveURL(/\/room\//);
    const roomCode = new URL(host.url()).pathname.split("/").pop()!;
    await watcher.goto("/ticket");
    await signIn(watcher, "Spectator_QA");
    await watcher.getByLabel("Room code").fill(roomCode);
    await watcher.getByRole("button", { name: "Open", exact: true }).click();
    await watcher.getByRole("button", { name: "Watch game" }).click();
    await expect(
      watcher.getByText("SPECTATING", { exact: true }),
    ).toBeVisible();
    await expect(watcher.locator(".player-pill")).toHaveCount(4);
    await expect(watcher.locator(".hand-panel")).toHaveCount(0);
    await expect(watcher.getByRole("tab", { name: /Tickets/ })).toHaveCount(0);
    await expect(
      watcher.getByRole("button", { name: "Draw from hidden deck" }),
    ).toBeHidden();
    await watcher.getByLabel("Chat message").fill("Watching the finish!");
    await watcher.getByRole("button", { name: "Send message" }).click();
    await expect(
      watcher.getByText("Watching the finish!", { exact: true }),
    ).toBeVisible();
    await watcher.reload();
    await expect(
      watcher.getByText("SPECTATING", { exact: true }),
    ).toBeVisible();
    await host.getByRole("button", { name: "Draw from hidden deck" }).click();
    await expect(host.getByText("Choose one more train card.")).toBeVisible();
    await host.getByRole("button", { name: "Draw from hidden deck" }).click();
    await expect(watcher.locator(".scoreboard")).toBeVisible();
    await watcher.getByRole("button", { name: "Skip to final scores" }).click();
    await expect(watcher.locator(".scoreboard")).toHaveAttribute(
      "data-reveal-done",
      "true",
    );
    await expect(watcher.locator(".winner-confetti")).toHaveCount(0);
    await watcher.getByRole("button", { name: "Leave table" }).click();
    await expect(
      watcher.getByRole("button", { name: "Create a game" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await watchContext.close();
  }
});
