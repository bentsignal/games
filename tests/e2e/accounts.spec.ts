import { test, expect } from "@playwright/test";
import { signIn } from "./auth";

test("Google sign-in is centered and invitation links survive the gate", async ({
  page,
}) => {
  await page.goto("/room/ABCDEFGH");
  const button = page.getByRole("button", { name: "Sign in with Google" });
  await expect(button).toBeVisible();
  await expect(page.getByRole("heading")).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page).toHaveURL(/\/room\/ABCDEFGH$/);
  for (const size of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const box = await button.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - size.width / 2)).toBeLessThan(2);
    expect(Math.abs(box!.y + box!.height / 2 - size.height / 2)).toBeLessThan(
      2,
    );
  }
});

test("signed-in refresh has no temporary auth content and account menu signs out", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page, "AuthRefreshTest");
  await expect(
    page.getByRole("button", { name: "Create a game", exact: true }),
  ).toBeVisible();
  await page.addInitScript(() => {
    (window as any).authFlashes = [];
    new MutationObserver(() => {
      const text = document.body?.innerText ?? "";
      if (/Signing you in|Sign in with Google|Choose a username/.test(text))
        (window as any).authFlashes.push(text);
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create a game", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).authFlashes)).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeHidden();
  await page.locator(".account-menu summary").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toBeVisible();
});
