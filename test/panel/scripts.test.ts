// Script rows and ctrl+b in the panel, against the real registries (no pi, no model). The script registry's move and
// stop callbacks are recorded stand-ins for the codemode wrapper.
import assert from "node:assert/strict";
import { test } from "node:test";
import { scripts } from "../../src/background.ts";
import { Panel } from "../../src/panel.ts";
import { registry } from "../../src/registry.ts";

const theme: any = { fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => `[sel]${s}` };
const KEY = { down: "\x1b[B", up: "\x1b[A", ctrlB: "\x02" };
const parent = (sessionId: string) => ({ thinking: "off", cwd: "/tmp", trusted: true, sessionId });

function setup(sessionId: string, lingerMs = 30_000) {
  const opened: string[] = [];
  const panel = new Panel(sessionId, theme, () => {}, (r) => opened.push(r.id), { lingerMs, viewable: true });
  const calls = { moved: [] as string[], stopped: [] as string[] };
  const script = (callId: string) => {
    const s = scripts.start(callId, sessionId, () => (calls.moved.push(callId), scripts.setState(s, "background")), async () => void calls.stopped.push(callId));
    return s;
  };
  const agent = (id: string, description: string, callId?: string) => {
    registry.begin(parent(sessionId), { id, type: "Explore", description, model: "m", thinking: "off" });
    if (callId) scripts.addAgent(`${callId}/1`, id);
  };
  return { panel, calls, script, agent, opened };
}

test("a script row shows id, state, agents running, elapsed and summed cost, with its agents indented below; loose agents stay top-level", () => {
  const { panel, script, agent } = setup("s1");
  agent("s1-loose", "loose");
  const s = script("c1");
  agent("s1-a", "first", "c1");
  agent("s1-b", "second", "c1");
  registry.finish("s1-b", "completed");
  const lines = panel.render(120);
  const row = lines.find((l) => l.includes("script " + s.id))!;
  assert.match(row, /^ {2}● foreground · script S\d+ · 1 agents running · \d+s · \$0\.0000$/);
  const at = (text: string) => lines.findIndex((l) => l.includes(text));
  assert.match(lines[at("Explore(first)")]!, /^ {4}● running/, "agents of a script are indented");
  assert.match(lines[at("Explore(second)")]!, /^ {4}✓ completed/);
  assert.ok(at("script") < at("Explore(first)") && at("Explore(first)") < at("Explore(second)"));
  assert.match(lines[at("Explore(loose)")]!, /^ {2}● running/, "an agent in no script is not indented");
  assert.match(lines[0]!, /Subagents \(3\) · Scripts \(1\)/);
  panel.dispose();
});

test("script rows linger like agent rows, are marked failed / stopped, and the panel hides when all are gone", async () => {
  const { panel, script } = setup("s2", 150);
  const failed = script("c2");
  const stopped = script("c3");
  const running = script("c4");
  scripts.setState(failed, "failed");
  scripts.setState(stopped, "stopped");
  let text = panel.render(120).join("\n");
  assert.match(text, new RegExp(`✗ failed · script ${failed.id}`));
  assert.match(text, new RegExp(`■ stopped · script ${stopped.id}`));
  await new Promise((r) => setTimeout(r, 300));
  text = panel.render(120).join("\n");
  assert.ok(!text.includes(`script ${failed.id}`) && !text.includes(`script ${stopped.id}`), text);
  assert.ok(text.includes(`script ${running.id}`), "a running script stays");
  scripts.setState(running, "completed");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(panel.render(120), []);
  panel.dispose();
});

test("selection moves over script and agent rows; x on a script row stops the script, on an agent row only that agent; enter opens agents only", () => {
  const { panel, calls, script, agent, opened } = setup("s3");
  const s = script("c5");
  agent("s3-a", "first", "c5");
  panel.handleKey(KEY.down, true); // focus: the script row
  assert.ok(panel.render(120).some((l) => l.startsWith("[sel]▸") && l.includes(`script ${s.id}`)));
  assert.equal(panel.handleKey("\r", true), true);
  assert.deepEqual(opened, [], "a script has no screen");
  panel.handleKey(KEY.down, true);
  assert.ok(panel.render(120).some((l) => l.startsWith("[sel]▸") && l.includes("Explore(first)")), "the agent row is next");
  panel.handleKey("x", true);
  assert.deepEqual(calls.stopped, [], "x on an agent row does not stop the script");
  assert.equal(registry.get("s3-a")!.status, "running", "(no child handle in this test, so nothing visible happens to the agent either)");
  panel.handleKey(KEY.up, true);
  panel.handleKey("x", true);
  assert.deepEqual(calls.stopped, ["c5"], "x on the script row stops the script");
  panel.dispose();
});

test("ctrl+b: with an empty editor it backgrounds the foreground scripts and is consumed, with or without focus; otherwise it passes through", () => {
  const { panel, calls, script, agent } = setup("s4");
  assert.equal(panel.handleKey(KEY.ctrlB, true), false, "no script: cursor-left");
  const s = script("c6");
  assert.equal(panel.handleKey(KEY.ctrlB, false), false, "text in the editor: cursor-left");
  assert.deepEqual(calls.moved, []);
  assert.equal(panel.handleKey("\x1b[98;5:3u", true), false, "a key release is ignored");
  assert.deepEqual(calls.moved, []);
  assert.equal(panel.handleKey(KEY.ctrlB, true), true);
  assert.deepEqual(calls.moved, ["c6"]);
  assert.equal(s.state, "background");
  assert.equal(panel.handleKey(KEY.ctrlB, true), false, "nothing in the foreground any more");

  const t = script("c7");
  agent("s4-a", "x", "c7");
  panel.handleKey(KEY.down, true);
  assert.equal(panel.hasFocus(), true);
  assert.equal(panel.handleKey(KEY.ctrlB, true), true, "works while the panel has focus");
  assert.deepEqual(calls.moved, ["c6", "c7"]);
  assert.equal(panel.hasFocus(), true, "and keeps the focus");
  assert.equal(t.state, "background");
  panel.dispose();
});
