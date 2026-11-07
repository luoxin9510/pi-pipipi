#!/usr/bin/env node
// Scripted stand-in for the pi binary.
// FAKE_PI_SCENARIO: path to JSON { lines: string[] (raw stdout lines), exitCode?, stderr?, delayMs?, hang?, sessionFile? }
// FAKE_PI_RECORD: path where argv, PIPIPI_DEPTH and the system prompt text are written as JSON.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const scenario = JSON.parse(readFileSync(process.env.FAKE_PI_SCENARIO, "utf8"));
const sp = argv.indexOf("--system-prompt");
const promptArg = argv[argv.length - 1];
writeFileSync(
  process.env.FAKE_PI_RECORD,
  JSON.stringify({
    argv,
    depth: process.env.PIPIPI_DEPTH,
    // With stdin closed this reads EOF at once; an open pipe would block the run (and fail the test by timeout).
    stdin: readFileSync(0, "utf8"),
    cwd: process.cwd(),
    systemPrompt: sp === -1 ? undefined : readFileSync(argv[sp + 1], "utf8"),
    promptFile: promptArg.startsWith("@") ? readFileSync(promptArg.slice(1), "utf8") : undefined,
  }),
);
if (scenario.sessionFile) {
  mkdirSync(dirname(scenario.sessionFile), { recursive: true });
  writeFileSync(scenario.sessionFile, "");
}
if (scenario.stderr) process.stderr.write(scenario.stderr);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const line of scenario.lines) {
  process.stdout.write(line + "\n");
  if (scenario.delayMs) await sleep(scenario.delayMs);
}
if (scenario.hang) setInterval(() => {}, 1000);
else process.exitCode = scenario.exitCode ?? 0;
