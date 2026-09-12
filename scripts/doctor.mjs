import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { localConfig, bin } from "./dev-config.mjs";

export function doctor() {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Node 24 or newer is required. See .nvmrc.");
  const runtime = spawnSync(bin("workerd"), ["--version"], {
    encoding: "utf8",
  });
  if (runtime.error || runtime.status !== 0)
    throw new Error(
      "Cloudflare workerd cannot start. On NixOS, enable programs.nix-ld (see docs/development.md); otherwise run pnpm install --frozen-lockfile.",
    );
  const config = localConfig();
  console.log(
    `Local configuration OK: ${config.deployment}. Cloudflare runtime OK.`,
  );
  return config;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    doctor();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
