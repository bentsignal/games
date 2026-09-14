import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../services/convex/convex/schema";
import { api, internal } from "../services/convex/convex/_generated/api";

const modules = import.meta.glob("../services/convex/convex/**/*.{ts,js}");
const site = "https://chatty-okapi-416.convex.site";
afterEach(() => vi.unstubAllEnvs());
function preview() {
  vi.stubEnv("CONVEX_SITE_URL", site);
  vi.stubEnv("GRAMS_REALTIME_SECRET", "test-only-secret");
  return convexTest(schema, modules);
}

test("preview denies existing players and onboarding without a verified invitation", async () => {
  const t = preview();
  const id = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      username: "Existing",
      usernameKey: "existing",
    });
    await ctx.db.patch(id, { playerId: id });
    return id;
  });
  const user = t.withIdentity({ subject: id, email: "Owner@example.com" });
  expect((await user.query(api.users.me, {}))?.previewAccessDenied).toBe(true);
  await expect(
    user.mutation(api.users.onboard, { username: "Existing" }),
  ).rejects.toThrow("Preview access");
  await expect(
    user.mutation(api.rooms.create, {
      token: "a".repeat(64),
      name: "Player",
      mode: "mega",
    }),
  ).rejects.toThrow("Preview access");
  await expect(
    user.query(api.rooms.get, { token: "a".repeat(64), code: "ABCDEFGH" }),
  ).rejects.toThrow("Preview access");
  await expect(user.query(api.grams.view, {})).rejects.toThrow(
    "Preview access",
  );
  await expect(user.mutation(api.realtime.connect, {})).rejects.toThrow(
    "Preview access",
  );
});

test("Google sign-in creates an identifiable account but only database approval grants access", async () => {
  const t = preview();
  const id = await t.run((ctx) => ctx.db.insert("users", {}));
  const args = {
    provider: "google" as const,
    providerAccountId: "google-owner",
    userId: id,
    profile: {
      id: "google-owner",
      email: "OWNER@example.com",
      emailVerified: true,
    },
  };
  await t.mutation(internal.users.onGoogleSignIn, args);
  const user = t.withIdentity({ subject: id });
  expect((await user.query(api.users.me, {}))?.previewAccessDenied).toBe(true);
  expect((await user.query(api.users.me, {}))?.verifiedGoogleEmail).toBe(
    "owner@example.com",
  );
  await t.mutation(internal.users.setPreviewApproval, {
    userId: id,
    approved: true,
  });
  expect((await user.query(api.users.me, {}))?.previewAccessDenied).toBe(false);
  await user.mutation(api.users.onboard, { username: "Owner" });
  await expect(
    user.mutation(api.rooms.create, {
      token: "a".repeat(64),
      name: "Player",
      mode: "mega",
    }),
  ).resolves.toBeTruthy();
  await expect(user.mutation(api.realtime.connect, {})).resolves.toBeTruthy();
  // A later sign-in must preserve the administrator's approval.
  await t.mutation(internal.users.onGoogleSignIn, args);
  expect((await user.query(api.users.me, {}))?.previewAccessDenied).toBe(false);
  await t.mutation(internal.users.setPreviewApproval, {
    userId: id,
    approved: false,
  });
  await expect(user.mutation(api.realtime.connect, {})).rejects.toThrow(
    "Preview access",
  );
  expect((await user.query(api.users.me, {}))?.previewAccessDenied).toBe(true);
});

test("production and ordinary local development do not inherit the preview restriction", async () => {
  const t = preview();
  const id = await t.run((ctx) => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: id });
  for (const url of [
    "https://auth.games.bentsignal.com",
    "https://proficient-porpoise-581.convex.site",
    "https://temporary.convex.site",
  ]) {
    vi.stubEnv("CONVEX_SITE_URL", url);
    expect((await user.query(api.users.me, {}))?.previewAccessDenied).toBe(
      false,
    );
  }
});

test("admin fixture access requires this deployment's development opt-in", async () => {
  const t = preview();
  const id = await t.run((ctx) =>
    ctx.db.insert("users", { testAccount: true }),
  );
  const user = t.withIdentity({ subject: id });
  vi.stubEnv("GAMES_DEV_SITE_URL", "https://other.convex.site");
  expect((await user.query(api.users.me, {}))?.previewAccessDenied).toBe(true);
  vi.stubEnv("GAMES_DEV_SITE_URL", site);
  expect((await user.query(api.users.me, {}))?.previewAccessDenied).toBe(false);
});
