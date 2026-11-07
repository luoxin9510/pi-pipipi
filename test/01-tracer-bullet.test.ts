// Ticket 01: run the built-in general-purpose agent end to end.
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { test } from "node:test";
import { ev, happyLines, loadTool, sandbox, usage } from "./helpers.ts";

test("the Agent tool is codemode-only and declares an output schema", async () => {
  const s = sandbox();
  const t = await loadTool({}, { cwd: s.repo });
  assert.equal(t.tool.name, "Agent");
  assert.equal(t.tool.exposure, "codemode");
  assert.equal(t.tool.outputSchema.type, "object");
  assert.ok(t.tool.outputSchema.properties.agentId);
});

test("a default call runs general-purpose and returns a completed AgentResult", async () => {
  const s = sandbox();
  s.scenario({
    lines: [
      ev.session(),
      ev.user("go"),
      ev.assistant("looking", usage(100, 10, 0.5)),
      ev.tool("grep"),
      ev.turnEnd(),
      ev.assistant("", usage(50, 5, 0.25)), // a tool-only message keeps the earlier text
      ev.tool("read"),
      ev.turnEnd(),
      ev.assistant("final answer", usage(10, 20, 0.25)),
      ev.turnEnd(),
      ev.settled(),
    ],
  });
  const t = await loadTool({}, { cwd: s.repo });
  const res = await t.run({});
  const r = res.structuredContent;

  assert.deepEqual(Object.keys(r).sort(), ["agentId", "agentType", "durationMs", "model", "output", "status", "turns", "usage", "warnings"]);
  assert.equal(r.status, "completed");
  assert.equal(r.agentType, "general-purpose");
  assert.match(r.agentId, /^[a-z0-9]{12}$/);
  assert.equal(r.output, "final answer");
  assert.equal(r.turns, 3);
  assert.equal(r.usage.input, 160);
  assert.equal(r.usage.output, 35);
  assert.equal(r.usage.cost.total, 1);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(res.usage, r.usage, "usage is reported to pi for session totals");
  assert.deepEqual(res.details, r);
  assert.equal(res.isError, false);
  assert.match(res.content[0].text, /^general-purpose completed \(agentId [a-z0-9]{12}, 3 turns, [\d.]+s\)\n\nfinal answer$/);
  assert.deepEqual(t.updates, ["test task: turn 1, grep", "test task: turn 2, read", "test task: turn 3, read"]);
});

test("the child gets PIPIPI_DEPTH=1, the parent's cwd, closed stdin, JSON print mode", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  await t.run({ prompt: "the task" });
  const rec = s.record();
  assert.equal(rec.depth, "1");
  assert.equal(rec.cwd, realpathSync(s.repo));
  assert.equal(rec.stdin, "");
  assert.deepEqual(rec.argv.slice(0, 3), ["--mode", "json", "-p"]);
  assert.deepEqual(rec.argv.slice(-2), ["--", "the task"]);
});

test("with PIPIPI_DEPTH set the extension registers nothing", async () => {
  const s = sandbox();
  process.env.PIPIPI_DEPTH = "1";
  try {
    const t = await loadTool({}, { cwd: s.repo });
    assert.equal(t.registered, false);
  } finally {
    delete process.env.PIPIPI_DEPTH;
  }
});
