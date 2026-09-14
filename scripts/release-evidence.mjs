import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const repository = "bentsignal/games";
export const requiredChecks = [
  "Typecheck",
  "Lint",
  "Format",
  "Tests",
  "Worker integration",
  "Build",
];
export function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}
export function api(path) {
  return JSON.parse(gh(["api", `repos/${repository}/${path}`]));
}
export function pages(path, field) {
  return JSON.parse(
    gh(["api", "--paginate", "--slurp", `repos/${repository}/${path}`]),
  ).flatMap((p) => (field ? p[field] : p));
}
export function validateManifest(manifest, sha, environment) {
  assert.equal(manifest.sha, sha, "Manifest commit differs from candidate");
  assert.equal(
    manifest.status,
    "passed",
    "Deployment did not finish successfully",
  );
  for (const name of [
    "preflight",
    "build",
    ...(environment === "production" ? ["candidate"] : []),
    "convex",
    "worker",
    "frontend",
  ])
    assert.equal(
      manifest.stages.find((s) => s.name === name)?.status,
      "passed",
      `Missing successful ${name} stage`,
    );
  assert.ok(
    manifest.pages?.id && manifest.worker?.length,
    "Missing deployed resource versions",
  );
}
export function validateJobs(jobs, environment) {
  const deployment =
    environment === "preview"
      ? "Stable preview deployment"
      : "Production release";
  assert.equal(
    jobs.find((j) => j.name === deployment)?.conclusion,
    "success",
    "Deployment job did not succeed",
  );
  for (const name of requiredChecks)
    assert.equal(
      jobs.find((j) => j.name === name)?.conclusion,
      "success",
      `Missing passing ${name}`,
    );
}
export function validateRun(run, environment) {
  assert.equal(run.repository?.full_name, repository);
  assert.equal(run.head_branch, "main");
  assert.ok(["push", "workflow_dispatch"].includes(run.event));
  assert.ok(
    [".github/workflows/ci.yml", ".github/workflows/promote.yml"].includes(
      run.path,
    ),
  );
  if (environment === "preview")
    assert.equal(run.path, ".github/workflows/ci.yml");
}
export function asset(release, name) {
  const item = release.assets.find((a) => a.name === name);
  assert.ok(item, `Missing release asset ${name}`);
  return gh([
    "api",
    `repos/${repository}/releases/assets/${item.id}`,
    "-H",
    "Accept: application/octet-stream",
  ]);
}
export function verifyEvidence(evidence, sha, environment) {
  validateManifest(evidence.manifest, sha, environment);
  const run = api(`actions/runs/${evidence.runId}`);
  validateRun(run, environment);
  assert.equal(evidence.manifest.workflowSha ?? sha, run.head_sha);
  const jobs = pages(
    `actions/runs/${run.id}/jobs?filter=all&per_page=100`,
    "jobs",
  )
    .filter((j) => j.run_attempt <= evidence.attempt)
    .sort((a, b) => b.id - a.id);
  validateJobs(jobs, environment);
  return run;
}
export function findEvidence(sha, environment) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  if (environment === "production") {
    const release = pages("releases?per_page=100").find(
      (r) => !r.draft && r.tag_name === `production-${sha}`,
    );
    if (release) {
      const manifest = JSON.parse(asset(release, "manifest.json"));
      const evidence = {
        runId: manifest.runId,
        attempt: manifest.runAttempt,
        manifest,
      };
      verifyEvidence(evidence, sha, environment);
      return evidence;
    }
  }
  const prefix = environment === "preview" ? "preview" : "release";
  const artifacts = pages("actions/artifacts?per_page=100", "artifacts")
    .filter((a) => !a.expired && a.name.startsWith(`${prefix}-${sha}-`))
    .sort((a, b) => b.id - a.id);
  assert.ok(
    artifacts.length,
    `No ${environment} deployment evidence for ${sha}`,
  );
  const artifact = artifacts[0];
  const directory = mkdtempSync(join(tmpdir(), "games-evidence-"));
  try {
    gh([
      "run",
      "download",
      String(artifact.workflow_run.id),
      "--repo",
      repository,
      "--name",
      artifact.name,
      "--dir",
      directory,
    ]);
    const manifest = JSON.parse(
      readFileSync(
        join(
          directory,
          environment === "preview" ? "preview-manifest.json" : "manifest.json",
        ),
        "utf8",
      ),
    );
    const evidence = {
      runId: artifact.workflow_run.id,
      attempt: Number(artifact.name.split("-").at(-1)),
      manifest,
    };
    verifyEvidence(evidence, sha, environment);
    return evidence;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
// A served frontend can remain unchanged after a failed backend rollout.
export function assertNoLaterDeployment(evidence, environment) {
  const selected = api(`actions/runs/${evidence.runId}`);
  const name =
    environment === "preview"
      ? "Stable preview deployment"
      : "Production release";
  // An old workflow can be rerun after the selected deployment, so do not filter
  // by run creation time alone.
  const runs = pages(
    "actions/runs?branch=main&per_page=100",
    "workflow_runs",
  ).filter((run) => run.updated_at >= selected.created_at);
  for (const run of runs) {
    if (String(run.id) === process.env.GITHUB_RUN_ID) continue;
    if (run.id === selected.id && run.run_attempt === evidence.attempt)
      continue;
    if (
      ![".github/workflows/ci.yml", ".github/workflows/promote.yml"].includes(
        run.path,
      )
    )
      continue;
    const jobs = pages(`actions/runs/${run.id}/jobs?per_page=100`, "jobs");
    assert.ok(
      !jobs.some(
        (j) =>
          j.name === name &&
          j.started_at >= evidence.manifest.finishedAt &&
          j.conclusion !== "skipped" &&
          (run.id !== selected.id || j.run_attempt > evidence.attempt),
      ),
      `${environment} has a later deployment attempt (${run.id}); inspect it and regenerate the review`,
    );
  }
}
