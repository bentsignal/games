import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { retry, smokeBackends, smokeFrontend } from "./release-smoke.mjs";

assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.GITHUB_REPOSITORY, "bentsignal/games");
assert.equal(process.env.GITHUB_REF, "refs/heads/main");
assert.ok(
  ["push", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME),
);
const sha = process.env.GITHUB_SHA;
assert.match(sha ?? "", /^[a-f0-9]{40}$/);
const account = "12f3bac77e8f2b140391cd4f79c766ad";
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, account);
assert.ok(process.env.CLOUDFLARE_API_TOKEN);
// Clipboard whitespace is not part of the token. Normalize before passing it
// to either the metadata requests or Wrangler.
process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN.trim();
// Deployment keys, unlike project preview keys, select one persistent database.
assert.ok(
  process.env.CONVEX_DEPLOY_KEY?.split("|")[0].endsWith(":chatty-okapi-416"),
  "Stable preview deployment key required",
);
const target = {
  convexUrl: "https://chatty-okapi-416.convex.cloud",
  workerUrl:
    "https://bentsignal-games-server-preview.shawnrodgers266.workers.dev",
};
const project = "bentsignal-games-web-preview";
const worker = "bentsignal-games-server-preview";
const workerConfig = "services/grams/wrangler.jsonc";
const origin = "https://preview.games.bentsignal.com";
assert.equal(process.env.VITE_CONVEX_URL, target.convexUrl);
assert.equal(process.env.VITE_GRAMS_URL, target.workerUrl);
assert.equal(process.env.VITE_DEV_AUTH, "0");
const report = {
  environment: "Preview",
  sha,
  convexDeployment: "chatty-okapi-416",
  ...target,
  origin,
  startedAt: new Date().toISOString(),
  stages: [],
};
mkdirSync(".release", { recursive: true });
function save() {
  writeFileSync(
    ".release/preview-manifest.json",
    JSON.stringify(report, null, 2),
  );
}
function run(args, capture = false) {
  return execFileSync("pnpm", args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}
async function cf(path, options = {}) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30000),
    },
  );
  if (response.status === 404 && options.allowMissing) return null;
  const data = await response.json();
  const codes = (data.errors ?? [])
    .flatMap((error) => [
      error.code,
      ...(error.error_chain ?? []).map((cause) => cause.code),
    ])
    .filter(Number.isInteger);
  assert.ok(
    response.ok,
    `Cloudflare metadata request failed for ${path}: HTTP ${response.status}; error codes ${codes.join(", ")}`,
  );
  assert.ok(data.success, "Cloudflare metadata request failed");
  return data.result;
}
function installWorkerSecret() {
  const secret = run(
    ["exec", "convex", "env", "get", "GRAMS_REALTIME_SECRET"],
    true,
  ).trim();
  assert.ok(secret, "Missing preview realtime secret");
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "secret",
      "put",
      "GRAMS_REALTIME_SECRET",
      "--config",
      workerConfig,
      "--env",
      "preview",
    ],
    { input: secret, stdio: ["pipe", "inherit", "inherit"] },
  );
}
async function stage(name, action) {
  const entry = { name, status: "running" };
  report.stages.push(entry);
  save();
  console.log(`Preview: ${name}`);
  try {
    await action();
    entry.status = "passed";
  } catch (error) {
    entry.status = "failed";
    // Assertions only compare public deployment metadata. CLI error objects can
    // contain captured output, so report their exit status without dumping them.
    console.error(
      error.code === "ERR_ASSERTION"
        ? error.message
        : `Command failed with exit status ${error.status ?? "unknown"}`,
    );
    throw new Error(
      `Preview stopped at ${name}; see the manifest and step logs`,
    );
  } finally {
    save();
  }
}

try {
  await stage("preflight", async () => {
    const names = run(
      ["exec", "convex", "env", "list", "--names-only"],
      true,
    ).split(/\s+/);
    for (const name of [
      "AUTH_PRIVATE_KEY",
      "AUTH_JWKS",
      "AUTH_GOOGLE_CLIENT_ID",
      "AUTH_GOOGLE_CLIENT_SECRET",
      "GRAMS_REALTIME_SECRET",
      "GAMES_DEV_WEB_ORIGIN",
    ])
      assert.ok(names.includes(name), `Missing preview ${name}`);
    console.log("Preview: Convex environment verified");
    const pages = await cf(`/pages/projects/${project}`);
    assert.equal(pages.production_branch, "main");
    report.previousPages = pages.canonical_deployment
      ? {
          id: pages.canonical_deployment.id,
          url: pages.canonical_deployment.url,
        }
      : null;
    const settings = await cf(`/workers/scripts/${worker}/settings`);
    assert.ok(
      settings.bindings.some(
        (b) => b.name === "GRAMS_REALTIME_SECRET" && b.type === "secret_text",
      ),
    );
    assert.ok(
      settings.bindings.some(
        (b) => b.name === "CONVEX_URL" && b.text === target.convexUrl,
      ),
    );
    const binding = settings.bindings.find((b) => b.name === "GRAMS");
    assert.ok(binding?.namespace_id);
    report.namespace = binding.namespace_id;
    report.previousWorker = (
      await cf(`/workers/scripts/${worker}/deployments`)
    ).deployments?.[0]?.versions;
  });
  await stage("build", async () => {
    run(["run", "build"]);
    run([
      "exec",
      "wrangler",
      "deploy",
      "--config",
      "services/grams/wrangler.jsonc",
      "--env",
      "preview",
      "--dry-run",
      "--outdir",
      ".release/preview-worker",
    ]);
    writeFileSync(
      "dist/release.json",
      JSON.stringify({ sha, environment: "Preview", ...target }),
    );
  });
  await stage("convex", async () => {
    run([
      "exec",
      "convex",
      "deploy",
      "--typecheck",
      "enable",
      "--message",
      `Stable preview ${sha}`,
    ]);
  });
  await stage("worker", async () => {
    run([
      "exec",
      "wrangler",
      "deploy",
      "--config",
      "services/grams/wrangler.jsonc",
      "--env",
      "preview",
      "--message",
      `Stable preview ${sha}`,
    ]);
    installWorkerSecret();
    const settings = await cf(`/workers/scripts/${worker}/settings`);
    for (const name of ["GRAMS", "TICKET"])
      assert.ok(
        settings.bindings.some(
          (binding) => binding.name === name && binding.namespace_id,
        ),
      );
    report.worker = (
      await cf(`/workers/scripts/${worker}/deployments`)
    ).deployments?.[0]?.versions;
    await retry(() => smokeBackends(target));
  });
  await stage("frontend", async () => {
    run([
      "exec",
      "wrangler",
      "pages",
      "deploy",
      "dist",
      "--project-name",
      project,
      "--branch",
      "main",
      "--commit-hash",
      sha,
      "--commit-dirty=true",
    ]);
    const pages = await cf(`/pages/projects/${project}`);
    const deployment = pages.canonical_deployment;
    assert.equal(deployment?.deployment_trigger?.metadata?.commit_hash, sha);
    report.pages = { id: deployment.id, url: deployment.url };
    await retry(() =>
      smokeFrontend(`https://${project}.pages.dev`, sha, target),
    );
    const domains = await cf(`/pages/projects/${project}/domains`);
    if (
      domains.some(
        (domain) =>
          domain.name === new URL(origin).hostname &&
          domain.status === "active",
      )
    )
      await retry(() => smokeFrontend(origin, sha, target));
    else report.domainMigrationPending = true;
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
      `Stable preview ${sha}: ${report.status}\n\n${origin}\n\n` +
        report.stages.map((s) => `- ${s.name}: ${s.status}`).join("\n") +
        "\n\nThe preview manifest records backend and frontend deployment evidence.\n",
      { flag: "a" },
    );
}
