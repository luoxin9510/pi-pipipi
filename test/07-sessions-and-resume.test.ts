// Ticket 07: child sessions and resume.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { flag, happyLines, loadTool, sandbox } from "./helpers.ts";

test("first run stores the session under subagents/<parent id>/ and records the agent type", async () => {
  const s = sandbox();
  const parentFile = join(s.root, "sessions", "2026-11-07_parent-id.jsonl");
  const t = await loadTool({}, { cwd: s.repo, sessionFile: parentFile, sessionId: "parent-id" });
  const dir = join(s.root, "sessions", "subagents", "parent-id");

  s.scenario({ lines: happyLines("first") });
  const first = (await t.run({ subagent_type: "Explore" })).structuredContent;
  const argv = s.record().argv;
  assert.equal(flag(argv, "--session-dir"), dir);
  assert.equal(flag(argv, "--session-id"), first.agentId);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, `${first.agentId}.json`), "utf8")), { agentType: "Explore" });

  s.scenario({ lines: happyLines("second") });
  const second = (await t.run({ resume: first.agentId })).structuredContent;
  assert.equal(second.agentId, first.agentId);
  assert.equal(second.agentType, "Explore", "no subagent_type: the stored type");
  assert.equal(second.output, "second");
  const rec = s.record();
  assert.equal(flag(rec.argv, "--session-dir"), dir);
  assert.equal(flag(rec.argv, "--session-id"), first.agentId);
  assert.match(rec.systemPrompt!, /file search specialist/, "the Explore definition was used");

  const same = (await t.run({ resume: first.agentId, subagent_type: "Explore" })).structuredContent;
  assert.equal(same.agentType, "Explore", "naming the same type is fine");
});

test("resume errors: different type, unknown id, invalid id", async () => {
  const s = sandbox();
  const t = await loadTool({}, { cwd: s.repo, sessionFile: join(s.root, "sessions", "p.jsonl"), sessionId: "p" });
  s.scenario({ lines: happyLines() });
  const first = (await t.run({ subagent_type: "Explore" })).structuredContent;
  await assert.rejects(t.run({ resume: first.agentId, subagent_type: "Plan" }), /is a "Explore" agent/);
  await assert.rejects(t.run({ resume: "unknownid123" }), /no subagent session "unknownid123" to resume/);
  await assert.rejects(t.run({ resume: "../evil" }), /invalid resume id/);
});

test("in-memory parent: children are in memory and cannot be resumed", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({})).structuredContent;
  const argv = s.record().argv;
  assert.ok(argv.includes("--no-session"));
  assert.equal(argv.includes("--session-dir"), false);
  await assert.rejects(t.run({ resume: r.agentId }), /resume needs a persisted parent session/);
});
