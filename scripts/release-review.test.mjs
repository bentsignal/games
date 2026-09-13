import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectChanges, readRelease } from "./release-review.mjs";

test("inventory retains reverted commits and side-branch commits", () => {
  const cwd = mkdtempSync(join(tmpdir(), "games-release-review-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(cwd, "base"), "base");
    git("add", ".");
    git("commit", "-m", "baseline");
    const base = git("rev-parse", "HEAD");
    git("checkout", "-b", "feature");
    writeFileSync(join(cwd, "temporary"), "feature");
    git("add", ".");
    git("commit", "-m", "add feature");
    const feature = git("rev-parse", "HEAD");
    git("checkout", "main");
    git("merge", "--no-ff", "feature", "-m", "merge feature");
    git("revert", "--no-edit", feature);
    const candidate = git("rev-parse", "HEAD");
    const result = collectChanges(base, candidate, cwd);
    assert.deepEqual(result.changedFiles, []);
    assert.equal(result.commits.length, 3);
    assert.equal(result.commits[0].sha, feature);
    assert.ok(result.commits[0].files.includes("temporary"));
    assert.ok(result.commits[1].files.includes("temporary"));
    assert.throws(() => collectChanges(candidate, base, cwd));
    assert.throws(() => collectChanges("--all", candidate, cwd));
    assert.deepEqual(collectChanges(candidate, candidate, cwd), {
      commits: [],
      changedFiles: [],
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("release marker rejects HTTP, missing markers, and malformed SHAs", async (t) => {
  const commit = "a".repeat(40);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ sha: commit }),
  );
  assert.equal(await readRelease("https://preview.example.invalid"), commit);
  await assert.rejects(readRelease("http://preview.example.invalid"));
  globalThis.fetch = async () => Response.json({ sha: "main" });
  await assert.rejects(readRelease("https://preview.example.invalid"));
  globalThis.fetch = async () => new Response("missing", { status: 404 });
  await assert.rejects(readRelease("https://preview.example.invalid"));
});
