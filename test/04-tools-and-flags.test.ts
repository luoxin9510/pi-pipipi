// Ticket 04: tool mapping and permission flags.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { agentFile, flag, happyLines, loadTool, sandbox } from "./helpers.ts";

async function runAgent(fields: string, settings: Record<string, unknown> = {}, trusted = true, params: Record<string, unknown> = {}) {
  const s = sandbox();
  s.write(join(s.repo, ".pi/agents/x.md"), agentFile(`name: x\ndescription: d\n${fields}`));
  s.scenario({ lines: happyLines() });
  const t = await loadTool(settings, { cwd: s.repo, trusted });
  const r = (await t.run({ subagent_type: "x", ...params })).structuredContent;
  return { argv: s.record().argv, warnings: r.warnings };
}

test("Claude names map to pi names; deny first; Bash(...) removes bash; mcp and pi names pass; unmapped warns", async () => {
  const { argv, warnings } = await runAgent(
    "tools: Read, Grep, Glob, LS, Bash, WebFetch, mcp__gh__search, Agent, Task, Edit, custom_tool\ndisallowedTools: Bash(git push *), Edit",
  );
  assert.equal(flag(argv, "--tools"), "read,grep,find,ls,mcp__gh__search,custom_tool");
  assert.equal(flag(argv, "--exclude-tools"), "bash,edit");
  assert.deepEqual(warnings, ['tool "WebFetch" has no pi equivalent'], "Agent and Task are dropped silently");
});

test("toolMap from settings extends the map", async () => {
  const { argv, warnings } = await runAgent("tools: Read, WebFetch", { toolMap: { WebFetch: "mcp__fetch__fetch" } });
  assert.equal(flag(argv, "--tools"), "read,mcp__fetch__fetch");
  assert.deepEqual(warnings, []);
});

test("without tools the child gets pi's defaults minus the denied tools", async () => {
  const { argv } = await runAgent("disallowedTools: Write");
  assert.equal(argv.includes("--tools"), false);
  assert.equal(flag(argv, "--exclude-tools"), "write");
});

test("a tools list that ends up empty throws", async () => {
  await assert.rejects(runAgent("tools: Bash\ndisallowedTools: Bash"), /agent "x" has no usable tools/);
  await assert.rejects(runAgent("tools: WebFetch"), /agent "x" has no usable tools/);
});

test("omitClaudeMd and trust map to flags", async () => {
  const plain = await runAgent("");
  assert.equal(plain.argv.includes("--no-context-files"), false);
  assert.ok(plain.argv.includes("--approve"));
  const strict = await runAgent("omitClaudeMd: true", {}, false);
  assert.ok(strict.argv.includes("--no-context-files"));
  assert.ok(strict.argv.includes("--no-approve"));
  assert.equal(strict.argv.includes("--approve"), false);
});

test("run_in_background, isolation and name are ignored with warnings", async () => {
  const { warnings } = await runAgent("", {}, true, { run_in_background: true, isolation: "worktree", name: "bob" });
  assert.deepEqual(warnings, [
    '"run_in_background" is not supported and was ignored',
    '"isolation" is not supported and was ignored',
    '"name" is not supported and was ignored',
  ]);
});
