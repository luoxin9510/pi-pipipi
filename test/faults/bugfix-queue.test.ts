// Review fixes B1-B3: delivery options, queued detached agents are stoppable, handler exceptions never escape.
import assert from "node:assert/strict";
import { test } from "node:test";
import { installBackground } from "../../src/background.ts";
import { agentTool } from "../../src/agent-tool.ts";
import { registry } from "../../src/registry.ts";
import { stopEverything } from "../../src/stop-all.ts";
import { readConfig } from "../../src/config.ts";
import { ev, FAKE_PI, happyLines, loadTool, sandbox, usage } from "../helpers.ts";

const until = async (what: string, pred: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};
const cfg = { maxConcurrent: 1 }; // the first loadTool of the process fixes the limit
const hang = () => ({ lines: [ev.session(), ev.assistant("t1", usage(10, 5, 0.01), { stopReason: "toolUse" }), ev.tool("read")], hang: true, abortSettles: true });
const detach = (t: any, id: string) => t.tool.execute(id, { description: "d", prompt: "p", run_in_background: true }, undefined, undefined, t.ctx).then((r: any) => r.structuredContent);

test("B1: a detached agent's result is always sent with triggerTurn and deliverAs steer, idle or not", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines(), delayMs: 50 });
  const t = await loadTool(cfg, { cwd: s.repo, sessionId: "b1" });
  await detach(t, "b1a/1");
  await until("message", () => t.messages.length === 1);
  assert.deepEqual(t.messages[0].options, { triggerTurn: true, deliverAs: "steer" });
  t.ctx.isIdle = () => false; // main is running or compacting
  await detach(t, "b1b/1");
  await until("second message", () => t.messages.length === 2);
  assert.deepEqual(t.messages[1].options, { triggerTurn: true, deliverAs: "steer" });
});

test("B2: a queued detached agent is stopped by registry.stopAll, never starts; stopEverything and shutdown too", async () => {
  const s = sandbox();
  s.scenario(hang());
  const t = await loadTool(cfg, { cwd: s.repo, sessionId: "b2" });
  const a = await detach(t, "b2a/1");
  await until("a running", () => registry.handle(a.agentId) !== undefined);
  const b = await detach(t, "b2b/1"); // waits for the only slot
  await registry.stopAll([b.agentId]);
  await until("b's end message", () => t.messages.length === 1);
  assert.match(t.messages[0].message.content, new RegExp(`Background agent ${b.agentId} general-purpose stopped`));
  assert.equal(registry.get(b.agentId), undefined, "b never started");
  assert.equal(registry.get(a.agentId)!.status, "running");

  const c = await detach(t, "b2c/1");
  const r = await stopEverything("b2");
  assert.equal(r.agents, 1);
  await until("a stopped", () => registry.get(a.agentId)!.status === "stopped");
  await until("c's message", () => t.messages.length === 3);
  assert.equal(registry.get(c.agentId), undefined, "c never started");

  // shutdown with a queued one
  s.scenario(hang());
  const d = await detach(t, "b2d/1");
  await until("d running", () => registry.handle(d.agentId) !== undefined);
  const e = await detach(t, "b2e/1");
  const before = t.messages.length;
  await t.emit("session_shutdown", { reason: "reload" });
  await until("d stopped", () => registry.get(d.agentId)!.status === "stopped");
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(registry.get(e.agentId), undefined, "e never started");
  assert.equal(t.messages.length, before, "main hears nothing on shutdown");
});

test("B3: an exception inside a delivery handler does not become an unhandled rejection", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const rejections: unknown[] = [];
  const onRej = (e: unknown) => rejections.push(e);
  process.on("unhandledRejection", onRej);
  const logged: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  try {
    // background script end
    let tool: any;
    installBackground({ registerTool: (d: any) => (tool = d) } as any, () => { throw new Error("deliver boom"); }, () => true, (pi) =>
      pi.registerTool({ name: "codemode", async execute(_id: string, p: any) { await p.go(); return { content: [{ type: "text", text: "ok" }] }; } } as any));
    const t = await loadTool(cfg, { cwd: s.repo, sessionId: "b3" });
    await tool.execute("b3s", { go: () => t.tool.execute("b3s/1", { description: "d", prompt: "p" }, undefined, undefined, t.ctx) }, undefined, undefined, t.ctx);
    // detached agent end
    const tt = agentTool(() => readConfig({ maxConcurrent: 1, piCommand: FAKE_PI }), "d", () => { throw new Error("deliver boom 2"); });
    await tt.execute("b3d/1", { description: "d", prompt: "p", run_in_background: true } as any, undefined, undefined, t.ctx as any);
    await until("both logged", () => logged.filter((l) => l.includes("deliver boom")).length >= 2);
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(rejections, []);
  } finally {
    console.error = orig;
    process.off("unhandledRejection", onRej);
  }
});
