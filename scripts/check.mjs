import { spawn } from "node:child_process";

const commands = [
  "typecheck",
  "lint",
  "format:check",
  "test",
  "grams:test",
  "build",
];
const children = new Set();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
    process.exitCode = signal === "SIGINT" ? 130 : 143;
  });

const results = await Promise.all(
  commands.map(
    (command) =>
      new Promise((resolve) => {
        // Use the same pnpm entry point that started this script, including on Windows.
        const child = spawn(
          process.execPath,
          [process.env.npm_execpath, "run", command],
          {
            stdio: "inherit",
            cwd: new URL("../", import.meta.url),
          },
        );
        children.add(child);
        child.on("error", () => resolve({ command, passed: false }));
        child.on("exit", (code) => {
          children.delete(child);
          resolve({ command, passed: code === 0 });
        });
      }),
  ),
);
for (const { command, passed } of results)
  console.log(`${passed ? "PASS" : "FAIL"} ${command}`);
if (results.some((result) => !result.passed)) process.exitCode = 1;
