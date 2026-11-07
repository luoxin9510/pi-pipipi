// npm run stress -- [--calls 20,40] [--limit 20] [--fake [--fake-calls 200] [--fake-ms 500]]
//
// Real mode (default): each phase fires N Agent calls at once (haiku, Explore, one file read each) through one tool
// with maxConcurrent = limit. Calls past the limit queue. Reports wall time, latency, child run time, queue wait,
// failures, wrong answers, cost, and peak children / RSS / CPU sampled from `ps`.
// Fake mode: the same against test/fake-pi.mjs (no model), to measure the extension's own overhead at volume.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentResult } from "../src/agent-tool.ts";
import { directTool, fixture, ROOT } from "../evals/harness.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const fake = process.argv.includes("--fake");
const limit = Number(arg("--limit") ?? 20);
const phases = fake ? [Number(arg("--fake-calls") ?? 200)] : (arg("--calls") ?? "20,40").split(",").map(Number);
const fakeMs = Number(arg("--fake-ms") ?? 500);

const WORDS = ["apple", "brick", "cloud", "delta", "ember", "frost", "grape", "harbor", "ivory", "jungle"];
const wordFor = (i: number) => `${WORDS[i % WORDS.length]}${i}`;

// ---- process sampling: every descendant of this process ----
interface Sample {
  children: number; // direct children (one per running agent; a sample may catch one extra short-lived process)
  rssMb: number; // all descendants
  cpu: number; // %CPU summed over descendants
}
function sample(): Sample {
  const out = execFileSync("ps", ["-axo", "pid=,ppid=,rss=,%cpu=,comm="], { encoding: "utf8" });
  const rows = out
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => !(Number(f[1]) === process.pid && f[4]?.endsWith("ps"))) // the sampler itself
    .map((f) => f.slice(0, 4).map(Number));
  const kids = new Map<number, number[][]>();
  for (const r of rows) (kids.get(r[1]) ?? kids.set(r[1], []).get(r[1])!).push(r);
  let rss = 0;
  let cpu = 0;
  const walk = (pid: number) => {
    for (const r of kids.get(pid) ?? []) {
      rss += r[2];
      cpu += r[3];
      walk(r[0]);
    }
  };
  walk(process.pid);
  return { children: (kids.get(process.pid) ?? []).length, rssMb: rss / 1024, cpu };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : 0;
};
const stats = (xs: number[]) => `p50 ${pct(xs, 50)} / p95 ${pct(xs, 95)} / max ${Math.max(...xs)} ms`;

// ---- setup ----
const files: Record<string, string> = {};
const maxCalls = Math.max(...phases);
for (let i = 0; i < maxCalls; i++) files[`words/w${i}.txt`] = wordFor(i);
const cwd = fixture(files);

let settings: Record<string, unknown> = { maxConcurrent: limit };
if (fake) {
  const dir = mkdtempSync(join(tmpdir(), "pipipi-stress-fake-"));
  const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const lines = [
    { type: "session", version: 3, id: "child", timestamp: "2026-11-08T00:00:00Z", cwd },
    { type: "tool_execution_start", toolCallId: "c", toolName: "read", args: {} },
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "ok" }], usage, stopReason: "stop" } },
    { type: "turn_end", message: {}, toolResults: [] },
    { type: "agent_settled", aborted: false },
  ].map((l) => JSON.stringify(l));
  // delayMs is per line: spread the fake run time over the lines.
  writeFileSync(join(dir, "scenario.json"), JSON.stringify({ lines, delayMs: Math.round(fakeMs / lines.length) }));
  process.env.FAKE_PI_SCENARIO = join(dir, "scenario.json");
  process.env.FAKE_PI_RECORD = join(dir, "record.json");
  settings = { ...settings, piCommand: join(ROOT, "test", "fake-pi.mjs") };
}
const tool = await directTool(cwd, settings);

// ---- phases ----
const report: Record<string, unknown>[] = [];
for (const n of phases) {
  const samples: Sample[] = [];
  const sampler = setInterval(() => samples.push(sample()), 250);
  const started = Date.now();
  const calls = Array.from({ length: n }, async (_, i) => {
    const t0 = Date.now();
    try {
      const r: AgentResult = await tool.call({
        description: `word ${i}`,
        prompt: `Read words/w${i}.txt and reply with its content only.`,
        subagent_type: "Explore",
      });
      return { i, latency: Date.now() - t0, r };
    } catch (err) {
      return { i, latency: Date.now() - t0, thrown: (err as Error).message };
    }
  });
  const results = await Promise.all(calls);
  const wall = Date.now() - started;
  clearInterval(sampler);
  samples.push(sample());

  const ok = results.filter((x) => x.r?.status === "completed");
  const failed = results.filter((x) => !x.r || x.r.status !== "completed");
  const wrong = fake ? [] : ok.filter((x) => !x.r!.output.includes(wordFor(x.i)));
  const latencies = results.map((x) => x.latency);
  const childMs = ok.map((x) => x.r!.durationMs);
  const waits = ok.map((x) => x.latency - x.r!.durationMs);
  const cost = results.reduce((s, x) => s + (x.r?.usage.cost.total ?? 0), 0);
  const peak = {
    children: Math.max(...samples.map((s) => s.children)),
    rssMb: Math.round(Math.max(...samples.map((s) => s.rssMb))),
    cpu: Math.round(Math.max(...samples.map((s) => s.cpu))),
  };
  const errors = [...new Set(failed.map((x) => x.thrown ?? x.r?.error ?? x.r?.status))];

  console.log(`\n=== ${fake ? "fake" : "haiku"}: ${n} calls, limit ${limit} ===`);
  console.log(`wall          ${wall} ms   (${((n / wall) * 1000).toFixed(2)} agents/s)`);
  console.log(`completed     ${ok.length}/${n}   failed ${failed.length}   wrong answer ${wrong.length}`);
  console.log(`call latency  ${stats(latencies)}`);
  console.log(`child run     ${stats(childMs)}`);
  console.log(`queue+spawn   ${stats(waits)}`);
  console.log(`peak          ${peak.children} children, ${peak.rssMb} MB RSS, ${peak.cpu}% CPU   (this process ${Math.round(process.memoryUsage().rss / 1048576)} MB)`);
  if (!fake) console.log(`cost          $${cost.toFixed(5)}  ($${(cost / n).toFixed(6)} / agent)`);
  for (const e of errors) console.log(`  error: ${String(e).slice(0, 200)}`);
  for (const w of wrong.slice(0, 5)) console.log(`  wrong #${w.i}: ${w.r!.output.slice(0, 100)}`);
  report.push({ mode: fake ? "fake" : "haiku", calls: n, limit, wall, ok: ok.length, failed: failed.length, wrong: wrong.length,
    latency: { p50: pct(latencies, 50), p95: pct(latencies, 95), max: Math.max(...latencies) },
    childMs: { p50: pct(childMs, 50), p95: pct(childMs, 95), max: Math.max(...childMs) },
    queue: { p50: pct(waits, 50), p95: pct(waits, 95), max: Math.max(...waits) }, peak, cost, errors });
}

const dir = join(ROOT, "stress", "results");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}${fake ? "-fake" : ""}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`\nresults: ${file}`);
process.exit(report.every((r) => r.failed === 0 && r.wrong === 0) ? 0 : 1);
