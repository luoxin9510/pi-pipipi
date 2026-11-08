import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pipipi from "../src/index.ts";

export const FAKE_PI = fileURLToPath(new URL("./fake-pi.mjs", import.meta.url));

export const usage = (input: number, output: number, cost: number) => ({
  input, output, cacheRead: 0, cacheWrite: 0, totalTokens: input + output,
  cost: { input: cost / 2, output: cost / 2, cacheRead: 0, cacheWrite: 0, total: cost },
});

export const ev = {
  session: () => JSON.stringify({ type: "session", version: 3, id: "child", timestamp: "2026-11-07T00:00:00Z", cwd: "/x" }),
  assistant: (text: string, u = usage(10, 5, 0.01), extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: "message_end",
      message: { role: "assistant", content: text ? [{ type: "text", text }] : [], usage: u, stopReason: "stop", ...extra },
    }),
  user: (text: string) => JSON.stringify({ type: "message_end", message: { role: "user", content: text } }),
  tool: (name: string) => JSON.stringify({ type: "tool_execution_start", toolCallId: "c", toolName: name, args: {} }),
  turnEnd: (message: Record<string, unknown> = {}) => JSON.stringify({ type: "turn_end", message, toolResults: [] }),
  settled: () => JSON.stringify({ type: "agent_settled", aborted: false }),
};

export const happyLines = (text = "done") => [ev.session(), ev.assistant(text), ev.turnEnd(), ev.settled()];

export interface Scenario {
  lines: string[];
  exitCode?: number;
  stderr?: string;
  delayMs?: number;
  hang?: boolean;
  sessionFile?: string;
  promptError?: string; // answer the prompt command with success: false
  abortSettles?: boolean; // answer an rpc abort with agent_settled aborted: true
}

// A temp repo (with .git) and a temp HOME, so discovery never sees the real user dirs.
export function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "pipipi-test-"));
  const repo = join(root, "repo");
  const home = join(root, "home");
  mkdirSync(join(repo, ".git"), { recursive: true });
  mkdirSync(home, { recursive: true });
  process.env.HOME = home;
  const scenarioFile = join(root, "scenario.json");
  const recordFile = join(root, "record.json");
  process.env.FAKE_PI_SCENARIO = scenarioFile;
  process.env.FAKE_PI_RECORD = recordFile;
  return {
    root,
    repo,
    home,
    write(path: string, text: string) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
    scenario(s: Scenario) {
      writeFileSync(scenarioFile, JSON.stringify(s));
    },
    record(): { argv: string[]; depth?: string; commands: { type: string; message?: string }[]; cwd: string; systemPrompt?: string } {
      return JSON.parse(readFileSync(recordFile, "utf8"));
    },
  };
}

export function agentFile(fields: string, body = "You are a test agent.") {
  return `---\n${fields}\n---\n${body}\n`;
}

interface FakeCtx {
  cwd: string;
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  trusted?: boolean;
  sessionFile?: string;
  sessionId?: string;
  notes?: string[]; // collects ui notifications even when loading throws
}

// Load the extension against a fake ExtensionAPI and return the registered Agent tool.
export async function loadTool(settings: Record<string, unknown>, c: FakeCtx) {
  const tools: Record<string, any> = {};
  const handlers: Record<string, Function[]> = {};
  const notes: string[] = c.notes ?? [];
  const pi = {
    on: (event: string, h: Function) => (handlers[event] ??= []).push(h),
    registerTool: (t: any) => (tools[t.name] = t),
    registerCommand: () => {},
    getSettings: () => ({ pipipi: { piCommand: FAKE_PI, ...settings } }),
  };
  pipipi(pi as any);
  const ctx = {
    cwd: c.cwd,
    hasUI: true,
    ui: { notify: (m: string) => notes.push(m), setWidget: () => {}, onTerminalInput: () => () => {} },
    model: "model" in c ? c.model : { provider: "anthropic", id: "claude-opus-5-5" },
    thinkingLevel: c.thinkingLevel ?? "medium",
    isProjectTrusted: () => c.trusted ?? true,
    sessionManager: {
      getSessionFile: () => c.sessionFile,
      getSessionId: () => c.sessionId ?? "parent-id",
    },
  };
  for (const h of handlers.session_start ?? []) await h({ reason: "startup" }, ctx);
  const tool = tools.Agent;
  const updates: string[] = [];
  return {
    tool,
    notes,
    updates,
    registered: tool !== undefined,
    run: (params: Record<string, unknown>, signal?: AbortSignal) =>
      tool.execute("call-1", { description: "test task", prompt: "do it", ...params }, signal, (u: any) => updates.push(u.content[0].text), ctx),
  };
}

export const flag = (args: string[], name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
