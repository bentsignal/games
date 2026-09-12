import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../services/convex/convex/schema";
import { internal } from "../services/convex/convex/_generated/api";

const modules = import.meta.glob("../services/convex/convex/**/*.{ts,js}");
afterEach(() => vi.unstubAllEnvs());

test("fixtures are disabled without an explicit development opt-in", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://production.convex.site");
  vi.stubEnv("GAMES_DEV_SITE_URL", "");
  await expect(
    convexTest(schema, modules).mutation(internal.testing.resetGrams, {}),
  ).rejects.toThrow(/disabled/);
});

test("a development marker from another deployment cannot enable fixtures", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://production.convex.site");
  vi.stubEnv("GAMES_DEV_SITE_URL", "https://temporary.convex.site");
  await expect(
    convexTest(schema, modules).mutation(internal.testing.resetGrams, {}),
  ).rejects.toThrow(/disabled/);
});

test("isolated development fixtures work when bound to this deployment", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://temporary.convex.site");
  vi.stubEnv("GAMES_DEV_SITE_URL", "https://temporary.convex.site");
  await expect(
    convexTest(schema, modules).mutation(internal.testing.resetGrams, {}),
  ).resolves.toBeNull();
});
