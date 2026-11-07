// Ticket 06: run outcomes: partial, failed, abort, long prompts.
import assert from "node:assert/strict";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { agentFile, ev, happyLines, loadTool, sandbox, usage } from "./helpers.ts";

test("10: completed run: output is the last assistant text, usage summed, turns counted", async () => {
  const s = sandbox();
  s.scenario({
    lines: [
      ev.session(),
      ev.user("go"),
      ev.assistant("looking", usage(100, 10, 0.5)),
      ev.tool("grep"),
      ev.turnEnd(),
      ev.assistant("", usage(50, 5, 0.25)), // tool-only message keeps the earlier text
      ev.tool("read"),
      ev.turnEnd(),
      ev.assistant("final answer", usage(10, 20, 0.25)),
      ev.turnEnd(),
      ev.settled(),
    ],
  });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({})).structuredContent;
  assert.equal(r.status, "completed");
  assert.equal(r.output, "final answer");
  assert.equal(r.turns, 3);
  assert.equal(r.usage.input, 160);
  assert.equal(r.usage.output, 35);
  assert.equal(r.usage.cost.total, 1);
  assert.deepEqual(t.updates, ["test task: turn 1, grep", "test task: turn 2, read", "test task: turn 3, read"]);
});

test("11: maxTurns stops the child and returns partial", async () => {
  const s = sandbox();
  s.write(join(s.repo, ".pi/agents/short.md"), agentFile("name: short\ndescription: d\nmaxTurns: 2"));
  const turn = (n: number) => [ev.assistant(`turn ${n}`), ev.turnEnd()];
  s.scenario({ lines: [ev.session(), ...turn(1), ...turn(2), ...turn(3), ...turn(4)], delayMs: 50, hang: true });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({ subagent_type: "short" })).structuredContent;
  assert.equal(r.status, "partial");
  assert.equal(r.turns, 2);
  assert.equal(r.output, "turn 2");
});

test("maxTurns reached on the last turn of a run that settles on its own is completed", async () => {
  const s = sandbox();
  s.write(join(s.repo, ".pi/agents/one.md"), agentFile("name: one\ndescription: d\nmaxTurns: 1"));
  s.scenario({ lines: happyLines("single turn") });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({ subagent_type: "one" })).structuredContent;
  assert.equal(r.status, "completed");
  assert.equal(r.output, "single turn");
  assert.equal(r.turns, 1);
});

test("after maxTurns, output of further turns is ignored when the run still settles", async () => {
  const s = sandbox();
  s.write(join(s.repo, ".pi/agents/one.md"), agentFile("name: one\ndescription: d\nmaxTurns: 1"));
  s.scenario({ lines: [ev.session(), ev.assistant("turn 1", usage(10, 5, 0.01)), ev.turnEnd(), ev.assistant("turn 2", usage(20, 5, 0.02)), ev.turnEnd(), ev.settled()] });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({ subagent_type: "one" })).structuredContent;
  assert.equal(r.output, "turn 1");
  assert.equal(r.turns, 1);
  assert.equal(r.usage.input, 30, "the cost of turns past the limit still counts");
});

test("maxTurns reached on a turn that called tools is partial, even if the next turn settles quickly", async () => {
  const s = sandbox();
  s.write(join(s.repo, ".pi/agents/one.md"), agentFile("name: one\ndescription: d\nmaxTurns: 1"));
  s.scenario({
    lines: [
      ev.session(),
      ev.assistant("reading a.txt", usage(10, 5, 0.01), { stopReason: "toolUse" }),
      ev.tool("read"),
      ev.turnEnd(),
      ev.assistant("turn 2", usage(20, 5, 0.02)),
      ev.turnEnd(),
      ev.settled(),
    ],
  });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({ subagent_type: "one" })).structuredContent;
  assert.equal(r.status, "partial");
  assert.equal(r.turns, 1);
  assert.equal(r.output, "reading a.txt");
});

test("12: provider error, non-zero exit, garbage line, missing session header -> failed with error", async () => {
  const s = sandbox();
  const t = await loadTool({}, { cwd: s.repo });
  const cases: [Parameters<typeof s.scenario>[0], RegExp][] = [
    [{ lines: [ev.session(), ev.assistant("", usage(1, 0, 0), { stopReason: "error", errorMessage: "529 overloaded" }), ev.turnEnd(), ev.settled()] }, /^529 overloaded$/],
    [{ lines: [ev.session()], exitCode: 2, stderr: "line a\nboom: no API key\n" }, /boom: no API key/],
    [{ lines: [ev.session()], exitCode: 3 }, /pi exited with code 3/],
    [{ lines: [ev.session(), "not json at all", ...happyLines().slice(1)] }, /invalid JSON from pi: not json at all/],
    [{ lines: [ev.assistant("hi"), ev.settled()] }, /did not start with a session header/],
    [{ lines: [ev.session(), ev.assistant("hi")] }, /exited before the run settled/],
  ];
  for (const [scenario, error] of cases) {
    s.scenario(scenario);
    const res = await t.run({});
    assert.equal(res.isError, true);
    assert.equal(res.structuredContent.status, "failed");
    assert.match(res.structuredContent.error, error);
  }
});

test("12a: agent_settled with aborted: true -> failed with a clear error", async () => {
  const s = sandbox();
  s.scenario({ lines: [ev.session(), ev.assistant("hi"), ev.turnEnd(), JSON.stringify({ type: "agent_settled", aborted: true })] });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({})).structuredContent;
  assert.equal(r.status, "failed");
  assert.equal(r.error, "child run was aborted");
});

test("12b: a missing pi binary fails the run", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({ piCommand: join(s.root, "no-such-pi") }, { cwd: s.repo });
  const r = (await t.run({})).structuredContent;
  assert.equal(r.status, "failed");
  assert.match(r.error, /could not start/);
});

test("13: U+2028 inside a JSON string does not split a record", async () => {
  const s = sandbox();
  const text = "line one line two end";
  s.scenario({ lines: [ev.session(), ev.assistant(text), ev.turnEnd(), ev.settled()] });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({})).structuredContent;
  assert.equal(r.status, "completed");
  assert.equal(r.output, text);
});

test("14: abort kills the child and throws", async () => {
  const s = sandbox();
  s.scenario({ lines: [ev.session(), ev.assistant("working"), ev.turnEnd()], hang: true });
  const t = await loadTool({}, { cwd: s.repo });
  const ac = new AbortController();
  const started = Date.now();
  setTimeout(() => ac.abort(), 300);
  await assert.rejects(t.run({}, ac.signal), /aborted/);
  assert.ok(Date.now() - started < 3000, "the child was stopped promptly");
});

test("a prompt over 100 KB reaches the child through a file; a leading dash is not a flag", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  const prompt = "x".repeat(150_000);
  await t.run({ prompt });
  const rec = s.record();
  assert.match(rec.argv.at(-1)!, /^@.*prompt\.md$/);
  assert.equal(rec.promptFile, prompt);
  await t.run({ prompt: "-starts with a dash" });
  assert.deepEqual(s.record().argv.slice(-2), ["--", "-starts with a dash"]);
});

test("auto-retry: the outcome of the LAST assistant message decides, an earlier provider error is cleared", async () => {
  const s = sandbox();
  const retry = (type: string, extra: Record<string, unknown> = {}) => JSON.stringify({ type, ...extra });
  s.scenario({
    lines: [
      ev.session(),
      ev.assistant("", usage(1, 0, 0), { stopReason: "error", errorMessage: "529 overloaded" }),
      ev.turnEnd(),
      retry("agent_end", { willRetry: true }),
      retry("auto_retry_start", { attempt: 1 }),
      ev.assistant("the real answer"),
      ev.turnEnd(),
      retry("auto_retry_end", { success: true }),
      ev.settled(),
    ],
  });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({})).structuredContent;
  assert.equal(r.status, "completed");
  assert.equal(r.output, "the real answer");
  assert.equal(r.error, undefined);
});

test("a prompt starting with @ is prefixed with a newline so pi reads it as text", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  await t.run({ prompt: "@alice summarize this" });
  const rec = s.record();
  assert.equal(rec.argv.at(-1), "\n@alice summarize this");
  assert.equal(rec.promptFile, undefined);
});

const failedTurn = [
  ev.assistant("", usage(1, 0, 0), { stopReason: "error", errorMessage: "529 overloaded" }),
  ev.turnEnd({ role: "assistant", stopReason: "error" }),
  JSON.stringify({ type: "agent_end", messages: [], willRetry: true }),
  JSON.stringify({ type: "auto_retry_start", attempt: 1 }),
  ev.assistant("recovered"),
  ev.turnEnd({ role: "assistant", stopReason: "stop" }),
  JSON.stringify({ type: "auto_retry_end", success: true }),
  ev.settled(),
];

test("a turn that ended in a provider error does not count toward maxTurns", async () => {
  const s = sandbox();
  s.write(join(s.repo, ".pi/agents/one.md"), agentFile("name: one\ndescription: d\nmaxTurns: 1"));
  s.scenario({ lines: [ev.session(), ...failedTurn] });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({ subagent_type: "one" })).structuredContent;
  assert.equal(r.status, "completed");
  assert.equal(r.output, "recovered");
  assert.equal(r.turns, 1);
});

test("a turn that ended in a provider error is not counted in turns", async () => {
  const s = sandbox();
  s.scenario({ lines: [ev.session(), ...failedTurn] });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({})).structuredContent;
  assert.equal(r.status, "completed");
  assert.equal(r.turns, 1);
});

test("a child that settles but never exits is stopped after a grace period and the run completes", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines("all done"), hang: true });
  const t = await loadTool({}, { cwd: s.repo });
  const started = Date.now();
  const r = (await t.run({})).structuredContent;
  assert.equal(r.status, "completed");
  assert.equal(r.output, "all done");
  assert.ok(Date.now() - started < 4500, "stopped after about 2 s");
});

test("a child that settles after an error and never exits fails with the error", async () => {
  const s = sandbox();
  s.scenario({
    lines: [ev.session(), ev.assistant("", usage(1, 0, 0), { stopReason: "error", errorMessage: "bad key" }), ev.turnEnd(), ev.settled()],
    hang: true,
  });
  const t = await loadTool({}, { cwd: s.repo });
  const r = (await t.run({})).structuredContent;
  assert.equal(r.status, "failed");
  assert.equal(r.error, "bad key");
});

test("malformed records fail the run with the bad line named instead of throwing", async () => {
  const s = sandbox();
  const t = await loadTool({}, { cwd: s.repo });
  const bad = [
    "null",
    JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "x" }], stopReason: "stop" } }),
    JSON.stringify({ type: "message_end" }),
  ];
  for (const line of bad) {
    s.scenario({ lines: [ev.session(), line, ev.turnEnd(), ev.settled()], hang: true });
    const res = await t.run({});
    assert.equal(res.structuredContent.status, "failed", line);
    assert.ok(res.structuredContent.error.includes(line), `error names the line: ${res.structuredContent.error}`);
  }
});

test("a prompt that makes spawn throw synchronously fails the run and removes the temp dir", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const tmp = join(s.root, "tmp");
  mkdirSync(tmp);
  const oldTmp = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  try {
    const t = await loadTool({}, { cwd: s.repo });
    const res = await t.run({ prompt: "nul \0 byte" });
    assert.equal(res.structuredContent.status, "failed");
    assert.match(res.structuredContent.error, /could not start .*NUL|could not start .*null/i);
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    if (oldTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = oldTmp;
  }
});
