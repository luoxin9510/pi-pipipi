// Run one child pi process and read its JSON event stream (spec 6).

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildSpec } from "./resolve.ts";

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

export interface RunResult {
  status: "completed" | "partial" | "failed";
  output: string;
  usage: Usage;
  turns: number;
  durationMs: number;
  error?: string;
}

export interface Progress {
  turns: number;
  lastTool?: string;
}

// Linux caps one argv string at 128 KiB. Longer prompts go through a file.
const MAX_PROMPT_ARG = 100_000;
const KILL_GRACE_MS = 5000;
const STDERR_LINES = 30;

export function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

function addUsage(sum: Usage, u: Usage): void {
  sum.input += u.input;
  sum.output += u.output;
  sum.cacheRead += u.cacheRead;
  sum.cacheWrite += u.cacheWrite;
  sum.totalTokens += u.totalTokens;
  sum.cost.input += u.cost.input;
  sum.cost.output += u.cost.output;
  sum.cost.cacheRead += u.cost.cacheRead;
  sum.cost.cacheWrite += u.cost.cacheWrite;
  sum.cost.total += u.cost.total;
}

interface AssistantMessage {
  role: "assistant";
  content: { type: string; text?: string }[];
  usage: Usage;
  stopReason: string;
  errorMessage?: string;
}

export function runChild(spec: ChildSpec, signal: AbortSignal | undefined, onProgress: (p: Progress) => void): Promise<RunResult> {
  if (signal?.aborted) return Promise.reject(new Error("aborted"));

  const started = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), "pipipi-"));
  const systemPromptFile = join(tmp, "system-prompt.md");
  writeFileSync(systemPromptFile, spec.systemPrompt);
  let promptArg = spec.prompt;
  if (Buffer.byteLength(spec.prompt) > MAX_PROMPT_ARG) {
    const promptFile = join(tmp, "prompt.md");
    writeFileSync(promptFile, spec.prompt);
    promptArg = `@${promptFile}`;
  }
  // `--` keeps a prompt that starts with "-" from being read as a flag.
  const argv = [...spec.args, "--system-prompt", systemPromptFile, "--", promptArg];

  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, argv, { cwd: spec.cwd, env: spec.env, stdio: ["ignore", "pipe", "pipe"] });

    const usage = emptyUsage();
    let output = "";
    let turns = 0;
    let lastTool: string | undefined;
    let records = 0;
    let settled = false;
    let assistantError: string | undefined;
    let streamError: string | undefined; // bad stream: we stopped the child
    let hitMaxTurns = false;
    let aborted = false;
    let stderr = "";
    let pending = Buffer.alloc(0);
    let killTimer: NodeJS.Timeout | undefined;

    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      killTimer ??= setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
      killTimer.unref();
    };

    const onAbort = () => {
      aborted = true;
      stop();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const handle = (line: string) => {
      let event: { type: string; [k: string]: unknown };
      try {
        event = JSON.parse(line);
      } catch {
        streamError = `invalid JSON from pi: ${line.slice(0, 200)}`;
        return stop();
      }
      records++;
      if (records === 1 && event.type !== "session") {
        streamError = `pi stream did not start with a session header: ${line.slice(0, 200)}`;
        return stop();
      }
      switch (event.type) {
        case "message_end": {
          const message = event.message as AssistantMessage | { role: string };
          if (message.role !== "assistant") break;
          const m = message as AssistantMessage;
          addUsage(usage, m.usage);
          const text = m.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
          if (text.trim() !== "") output = text;
          if (m.stopReason === "error") assistantError = m.errorMessage ?? "provider error";
          break;
        }
        case "tool_execution_start":
          lastTool = event.toolName as string;
          break;
        case "turn_end":
          turns++;
          onProgress({ turns, lastTool });
          if (spec.maxTurns !== undefined && turns >= spec.maxTurns && !hitMaxTurns) {
            hitMaxTurns = true;
            stop();
          }
          break;
        case "agent_settled":
          settled = true;
          break;
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      if (streamError || hitMaxTurns) return;
      pending = Buffer.concat([pending, chunk]);
      // Split on LF bytes only: JSON strings may hold U+2028/U+2029, which readline treats as line ends.
      for (let nl = pending.indexOf(0x0a); nl !== -1; nl = pending.indexOf(0x0a)) {
        const line = pending.subarray(0, nl).toString("utf8").replace(/\r$/, "");
        pending = pending.subarray(nl + 1);
        if (line.trim() !== "") handle(line);
        if (streamError || hitMaxTurns) return;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);
    });

    let finished = false;
    const finish = (code: number | null, spawnError?: Error) => {
      if (finished) return; // a failed spawn emits both "error" and "close"
      finished = true;
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      rmSync(tmp, { recursive: true, force: true });
      if (aborted) return reject(new Error("aborted"));

      const base = { output, usage, turns, durationMs: Date.now() - started };
      if (hitMaxTurns) return resolve({ status: "partial", ...base });
      const stderrTail = stderr.trimEnd().split("\n").slice(-STDERR_LINES).join("\n");
      const error =
        spawnError?.message ??
        streamError ??
        assistantError ??
        (code !== 0 ? stderrTail || `pi exited with code ${code}` : undefined) ??
        (!settled ? stderrTail || "pi exited before the run settled" : undefined);
      resolve(error === undefined ? { status: "completed", ...base } : { status: "failed", ...base, error });
    };

    child.on("error", (err) => finish(null, new Error(`could not start ${spec.command}: ${err.message}`)));
    child.on("close", (code) => finish(code));
  });
}
