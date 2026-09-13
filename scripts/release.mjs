import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { retry, smokeBackends, smokeFrontend } from "./release-smoke.mjs";

// Run only in the protected GitHub Production environment. Local commands stay
// credential-free; provider credentials are supplied only to this release step.
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.GITHUB_REF, "refs/heads/main");
assert.equal(process.env.GITHUB_REPOSITORY, "bentsignal/games");
assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch");
assert.equal(process.env.GITHUB_ACTOR, "bentsignal");
assert.equal(process.env.GITHUB_TRIGGERING_ACTOR, "bentsignal");
const sha = process.env.GITHUB_SHA;
assert.match(sha ?? "", /^[a-f0-9]{40}$/);
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
assert.equal(account, "12f3bac77e8f2b140391cd4f79c766ad");
for (const name of ["CLOUDFLARE_API_TOKEN", "CONVEX_DEPLOY_KEY"])
  assert.ok(process.env[name], `Missing ${name}`);
assert.ok(
  process.env.CONVEX_DEPLOY_KEY.startsWith("prod:"),
  "Production key required",
);

const project = "bentsignal-games";
const worker = "games-grams";
const config = "services/grams/wrangler.jsonc";
const report = { sha, startedAt: new Date().toISOString(), stages: [] };
mkdirSync(".release", { recursive: true });
function save() {
  writeFileSync(".release/manifest.json", JSON.stringify(report, null, 2));
}
function run(args, capture = false) {
  return execFileSync("pnpm", args, {
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
}
async function cf(path) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}${path}`,
    {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      signal: AbortSignal.timeout(30000),
    },
  );
  // Do not echo API response bodies, which can contain binding values.
  assert.ok(
    response.ok,
    `Cloudflare metadata request failed: ${response.status}`,
  );
  const data = await response.json();
  assert.ok(data.success, "Cloudflare API returned failure");
  return data.result;
}
async function stage(name, action) {
  const entry = { name, status: "running" };
  report.stages.push(entry);
  save();
  console.log(`Release: ${name}`);
  try {
    await action();
    entry.status = "passed";
  } catch {
    entry.status = "failed";
    throw new Error(`Release stopped at ${name}; see manifest and step logs`);
  } finally {
    save();
  }
}
async function findPages(branch) {
  const deployments = await cf(`/pages/projects/${project}/deployments`);
  const found = deployments.find(
    (d) =>
      d.deployment_trigger?.metadata?.commit_hash === sha &&
      d.deployment_trigger?.metadata?.branch === branch &&
      d.latest_stage?.status === "success",
  );
  assert.ok(found, "Uploaded Pages deployment not found");
  return { id: found.id, url: found.url };
}
function uploadPages(branch) {
  run([
    "exec",
    "wrangler",
    "pages",
    "deploy",
    "dist",
    "--project-name",
    project,
    "--branch",
    branch,
    "--commit-hash",
    sha,
    "--commit-dirty=true",
  ]);
}

try {
  await stage("preflight", async () => {
    const settings = await cf(`/workers/scripts/${worker}/settings`);
    assert.ok(
      settings.bindings.some(
        (b) => b.name === "GRAMS_REALTIME_SECRET" && b.type === "secret_text",
      ),
    );
    assert.ok(
      settings.bindings.some(
        (b) =>
          b.name === "GRAMS" &&
          b.namespace_id === "594d285208dd4519ba392e4c0d941548",
      ),
      "Unexpected Durable Object namespace",
    );
    const names = run(
      ["exec", "convex", "env", "list", "--names-only"],
      true,
    ).split(/\s+/);
    assert.ok(
      !names.includes("GAMES_DEV_SITE_URL"),
      "Development auth configured on production",
    );
    for (const name of [
      "GRAMS_REALTIME_SECRET",
      "AUTH_GOOGLE_CLIENT_ID",
      "AUTH_GOOGLE_CLIENT_SECRET",
      "AUTH_PRIVATE_KEY",
      "AUTH_JWKS",
    ])
      assert.ok(names.includes(name), `Missing production ${name}`);
    const pages = await cf(`/pages/projects/${project}`);
    assert.equal(pages.production_branch, "main");
    report.previousPages = pages.canonical_deployment
      ? {
          id: pages.canonical_deployment.id,
          url: pages.canonical_deployment.url,
        }
      : null;
    const deployments = await cf(`/workers/scripts/${worker}/deployments`);
    report.previousWorker = deployments.deployments?.[0]?.versions;
    assert.ok(
      report.previousWorker?.length,
      "Missing previous Worker versions",
    );
  });
  await stage("build", async () => {
    run(["run", "build"]);
    run([
      "exec",
      "wrangler",
      "deploy",
      "--config",
      config,
      "--env",
      "",
      "--dry-run",
      "--outdir",
      ".release/worker",
    ]);
    writeFileSync("dist/release.json", JSON.stringify({ sha }));
  });
  await stage("candidate", async () => {
    const branch = `release-${sha.slice(0, 12)}`;
    uploadPages(branch);
    report.candidate = await findPages(branch);
    await retry(() => smokeFrontend(report.candidate.url, sha));
  });
  await stage("convex", async () => {
    run([
      "exec",
      "convex",
      "deploy",
      "--typecheck",
      "enable",
      "--message",
      `GitHub release ${sha}`,
    ]);
    await retry(smokeBackends);
  });
  await stage("worker", async () => {
    run([
      "exec",
      "wrangler",
      "deploy",
      "--config",
      config,
      "--env",
      "",
      "--message",
      `GitHub release ${sha}`,
    ]);
    const deployments = await cf(`/workers/scripts/${worker}/deployments`);
    report.worker = deployments.deployments?.[0]?.versions;
    await retry(smokeBackends);
  });
  await stage("frontend", async () => {
    uploadPages("main");
    report.pages = await findPages("main");
    await retry(() => smokeFrontend(`https://${project}.pages.dev`, sha));
    if (process.env.CHECK_PRODUCTION_DOMAIN === "true")
      await retry(() => smokeFrontend("https://games.bentsignal.com", sha));
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  save();
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Release ${sha}: ${report.status}\n\n` +
        report.stages.map((s) => `- ${s.name}: ${s.status}`).join("\n") +
        "\n\nSee the release manifest artifact for deployment IDs and recovery details.\n",
      { flag: "a" },
    );
}
