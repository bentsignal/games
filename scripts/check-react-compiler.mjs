import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { build, loadConfigFromFile } from "vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";

// Use Vite's production pipeline and the installed compiler, not a separate linter's compiler.
const { config } = await loadConfigFromFile({
  command: "build",
  mode: "production",
});
const errors = new Map();
const successes = new Set();
config.plugins = config.plugins.slice(0, -1);
config.plugins.push(
  babel({
    presets: [
      reactCompilerPreset({
        logger: {
          logEvent(filename, event) {
            const file = relative(process.cwd(), filename).replaceAll(
              "\\",
              "/",
            );
            if (!file.startsWith("src/")) return;
            if (event.kind === "CompileSuccess")
              successes.add(`${file}:${event.fnName}`);
            if (
              event.kind === "CompileSkip" ||
              event.kind === "PipelineError"
            ) {
              const reason =
                event.kind === "CompileSkip" ? event.reason : event.data;
              const key = `${file}: ${event.kind}: ${reason}`;
              errors.set(key, (errors.get(key) ?? 0) + 1);
              console.log(`${file}:${event.fnLoc?.start.line}: ${reason}`);
            }
            if (event.kind === "CompileError") {
              const detail = event.detail.options;
              const key = `${file}: ${detail.reason}`;
              errors.set(key, (errors.get(key) ?? 0) + 1);
              console.log(
                `${file}:${event.fnLoc?.start.line}: ${detail.reason}`,
              );
              if (process.env.COMPILER_DETAILS) console.log(detail.description);
            }
          },
        },
      }),
    ],
  }),
);
await build({ ...config, configFile: false, build: { write: false } });
const baseline = JSON.parse(
  readFileSync(
    new URL("./react-compiler-baseline.json", import.meta.url),
    "utf8",
  ),
);
const required = [
  "src/App.tsx:App",
  "src/components/Board.tsx:Board",
  "src/components/CardDragGhost.tsx:CardDragGhost",
  "src/components/TicketChat.tsx:TicketChat",
  "src/game/useTicketRoom.ts:useTicketRoom",
];
let failed = false;
for (const [key, count] of errors) {
  if (count > (baseline[key] ?? 0)) {
    console.error(
      `New compiler skips: ${key} (${count}, allowed ${baseline[key] ?? 0})`,
    );
    failed = true;
  }
}
for (const key of required) {
  if (!successes.has(key)) {
    console.error(`Required optimization missing: ${key}`);
    failed = true;
  }
}
console.log(
  `${successes.size} functions optimized; ${errors.size} skip categories. Critical Ticket components must compile.`,
);
if (failed) process.exitCode = 1;
