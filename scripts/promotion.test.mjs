import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { validateBundle } from "./promotion.mjs";
import {
  validateJobs,
  validateManifest,
  validateRun,
  requiredChecks,
} from "./release-evidence.mjs";

const base = "a".repeat(40),
  candidate = "b".repeat(40);
const inventory = {
  repository: "bentsignal/games",
  base,
  candidate,
  previewUrl: "https://preview.games.bentsignal.com",
};
const release = {
  draft: true,
  tag_name: `production-${candidate}`,
  target_commitish: candidate,
  author: { login: "bentsignal" },
};
function bundle(value = inventory) {
  const raw = JSON.stringify({
    inventory: value,
    review: `Tested ${value.candidate} against ${value.base}`,
  });
  return { raw, digest: createHash("sha256").update(raw).digest("hex") };
}
test("promotion pins the reviewed commit and rejects changed reviews or release targets", () => {
  const { raw, digest } = bundle();
  assert.equal(
    validateBundle(raw, digest, release).inventory.candidate,
    candidate,
  );
  assert.throws(() => validateBundle(raw + " ", digest, release));
  for (const patch of [
    { draft: false },
    { target_commitish: base },
    { tag_name: "main" },
    { author: { login: "other" } },
  ])
    assert.throws(() => validateBundle(raw, digest, { ...release, ...patch }));
  for (const patch of [
    { candidate: "main" },
    { base: candidate },
    { repository: "other/repo" },
    { previewUrl: "https://other.example" },
  ]) {
    const b = bundle({ ...inventory, ...patch });
    assert.throws(() => validateBundle(b.raw, b.digest, release));
  }
});
test("frontend success cannot stand in for a coordinated deployment", () => {
  const manifest = {
    sha: candidate,
    status: "passed",
    pages: { id: "pages" },
    worker: [{ version_id: "worker" }],
    stages: [
      "preflight",
      "build",
      "candidate",
      "convex",
      "worker",
      "frontend",
    ].map((name) => ({ name, status: "passed" })),
  };
  validateManifest(manifest, candidate, "production");
  for (const name of ["convex", "worker", "frontend"]) {
    const broken = structuredClone(manifest);
    broken.stages.find((s) => s.name === name).status = "failed";
    assert.throws(() => validateManifest(broken, candidate, "production"));
  }
  assert.throws(() =>
    validateManifest({ ...manifest, sha: base }, candidate, "production"),
  );
  assert.throws(() =>
    validateManifest(
      { ...manifest, status: "failed" },
      candidate,
      "production",
    ),
  );
  assert.throws(() =>
    validateManifest({ ...manifest, worker: [] }, candidate, "production"),
  );
});
test("deployment evidence requires trusted main workflows and every successful check", () => {
  const run = {
    repository: { full_name: "bentsignal/games" },
    head_branch: "main",
    path: ".github/workflows/ci.yml",
    event: "push",
  };
  validateRun(run, "preview");
  for (const patch of [
    { head_branch: "feature" },
    { event: "pull_request" },
    { path: ".github/workflows/other.yml" },
  ])
    assert.throws(() => validateRun({ ...run, ...patch }, "preview"));
  const jobs = [...requiredChecks, "Stable preview deployment"].map((name) => ({
    name,
    conclusion: "success",
  }));
  validateJobs(jobs, "preview");
  for (let i = 0; i < jobs.length; i++) {
    const broken = structuredClone(jobs);
    broken[i].conclusion = "skipped";
    assert.throws(() => validateJobs(broken, "preview"));
  }
});

test("staging freezes the reviewed inventory and prepares a draft without dispatching", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "games-stage-test-"));
  try {
    mkdirSync(join(dir, "bin"));
    writeFileSync(
      join(dir, "bin", "gh"),
      `#!${process.execPath}
const fs=require('node:fs');
const args=process.argv.slice(2);
fs.appendFileSync(process.env.STAGE_CALLS,JSON.stringify(args)+'\\n');
if(args[0]!=='release'||!['create','view'].includes(args[1]))process.exit(1);
if(args[1]==='view')process.stdout.write(JSON.stringify({databaseId:123,url:'https://example.invalid/draft'}));
`,
      { mode: 0o755 },
    );
    const value = {
      ...inventory,
      preview: { runId: 1 },
      production: { runId: 2 },
    };
    writeFileSync(join(dir, "inventory.json"), JSON.stringify(value));
    writeFileSync(
      join(dir, "review.md"),
      `Candidate ${candidate}\nBaseline ${base}\nTest the games.`,
    );
    execFileSync(
      process.execPath,
      [
        resolve("scripts/stage-release.mjs"),
        "--inventory",
        join(dir, "inventory.json"),
        "--review",
        join(dir, "review.md"),
      ],
      {
        env: {
          ...process.env,
          PATH: join(dir, "bin") + ":" + process.env.PATH,
          STAGE_CALLS: join(dir, "calls"),
        },
        stdio: "pipe",
      },
    );
    const promotion = JSON.parse(
      readFileSync(join(dir, "promotion.json"), "utf8"),
    );
    const frozen = readFileSync(join(dir, "review-bundle.json"), "utf8");
    assert.equal(
      promotion.digest,
      createHash("sha256").update(frozen).digest("hex"),
    );
    assert.equal(promotion.candidate, candidate);
    const calls = readFileSync(join(dir, "calls"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes("--draft"));
    assert.equal(calls[0][calls[0].indexOf("--target") + 1], candidate);
    assert.ok(promotion.dispatch.includes("release_id=123"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
