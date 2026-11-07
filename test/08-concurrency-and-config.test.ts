// Ticket 08: concurrency limit and config validation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ev, loadTool, sandbox } from "./helpers.ts";

const slowRun = { lines: [ev.session(), ev.assistant("ok"), ev.turnEnd(), ev.settled()], delayMs: 150 };

test("with maxConcurrent 2 the third call waits for a free slot", async () => {
  const s = sandbox();
  s.scenario(slowRun);
  const t = await loadTool({ maxConcurrent: 2 }, { cwd: s.repo });
  const ends: number[] = [];
  const start = Date.now();
  await Promise.all([1, 2, 3].map(() => t.run({}).then(() => ends.push(Date.now() - start))));
  ends.sort((a, b) => a - b);
  // Each run takes ~600 ms (4 lines x 150 ms). The third starts only after a slot frees up.
  assert.ok(ends[2]! - ends[0]! > 400, `third call should wait: ${ends.join(", ")}`);
});

test("a queued call that is aborted leaves the queue", async () => {
  const s = sandbox();
  s.scenario(slowRun);
  const t = await loadTool({ maxConcurrent: 1 }, { cwd: s.repo });
  const ac = new AbortController();
  const first = t.run({});
  const queued = t.run({}, ac.signal);
  const third = t.run({});
  ac.abort();
  await assert.rejects(queued, /aborted/);
  await first;
  // If the aborted call kept its place in the queue, it would take the freed slot and never release it,
  // and the third call would wait forever.
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("third call never got a slot")), 3000));
  assert.equal((await Promise.race([third, timeout]) as any).structuredContent.status, "completed");
});

test("wrong config types throw naming the key", async () => {
  const s = sandbox();
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ maxConcurrent: "lots" }, /pipipi\.maxConcurrent must be a positive integer/],
    [{ maxConcurrent: 0 }, /pipipi\.maxConcurrent must be a positive integer/],
    [{ models: { opus: 5 } }, /pipipi\.models\.opus must be a string/],
    [{ models: ["x"] }, /pipipi\.models must be an object of strings/],
    [{ toolMap: { WebFetch: false } }, /pipipi\.toolMap\.WebFetch must be a string/],
    [{ defaultModel: "" }, /pipipi\.defaultModel must be a non-empty string/],
    [{ piCommand: 3 }, /pipipi\.piCommand must be a non-empty string/],
  ];
  for (const [settings, error] of cases) await assert.rejects(loadTool(settings, { cwd: s.repo }), error);
});
