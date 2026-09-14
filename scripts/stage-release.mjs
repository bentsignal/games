import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { gh, repository } from "./release-evidence.mjs";

const { values } = parseArgs({
  options: { inventory: { type: "string" }, review: { type: "string" } },
});
assert.ok(
  values.inventory && values.review,
  "Provide --inventory and --review files",
);
const inventory = JSON.parse(readFileSync(values.inventory, "utf8"));
assert.ok(
  inventory.preview && inventory.production,
  "A verified preview inventory is required",
);
assert.match(inventory.candidate, /^[a-f0-9]{40}$/);
const review = readFileSync(values.review, "utf8").trim();
assert.ok(
  review.includes(inventory.candidate) && review.includes(inventory.base),
  "Review must identify the full candidate and baseline SHAs",
);
const bundle = JSON.stringify({ inventory, review });
const digest = createHash("sha256").update(bundle).digest("hex");
const directory = dirname(resolve(values.inventory));
const file = resolve(directory, "review-bundle.json");
writeFileSync(file, bundle);
const tag = `production-${inventory.candidate}`;
// Creating a draft does not authorize deployment or publish a release.
gh([
  "release",
  "create",
  tag,
  "--repo",
  repository,
  "--draft",
  "--target",
  inventory.candidate,
  "--title",
  `Games ${inventory.candidate.slice(0, 12)}`,
  "--notes-file",
  resolve(values.review),
  file,
]);
const release = JSON.parse(
  gh([
    "release",
    "view",
    tag,
    "--repo",
    repository,
    "--json",
    "databaseId,url",
  ]),
);
const dispatch = `gh workflow run promote.yml --ref main -f release_id=${release.databaseId} -f review_sha256=${digest}`;
writeFileSync(
  resolve(directory, "promotion.json"),
  JSON.stringify(
    {
      releaseId: release.databaseId,
      digest,
      candidate: inventory.candidate,
      dispatch,
    },
    null,
    2,
  ),
);
console.log(
  `Draft prepared: ${release.url}\nReview digest: ${digest}\nAfter Shawn tests and approves this exact review:\n${dispatch}`,
);
