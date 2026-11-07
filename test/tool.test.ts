import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { agentFile, ev, happyLines, loadTool, sandbox } from "./helpers.ts";

const flag = (args: string[], name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

test("15: end-to-end execute through fake pi returns the AgentResult shape", async () => {
  const s = sandbox();
  s.write(join(s.repo, ".claude/agents/scout.md"), agentFile("name: scout\ndescription: Finds things\ntools: Read, WebFetch\ncolor: red", "Scout prompt."));
  s.scenario({ lines: happyLines("found it") });
  const t = await loadTool({ models: { haiku: "anthropic/claude-haiku-5-5" } }, { cwd: s.repo });

  assert.equal(t.tool.exposure, "codemode");
  assert.match(t.tool.description, /- scout: Finds things/);
  assert.match(t.tool.description, /- Explore: /);
  assert.ok(t.notes.some((n) => /scout: field "color" has no effect/.test(n)), "warnings shown at session start");

  const res = await t.run({ subagent_type: "scout", model: "haiku", prompt: "-starts with a dash", run_in_background: true });
  const r = res.structuredContent;
  assert.deepEqual(Object.keys(r).sort(), ["agentId", "agentType", "durationMs", "model", "output", "status", "turns", "usage", "warnings"]);
  assert.equal(r.status, "completed");
  assert.equal(r.agentType, "scout");
  assert.equal(r.output, "found it");
  assert.equal(r.model, "anthropic/claude-haiku-5-5");
  assert.deepEqual(r.warnings, [
    'tool "WebFetch" has no pi equivalent',
    '"run_in_background" is not supported and was ignored',
    'field "color" has no effect in pi-pipipi',
  ]);
  assert.deepEqual(res.usage, r.usage);
  assert.deepEqual(res.details, r);
  assert.equal(res.isError, false);
  assert.match(res.content[0].text, /^scout completed \(agentId [a-z0-9]{12}, 1 turns/);

  const rec = s.record();
  assert.equal(rec.depth, "1");
  assert.equal(rec.cwd, realpathSync(s.repo));
  assert.match(rec.systemPrompt!, /^Scout prompt\.\n\n# Environment/);
  assert.deepEqual(rec.argv.slice(-2), ["--", "-starts with a dash"]);
  assert.equal(flag(rec.argv, "--model"), "anthropic/claude-haiku-5-5");
  assert.equal(flag(rec.argv, "--tools"), "read");
});

test("15b: default agent is general-purpose; unknown subagent_type throws with the list", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  assert.equal((await t.run({})).structuredContent.agentType, "general-purpose");
  await assert.rejects(t.run({ subagent_type: "nope" }), /unknown subagent_type "nope"\. Available: .*Explore/);
});

test("15c: a long prompt goes through a file", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  const prompt = "x".repeat(150_000);
  await t.run({ prompt });
  const rec = s.record();
  assert.match(rec.argv.at(-1)!, /^@.*prompt\.md$/);
  assert.equal(rec.promptFile, prompt);
});

test("16: resume reuses the agentId and session flags; unknown agentId throws", async () => {
  const s = sandbox();
  const parentFile = join(s.root, "sessions", "2026-11-07_parent-id.jsonl");
  const t = await loadTool({}, { cwd: s.repo, sessionFile: parentFile, sessionId: "parent-id" });
  const dir = join(s.root, "sessions", "subagents", "parent-id");

  s.scenario({ lines: happyLines("first") });
  const first = (await t.run({})).structuredContent;
  const firstArgs = s.record().argv;
  assert.equal(flag(firstArgs, "--session-dir"), dir);
  assert.equal(flag(firstArgs, "--session-id"), first.agentId);

  // Pi writes <timestamp>_<id>.jsonl into the session dir; the fake does it here.
  s.write(join(dir, `2026-11-07T00-00-00-000Z_${first.agentId}.jsonl`), "");
  s.scenario({ lines: happyLines("second") });
  const second = (await t.run({ resume: first.agentId })).structuredContent;
  assert.equal(second.agentId, first.agentId);
  assert.equal(second.output, "second");
  assert.equal(flag(s.record().argv, "--session-id"), first.agentId);

  await assert.rejects(t.run({ resume: "unknownid123" }), /no subagent session "unknownid123"/);
  await assert.rejects(t.run({ resume: "../evil" }), /invalid resume id/);

  const memory = await loadTool({}, { cwd: s.repo });
  await assert.rejects(memory.run({ resume: first.agentId }), /resume needs a persisted parent session/);
});

test("17: concurrency: with maxConcurrent 2 the third call waits", async () => {
  const s = sandbox();
  s.scenario({ lines: [ev.session(), ev.assistant("ok"), ev.turnEnd(), ev.settled()], delayMs: 150 });
  const t = await loadTool({ maxConcurrent: 2 }, { cwd: s.repo });
  const ends: number[] = [];
  const start = Date.now();
  await Promise.all([1, 2, 3].map(() => t.run({}).then(() => ends.push(Date.now() - start))));
  ends.sort((a, b) => a - b);
  // Each run takes ~600 ms (4 lines x 150 ms). The third starts only after a slot frees up.
  assert.ok(ends[2]! - ends[0]! > 400, `third call should wait: ${ends.join(", ")}`);
});

test("18: PIPIPI_DEPTH=1 -> Agent is not registered", async () => {
  const s = sandbox();
  process.env.PIPIPI_DEPTH = "1";
  try {
    const t = await loadTool({}, { cwd: s.repo });
    assert.equal(t.registered, false);
  } finally {
    delete process.env.PIPIPI_DEPTH;
  }
});

test("config errors name the bad key", async () => {
  const s = sandbox();
  await assert.rejects(loadTool({ maxConcurrent: "lots" }, { cwd: s.repo }), /pipipi\.maxConcurrent must be a positive integer/);
  await assert.rejects(loadTool({ models: { opus: 5 } }, { cwd: s.repo }), /pipipi\.models\.opus must be a string/);
});
