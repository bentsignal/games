import { test, expect } from "@playwright/test";

test("agents can sign in locally, refresh, and sign out without Google", async ({
  page,
}) => {
  await page.goto("/ticket");
  await expect(
    page.getByRole("heading", { name: "Development sign-in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toHaveCount(0);
  await page.getByLabel("Test username").fill("AgentBrowser_QA");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create a game", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create a game", exact: true })
    .click();
  await page.getByLabel("GAME MODE", { exact: true }).selectOption("classic");
  await page.getByLabel("TURN TIMER", { exact: true }).selectOption("60");
  await expect(page.getByLabel("GAME MODE", { exact: true })).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.reload();
  await expect(page.getByLabel("GAME MODE", { exact: true })).toHaveValue(
    "classic",
  );
  await expect(page.getByLabel("TURN TIMER", { exact: true })).toHaveValue(
    "60",
  );
  await page.locator(".account-menu summary").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Development sign-in" }),
  ).toBeVisible();
});

test("development sign-in preserves an invitation URL", async ({ page }) => {
  await page.goto("/ticket/room/ABCDEFGH");
  await page.getByLabel("Test username").fill("AgentInvite_QA");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Development sign-in" }),
  ).toHaveCount(0);
  await expect(page.locator(".account-menu summary")).toBeVisible();
  await expect(page).toHaveURL(/\/ticket\/room\/ABCDEFGH$/);
});
