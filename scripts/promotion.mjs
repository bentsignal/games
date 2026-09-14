import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  api,
  asset,
  assertNoLaterDeployment,
  gh,
  repository,
  verifyEvidence,
  findEvidence,
} from "./release-evidence.mjs";
import { readRelease, collectChanges } from "./release-review.mjs";

export function validateBundle(raw, digest, release) {
  assert.match(digest ?? "", /^[a-f0-9]{64}$/);
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    digest,
    "The reviewed bundle changed",
  );
  const bundle = JSON.parse(raw);
  const { inventory, review } = bundle;
  assert.equal(inventory.repository, repository);
  for (const value of [inventory.base, inventory.candidate])
    assert.match(value ?? "", /^[a-f0-9]{40}$/);
  assert.notEqual(
    inventory.base,
    inventory.candidate,
    "Candidate is already in production",
  );
  assert.equal(release.draft, true, "Release is already published");
  assert.equal(release.tag_name, `production-${inventory.candidate}`);
  assert.equal(release.target_commitish, inventory.candidate);
  assert.equal(release.author.login, "bentsignal");
  assert.ok(
    review.includes(inventory.base) && review.includes(inventory.candidate),
  );
  assert.equal(inventory.previewUrl, "https://preview.games.bentsignal.com");
  return bundle;
}
export async function verifyPromotion(releaseId, digest) {
  assert.match(String(releaseId), /^[1-9][0-9]*$/);
  const release = api(`releases/${releaseId}`);
  const raw = asset(release, "review-bundle.json");
  const bundle = validateBundle(raw, digest, release);
  const { inventory } = bundle;
  execFileSync("git", [
    "merge-base",
    "--is-ancestor",
    inventory.candidate,
    "origin/main",
  ]);
  execFileSync("git", [
    "merge-base",
    "--is-ancestor",
    inventory.base,
    inventory.candidate,
  ]);
  const changes = collectChanges(inventory.base, inventory.candidate);
  assert.deepEqual(
    inventory.changedFiles,
    changes.changedFiles,
    "Review omits changed files",
  );
  assert.deepEqual(
    inventory.commits.map(({ sha, subject, files }) => ({
      sha,
      subject,
      files,
    })),
    changes.commits,
    "Review omits or changes Git history",
  );
  assert.deepEqual(
    findEvidence(inventory.candidate, "preview"),
    inventory.preview,
    "Preview evidence changed",
  );
  assert.deepEqual(
    findEvidence(inventory.base, "production"),
    inventory.production,
    "Production evidence changed",
  );
  verifyEvidence(inventory.production, inventory.base, "production");
  verifyEvidence(inventory.preview, inventory.candidate, "preview");
  assertNoLaterDeployment(inventory.production, "production");
  assertNoLaterDeployment(inventory.preview, "preview");
  assert.equal(
    await readRelease("https://games.bentsignal.com"),
    inventory.base,
    "Production baseline changed",
  );
  assert.equal(
    await readRelease(inventory.previewUrl),
    inventory.candidate,
    "Preview changed; review and test again",
  );
  mkdirSync(".release", { recursive: true });
  writeFileSync(".release/review-bundle.json", raw);
  writeFileSync(".release/review.md", bundle.review);
  if (process.env.GITHUB_OUTPUT)
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      `candidate=${inventory.candidate}\n`,
      { flag: "a" },
    );
  return bundle;
}
async function main() {
  const mode = process.argv[2] ?? "verify";
  const id = process.env.RELEASE_ID;
  const digest = process.env.REVIEW_SHA256;
  if (mode === "verify") {
    const bundle = await verifyPromotion(id, digest);
    console.log(
      `Verified candidate ${bundle.inventory.candidate}; nothing deployed.`,
    );
  } else if (mode === "publish") {
    const release = api(`releases/${id}`);
    const raw = readFileSync(".release/review-bundle.json", "utf8");
    const { inventory, review } = validateBundle(raw, digest, release);
    assert.equal(
      asset(release, "review-bundle.json"),
      raw,
      "Draft changed during deployment",
    );
    const manifest = JSON.parse(readFileSync(".release/manifest.json", "utf8"));
    const { validateManifest } = await import("./release-evidence.mjs");
    validateManifest(manifest, inventory.candidate, "production");
    verifyEvidence(
      { runId: manifest.runId, attempt: manifest.runAttempt, manifest },
      inventory.candidate,
      "production",
    );
    assertNoLaterDeployment(
      { runId: manifest.runId, attempt: manifest.runAttempt, manifest },
      "production",
    );
    assert.equal(manifest.reviewDigest, digest);
    assert.equal(manifest.runId, Number(process.env.GITHUB_RUN_ID));
    assert.equal(
      await readRelease("https://games.bentsignal.com"),
      inventory.candidate,
    );
    const tag = release.tag_name;
    // Verify an existing tag cannot redirect the published release to another commit.
    const refs = execFileSync(
      "git",
      ["ls-remote", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
      { encoding: "utf8" },
    ).trim();
    if (refs)
      assert.ok(
        refs
          .split("\n")
          .every((line) => line.startsWith(inventory.candidate + "\t")),
        "Release tag points elsewhere",
      );
    gh([
      "release",
      "upload",
      tag,
      ".release/manifest.json",
      ".release/review.md",
      "--repo",
      repository,
      "--clobber",
    ]);
    const body = `${review}\n\nDeployment: https://github.com/${repository}/actions/runs/${manifest.runId}\n\nCompare: https://github.com/${repository}/compare/${inventory.base}...${inventory.candidate}\n`;
    writeFileSync(".release/notes.md", body);
    gh([
      "release",
      "edit",
      tag,
      "--repo",
      repository,
      "--notes-file",
      ".release/notes.md",
      "--draft=false",
      "--latest",
    ]);
    console.log(`Published ${tag}`);
  } else throw new Error("Unknown promotion command");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
