import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { findEvidence, assertNoLaterDeployment } from "./release-evidence.mjs";
const repository = "bentsignal/games";
const productionUrl = "https://games.bentsignal.com";
function command(binary, args, cwd) {
  return execFileSync(binary, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}
function git(args, cwd) {
  return command("git", args, cwd);
}
function sha(value) {
  assert.match(value ?? "", /^[a-f0-9]{40}$/, "Expected a full commit SHA");
  return value;
}

export function collectChanges(base, candidate, cwd) {
  sha(base);
  sha(candidate);
  git(["merge-base", "--is-ancestor", base, candidate], cwd);
  const commits = git(
    ["rev-list", "--reverse", "--topo-order", `${base}..${candidate}`],
    cwd,
  )
    .split("\n")
    .filter(Boolean)
    .map((commit) => ({
      sha: commit,
      subject: git(["show", "-s", "--format=%s", commit], cwd),
      // Include changes that were later reverted, and merge-only resolutions.
      files: git(
        [
          "diff-tree",
          "--root",
          "-m",
          "--no-commit-id",
          "--name-only",
          "-r",
          "-z",
          commit,
        ],
        cwd,
      )
        .split("\0")
        .filter(Boolean),
    }));
  return {
    commits,
    changedFiles: git(["diff", "--name-only", "-z", base, candidate], cwd)
      .split("\0")
      .filter(Boolean),
  };
}

export async function readRelease(origin) {
  const url = new URL("/release.json", origin);
  assert.equal(url.protocol, "https:", "Use a deployed HTTPS environment");
  url.searchParams.set("review", Date.now().toString());
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `Release marker unavailable: HTTP ${response.status}`);
  return sha((await response.json()).sha);
}

function github(endpoint) {
  return JSON.parse(
    command("gh", ["api", "--paginate", "--slurp", endpoint]),
  ).flat();
}

async function main() {
  const { values } = parseArgs({
    options: {
      candidate: { type: "string" },
      "preview-url": { type: "string" },
    },
  });
  git(["fetch", "origin", "main", "--tags"]);
  assert.equal(
    git(["rev-parse", "--is-shallow-repository"]),
    "false",
    "Fetch full Git history before review",
  );
  const base = await readRelease(productionUrl);
  const previewUrl = values["preview-url"];
  const previewSha = previewUrl ? await readRelease(previewUrl) : null;
  const candidate = sha(
    values.candidate ?? previewSha ?? git(["rev-parse", "origin/main"]),
  );
  if (previewSha)
    assert.equal(
      candidate,
      previewSha,
      "Preview changed; review its deployed commit",
    );
  git(["merge-base", "--is-ancestor", candidate, "origin/main"]);
  const production = findEvidence(base, "production");
  assertNoLaterDeployment(production, "production");
  const preview = previewSha ? findEvidence(candidate, "preview") : null;
  if (preview) assertNoLaterDeployment(preview, "preview");
  const changes = collectChanges(base, candidate);
  const prs = new Map();
  for (const commit of changes.commits) {
    const associated = github(
      `repos/${repository}/commits/${commit.sha}/pulls?per_page=100`,
    ).filter(
      (pr) =>
        pr.merged_at &&
        pr.base.repo.full_name === repository &&
        pr.base.ref === "main",
    );
    commit.pullRequests = associated.map((pr) => pr.number);
    for (const pr of associated)
      prs.set(pr.number, {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        body: pr.body,
      });
  }
  // Detect deployments changing while GitHub metadata was collected.
  assert.equal(
    await readRelease(productionUrl),
    base,
    "Production changed during review; regenerate",
  );
  if (previewUrl)
    assert.equal(
      await readRelease(previewUrl),
      candidate,
      "Preview changed during review; regenerate",
    );
  const report = {
    repository,
    generatedAt: new Date().toISOString(),
    productionUrl,
    production,
    preview,
    base,
    candidate,
    previewUrl: previewUrl ?? null,
    status:
      "inventory-only; agent code review, deployment verification, testing, and approval required",
    ...changes,
    pullRequests: [...prs.values()],
  };
  const directory = resolve(".release", `review-${candidate}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, "inventory.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const lines = [
    "# Release review inventory",
    "",
    `Production frontend: ${base}`,
    `Candidate: ${candidate}`,
    `Preview: ${previewUrl ?? "Not verified. This is a planning inventory, not a tested release candidate."}`,
    "",
    `Compare: https://github.com/${repository}/compare/${base}...${candidate}`,
    "",
    "This inventory is not a testing checklist or release approval. Verify the successful coordinated deployment manifests, then review the code and write concrete test steps.",
    "",
    "## Pull requests",
    "",
    ...report.pullRequests.map(
      (pr) => `- #${pr.number}: ${pr.title.replaceAll("\n", " ")} (${pr.url})`,
    ),
    "",
    "## Every commit",
    "",
    ...changes.commits.map(
      (commit) =>
        `- ${commit.sha}: ${commit.subject} [${commit.pullRequests.length ? commit.pullRequests.map((n) => `#${n}`).join(", ") : "no associated merged PR"}]`,
    ),
    "",
    "## Files changed in the final diff",
    "",
    ...changes.changedFiles.map((file) => `- ${JSON.stringify(file)}`),
    "",
  ];
  writeFileSync(resolve(directory, "inventory.md"), lines.join("\n"));
  console.log(
    `Review inventory: ${directory}\n${changes.commits.length} commits, ${prs.size} PRs. Nothing deployed.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
