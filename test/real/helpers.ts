// Harness for the real suite: the extension loaded in-process, children are the repo's pinned pi on real haiku.
// Each sandbox has its own repo, HOME and pi agent dir, so the user's setup (packages, settings, agents) never leaks in.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pipipi from "../../src/index.ts";
import type { AgentResult } from "../../src/agent-tool.ts";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PI = join(ROOT, "node_modules", ".bin", "pi");
export const HAIKU = "anthropic/claude-haiku-5-5";
const USER_AUTH = join(process.env.HOME ?? "", ".pi", "agent", "auth.json"); // read before any sandbox changes HOME

export const agentFile = (fields: string, body = "You are a test agent.") => `---\n${fields}\n---\n${body}\n`;
export const flag = (args: string[], name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

// Every real run's usage.cost.total is added here; a test file prints the sum when it ends.
let total = 0;
export const spent = () => total;
// PIPIPI_COST_LOG=<file> npm test: each test file appends its total on exit, to measure the cost of a run.
if (process.env.PIPIPI_COST_LOG) process.on("exit", () => appendFileSync(process.env.PIPIPI_COST_LOG!, `${total}\n`));

export function sandbox() {
  if (!existsSync(USER_AUTH)) throw new Error(`real tests need pi credentials at ${USER_AUTH}`);
  const root = mkdtempSync(join(tmpdir(), "pipipi-real-"));
  const repo = join(root, "repo");
  const home = join(root, "home");
  const agentDir = join(root, "pi-agent");
  mkdirSync(join(repo, ".git"), { recursive: true });
  mkdirSync(home, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  symlinkSync(USER_AUTH, join(agentDir, "auth.json"));
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-haiku-5-5", packages: [], quietStartup: true }));
  // Children inherit the environment of this process.
  process.env.HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_SKIP_VERSION_CHECK = "1";
  process.env.PI_TELEMETRY = "0";
  return {
    root,
    repo,
    home,
    agentDir,
    write(path: string, text: string) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
  };
}

interface Ctx {
  cwd: string;
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  trusted?: boolean;
  persist?: string; // dir for a persisted parent session (enables resume); omitted = in-memory parent
  notes?: string[];
  sessionId?: string; // reuse a parent session id: loading again with it simulates /reload or resuming the parent
  pick?: (options: string[]) => string | undefined; // answers ui.select
}

// The extension against a stub ExtensionAPI; the Agent tool is called directly. piCommand defaults to the pinned pi.
export async function loadTool(settings: Record<string, unknown>, c: Ctx) {
  const tools: Record<string, any> = {};
  const commands: Record<string, any> = {};
  const menus: { title: string; options: string[] }[] = [];
  const handlers: Record<string, Function[]> = {};
  const notes: string[] = c.notes ?? [];
  const pi = {
    on: (event: string, h: Function) => (handlers[event] ??= []).push(h),
    registerTool: (t: any) => (tools[t.name] = t),
    registerCommand: (name: string, c: any) => (commands[name] = c),
    getSettings: () => ({ pipipi: { piCommand: PI, ...settings } }),
  };
  pipipi(pi as any);
  const sessionId = c.sessionId ?? `parent-${Math.random().toString(36).slice(2, 8)}`;
  const sessionFile = c.persist ? join(c.persist, `${sessionId}.jsonl`) : undefined;
  const ctx = {
    cwd: c.cwd,
    hasUI: true,
    ui: {
      notify: (m: string) => notes.push(m),
      select: async (title: string, options: string[]) => {
        menus.push({ title, options });
        return c.pick?.(options);
      },
    },
    model: "model" in c ? c.model : { provider: "anthropic", id: "claude-haiku-5-5" },
    thinkingLevel: c.thinkingLevel ?? "off",
    isProjectTrusted: () => c.trusted ?? true,
    sessionManager: { getSessionFile: () => sessionFile, getSessionId: () => sessionId },
  };
  for (const h of handlers.session_start ?? []) await h({ reason: "startup" }, ctx);
  const tool = tools.Agent;
  const updates: string[] = [];
  const self = {
    tool,
    notes,
    updates,
    menus,
    sessionId,
    command: (name: string, args = "") => commands[name].handler(args, ctx),
    registered: tool !== undefined,
    sessionDir: sessionFile ? join(dirname(sessionFile), "subagents", sessionId) : undefined,
    async run(params: Record<string, unknown>, signal?: AbortSignal) {
      const res = await tool.execute("call-1", { description: "test task", prompt: "do it", ...params }, signal, (u: any) => updates.push(u.content[0].text), ctx);
      total += (res.structuredContent as AgentResult).usage.cost.total;
      return res;
    },
    async result(params: Record<string, unknown>, signal?: AbortSignal): Promise<AgentResult> {
      return (await self.run(params, signal)).structuredContent as AgentResult;
    },
  };
  return self;
}

// ---- reading a child's session file ----
export interface SessionEntry { type: string; [k: string]: any }

export function sessionEntries(dir: string, agentId: string): SessionEntry[] {
  const file = readdirSync(dir).find((f) => f.endsWith(".jsonl") && f.includes(agentId));
  if (!file) throw new Error(`no session file for ${agentId} in ${dir}: ${readdirSync(dir)}`);
  return readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export const assistantMessages = (entries: SessionEntry[]) =>
  entries.filter((e) => e.type === "message" && e.message.role === "assistant").map((e) => e.message);

// What the child was started with, as pi recorded it in the session: model, thinking level, active tools, system prompt.
export function childSetup(dir: string, agentId: string) {
  const entries = sessionEntries(dir, agentId);
  const sys = entries.find((e) => e.type === "message" && e.message.role === "system")!.message;
  const model = entries.find((e) => e.type === "model_change")!;
  return {
    entries,
    model: `${model.provider}/${model.modelId}`,
    thinking: entries.filter((e) => e.type === "thinking_level_change").at(-1)!.thinkingLevel as string,
    tools: (sys.toolsAdded as { name: string }[]).map((t) => t.name).sort(),
    prompt: sys.sections.preamble as string, // agent body, preloaded skills and the environment block
    hasContextFiles: "project_context" in sys.sections,
  };
}

export const REPLY_OK = "Reply with the single word OK. Do not call any tool.";

// Names of the tools the child called, in order.
export function toolCalls(entries: SessionEntry[]): string[] {
  return assistantMessages(entries).flatMap((m) => (m.content as any[]).filter((c) => c.type === "toolCall").map((c) => c.name as string));
}
