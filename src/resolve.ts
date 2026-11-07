// Turn a definition + call input + config into the child process spec (spec 5).

import type { Config } from "./config.ts";
import type { AgentDefinition, Effort } from "./definition.ts";
import { newAgentId, subagentSessionDir } from "./sessions.ts";
import { findSkill } from "./skills.ts";

export interface CallInput {
  description: string;
  prompt: string;
  subagent_type?: string;
  model?: string;
  effort?: Effort;
  resume?: string;
}

export interface ParentContext {
  model?: string; // "provider/id" of the parent session
  thinking: string;
  cwd: string;
  trusted: boolean;
  sessionFile?: string; // undefined when the parent session is in memory
  sessionId: string;
}

export interface ChildSpec {
  command: string;
  args: string[]; // everything except --system-prompt and the prompt, which the runner adds
  env: Record<string, string>;
  cwd: string;
  systemPrompt: string;
  prompt: string;
  model: string;
  maxTurns?: number;
  agentId: string;
  warnings: string[];
}

const BUILTIN_TOOL_MAP: Record<string, string> = {
  Read: "read", Write: "write", Edit: "edit", Bash: "bash", Grep: "grep", Glob: "find", LS: "ls",
};

// Tools that would let a child spawn agents. Nesting is fixed at one level in v1.
const NESTING_TOOLS = ["Agent", "Task"];

function resolveModel(input: CallInput, def: AgentDefinition, config: Config, parent: ParentContext): string {
  // The parent model is used only for an explicit "inherit"; the default is config.defaultModel ("haiku").
  const choice = input.model ?? def.model ?? config.defaultModel;
  if (choice === "inherit") {
    if (!parent.model) throw new Error("the parent session has no model to inherit");
    return parent.model;
  }
  return config.models[choice] ?? choice;
}

// Map Claude Code tool names to pi names. undefined = no pi equivalent (or nesting).
function mapTool(name: string, toolMap: Record<string, string>): string | undefined {
  if (toolMap[name]) return toolMap[name];
  if (name.startsWith("mcp__")) return name;
  if (/^[a-z][a-z0-9_]*$/.test(name)) return name; // already a pi name
  return undefined;
}

function resolveTools(def: AgentDefinition, config: Config): { args: string[]; warnings: string[] } {
  const toolMap = { ...BUILTIN_TOOL_MAP, ...config.toolMap };
  const warnings: string[] = [];

  const map = (names: string[]) => {
    const out: string[] = [];
    for (const name of names) {
      if (NESTING_TOOLS.includes(name)) continue;
      const mapped = mapTool(name, toolMap);
      if (mapped === undefined) warnings.push(`tool "${name}" has no pi equivalent`);
      else if (!out.includes(mapped)) out.push(mapped);
    }
    return out;
  };

  // `Bash(git push *)` in a deny list removes the whole tool: pi has no per-command rules.
  const deny = map((def.disallowedTools ?? []).map((t) => t.replace(/\(.*\)$/, "").trim()));
  const args: string[] = [];
  if (def.tools !== undefined) {
    const allow = map(def.tools).filter((t) => !deny.includes(t));
    if (allow.length === 0) throw new Error(`agent "${def.name}" has no usable tools`);
    args.push("--tools", allow.join(","));
  }
  if (deny.length > 0) args.push("--exclude-tools", deny.join(","));
  return { args, warnings };
}

function buildSystemPrompt(def: AgentDefinition, cwd: string, now: Date): { text: string; warnings: string[] } {
  const parts = [def.prompt];
  const warnings: string[] = [];
  for (const name of def.skills ?? []) {
    const text = findSkill(name, cwd);
    if (text === undefined) warnings.push(`skill "${name}" not found`);
    else parts.push(`# Skill: ${name}\n\n${text.trim()}`);
  }
  parts.push(
    [
      "# Environment",
      `Working directory: ${cwd}`,
      `Platform: ${process.platform}`,
      `Date: ${now.toISOString().slice(0, 10)}`,
    ].join("\n"),
  );
  return { text: parts.join("\n\n"), warnings };
}

export function resolveChild(
  def: AgentDefinition,
  input: CallInput,
  config: Config,
  parent: ParentContext,
): ChildSpec {
  const model = resolveModel(input, def, config, parent);
  const thinking = input.effort ?? def.effort ?? parent.thinking;
  const tools = resolveTools(def, config);
  const system = buildSystemPrompt(def, parent.cwd, new Date());

  // A resume id was already checked by storedAgentType().
  const agentId = input.resume ?? newAgentId();
  const session = parent.sessionFile ? ["--session-dir", subagentSessionDir(parent), "--session-id", agentId] : ["--no-session"];

  const args = [
    "--mode", "json", "-p",
    "--model", model,
    "--thinking", thinking,
    ...tools.args,
    ...(def.omitClaudeMd ? ["--no-context-files"] : []),
    parent.trusted ? "--approve" : "--no-approve",
    ...session,
  ];

  return {
    command: config.piCommand,
    args,
    env: { ...(process.env as Record<string, string>), PIPIPI_DEPTH: "1" },
    cwd: parent.cwd,
    systemPrompt: system.text,
    prompt: input.prompt,
    model,
    maxTurns: def.maxTurns,
    agentId,
    warnings: [...tools.warnings, ...system.warnings],
  };
}
