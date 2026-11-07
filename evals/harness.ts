// Real-model eval harness. Two ways in:
// - `direct`: the Agent tool loaded in this process against a stub ExtensionAPI, children are real `pi` processes.
// - `parent`: a real parent `pi` (codemode + this checkout) that calls the tool from its own scripts.
// Every model call is haiku unless a case says otherwise. Results are graded from structured output and side effects.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pipipi from "../src/index.ts";
import type { AgentResult } from "../src/agent-tool.ts";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const HAIKU = "anthropic/claude-haiku-5-5";

// A temp git repository with the given files.
export function fixture(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "pipipi-eval-"));
  mkdirSync(join(dir, ".git"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

export interface DirectTool {
  call(params: Record<string, unknown>, signal?: AbortSignal): Promise<AgentResult>;
  sessionDir: string;
  warnings: string[];
}

// The extension loaded once per call site, with a persisted (temp) parent session so resume works.
export async function directTool(cwd: string, settings: Record<string, unknown> = {}): Promise<DirectTool> {
  const tools: Record<string, any> = {};
  const handlers: Record<string, Function[]> = {};
  const warnings: string[] = [];
  const api = {
    on: (event: string, h: Function) => (handlers[event] ??= []).push(h),
    registerTool: (t: any) => (tools[t.name] = t),
    getSettings: () => ({ pipipi: { defaultModel: "haiku", ...settings } }),
  };
  pipipi(api as any);
  const sessionDir = mkdtempSync(join(tmpdir(), "pipipi-eval-sessions-"));
  const sessionId = `eval-${Date.now().toString(36)}`;
  const ctx = {
    cwd,
    hasUI: true,
    ui: { notify: (m: string) => warnings.push(m) },
    model: { provider: "anthropic", id: "claude-haiku-5-5" },
    thinkingLevel: "low",
    isProjectTrusted: () => true,
    sessionManager: { getSessionFile: () => join(sessionDir, `${sessionId}.jsonl`), getSessionId: () => sessionId },
  };
  for (const h of handlers.session_start ?? []) await h({ reason: "startup" }, ctx);
  const tool = tools.Agent;
  if (!tool) throw new Error("Agent tool was not registered");
  return {
    sessionDir,
    warnings,
    call: async (params, signal) => {
      const r = await tool.execute("eval", { description: "eval task", ...params }, signal, undefined, ctx);
      return r.structuredContent as AgentResult;
    },
  };
}

export interface ParentRun {
  text: string; // the parent's last assistant text
  tools: string[]; // tool names started, in order (nested codemode calls included)
  cost: number; // parent + every child session found under the session dir
  sessionDir: string;
  timedOut: boolean;
  code: number | null;
}

// A real parent pi on haiku: codemode plus this checkout only (no installed extensions, so no double registration).
export function runParent(cwd: string, prompt: string, timeoutMs = 240_000, extraArgs: string[] = []): Promise<ParentRun> {
  const sessionDir = mkdtempSync(join(tmpdir(), "pipipi-eval-parent-"));
  const args = [
    "--model", HAIKU, "--thinking", "low",
    "--no-extensions", "-e", "builtin:codemode", "-e", join(ROOT, "src", "index.ts"),
    "--tools", "+codemode", "--session-dir", sessionDir, "--mode", "json", ...extraArgs, "-p", "--", prompt,
  ];
  return new Promise((done) => {
    const child = spawn("pi", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let timedOut = false;
    child.stdout.on("data", (c: Buffer) => (out += c.toString("utf8")));
    child.stderr.on("data", () => {});
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      let text = "";
      const tools: string[] = [];
      for (const line of out.split("\n")) {
        let e: any;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.type === "tool_execution_start") tools.push(e.toolName);
        if (e.type === "message_end" && e.message?.role === "assistant") {
          const t = e.message.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
          if (t.trim()) text = t;
        }
      }
      done({ text, tools, cost: sessionCost(sessionDir), sessionDir, timedOut, code });
    });
  });
}

// Sum assistant cost across every session file below a directory.
export function sessionCost(dir: string): number {
  let total = 0;
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".jsonl")) {
        for (const line of readFileSync(p, "utf8").split("\n")) {
          try {
            const r = JSON.parse(line);
            const m = r.message ?? r;
            if (m?.role === "assistant" && m.usage?.cost) total += m.usage.cost.total;
          } catch {}
        }
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return total;
}

// The subagent meta files the parent's children wrote: { agentId: agentType }.
export function childAgents(parentSessionDir: string): Record<string, string> {
  const found: Record<string, string> = {};
  const root = join(parentSessionDir, "subagents");
  if (!existsSync(root)) return found;
  for (const parent of readdirSync(root)) {
    for (const f of readdirSync(join(root, parent))) {
      if (f.endsWith(".json")) found[f.slice(0, -5)] = JSON.parse(readFileSync(join(root, parent, f), "utf8")).agentType;
    }
  }
  return found;
}

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface CaseOutcome {
  checks: Check[];
  cost: number;
  notes?: string;
}

export interface EvalCase {
  name: string;
  kind: "direct" | "parent";
  run(): Promise<CaseOutcome>;
}

export const check = (name: string, pass: boolean, detail?: unknown): Check => ({
  name,
  pass,
  detail: pass ? undefined : typeof detail === "string" ? detail.slice(0, 300) : JSON.stringify(detail)?.slice(0, 300),
});

export const costOf = (...rs: AgentResult[]) => rs.reduce((s, r) => s + r.usage.cost.total, 0);
