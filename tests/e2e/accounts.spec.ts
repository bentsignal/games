import { test, expect } from "@playwright/test";
test("signed-out visitors must use Google and invitation links survive the sign-in gate", async ({
  page,
}) => {
  await page.goto("/room/ABCDEFGH");
  await expect(
    page.getByRole("heading", { name: "Sign in to play" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Create a game" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Join game" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/room\/ABCDEFGH$/);
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Privacy", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("chat messages");
});
