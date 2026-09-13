import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "games-setup-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of ["scripts", "node_modules/.bin", "services/grams"])
    mkdirSync(join(dir, path), { recursive: true });
  for (const file of ["setup.mjs", "dev-config.mjs"])
    copyFileSync(new URL(file, import.meta.url), join(dir, "scripts", file));
  writeFileSync(
    join(dir, "node_modules/.bin/convex"),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
let db = fs.existsSync('remote.json') ? JSON.parse(fs.readFileSync('remote.json')) : { creates: 0, env: {} };
if (args[0] === 'deployment' && args[1] === 'create') {
  if (!args[2].startsWith('BSX:games:dev/')) process.exit(7);
  if (!args.includes('--type') || args[args.indexOf('--type') + 1] !== 'dev' || !args.includes('in 7 days')) process.exit(3);
  db.creates++;
  db.env = {};
  db.deployment = 'isolated-test-' + db.creates;
  fs.writeFileSync('.env.local', 'CONVEX_DEPLOYMENT=dev:' + db.deployment + '\\nVITE_CONVEX_URL=https://' + db.deployment + '.convex.cloud\\n');
} else if (args[0] === 'env') {
  if (args[args.indexOf('--deployment') + 1] !== db.deployment) process.exit(4);
  if (args[1] === 'list') console.log(Object.keys(db.env).join('\\n'));
  else if (args[1] === 'get') console.log(db.env[args[2]]);
  else if (args[1] === 'set') db.env[args[2]] = fs.readFileSync(0, 'utf8');
  else process.exit(5);
} else process.exit(6);
fs.writeFileSync('remote.json', JSON.stringify(db));
`,
    { mode: 0o700 },
  );
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("CONVEX_") || key.startsWith("GAMES_")) delete env[key];
  return {
    dir,
    run: (args = [], overrides = {}) =>
      spawnSync(process.execPath, ["scripts/setup.mjs", ...args], {
        cwd: dir,
        env: { ...env, ...overrides },
        encoding: "utf8",
      }),
    remote: () => JSON.parse(readFileSync(join(dir, "remote.json"), "utf8")),
  };
}

test("setup provisions one isolated backend, reuses keys, and syncs local secrets without logging them", (t) => {
  const f = fixture(t);
  let result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const remote = f.remote();
  const local = parseEnv(readFileSync(join(f.dir, ".env.local"), "utf8"));
  const vars = parseEnv(
    readFileSync(join(f.dir, "services/grams/.dev.vars.development"), "utf8"),
  );
  assert.equal(vars.GRAMS_REALTIME_SECRET, remote.env.GRAMS_REALTIME_SECRET);
  assert.equal(vars.CONVEX_URL, local.VITE_CONVEX_URL);
  assert.equal(vars.ALLOWED_ORIGINS, local.GAMES_WEB_ORIGIN);
  assert.equal(
    remote.env.GAMES_DEV_SITE_URL,
    "https://isolated-test-1.convex.site",
  );
  assert.equal(local.VITE_DEV_AUTH, "1");
  assert.equal(
    statSync(join(f.dir, "services/grams/.dev.vars.development")).mode & 0o777,
    0o600,
  );
  for (const name of ["AUTH_PRIVATE_KEY", "GRAMS_REALTIME_SECRET"])
    assert.ok(!(result.stdout + result.stderr).includes(remote.env[name]));
  writeFileSync(
    join(f.dir, "services/grams/.dev.vars.development"),
    "UNRELATED=value\n",
  );
  result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.remote().creates, 1);
  assert.deepEqual(f.remote().env, remote.env);
  assert.match(
    readFileSync(join(f.dir, "services/grams/.dev.vars.development"), "utf8"),
    /UNRELATED=value/,
  );
});

test("--new selects a fresh backend and secret while keeping the checkout URL stable", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const before = f.remote();
  const result = f.run(["--new"]);
  assert.equal(result.status, 0, result.stderr);
  const after = f.remote();
  assert.equal(after.creates, 2);
  assert.notEqual(
    after.env.GRAMS_REALTIME_SECRET,
    before.env.GRAMS_REALTIME_SECRET,
  );
  assert.notEqual(after.env.AUTH_PRIVATE_KEY, before.env.AUTH_PRIVATE_KEY);
  assert.equal(after.env.GAMES_DEV_WEB_ORIGIN, before.env.GAMES_DEV_WEB_ORIGIN);
});

test("setup rejects production credentials and changed deployment selection before writes", (t) => {
  const f = fixture(t);
  const blocked = f.run([], { CONVEX_DEPLOY_KEY: "production-secret" });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Unset CONVEX_DEPLOY_KEY/);
  assert.ok(!blocked.stderr.includes("production-secret"));
  assert.equal(f.run().status, 0);
  writeFileSync(
    join(f.dir, ".env.local"),
    "CONVEX_DEPLOYMENT=prod:production\nVITE_CONVEX_URL=https://production.convex.cloud\n",
  );
  assert.notEqual(f.run().status, 0);
  assert.equal(f.remote().creates, 1);
});
