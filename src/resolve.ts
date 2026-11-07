// Turn a definition + call input + config into the child process spec (spec 5).

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Config } from "./config.ts";
import type { AgentDefinition } from "./definition.ts";
import { projectDirs } from "./discovery.ts";

export interface CallInput {
  description: string;
  prompt: string;
  subagent_type?: string;
  model?: string;
  effort?: string;
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

export function resolveModel(input: CallInput, def: AgentDefinition, config: Config, parent: ParentContext): string {
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

export function resolveTools(def: AgentDefinition, config: Config): { args: string[]; warnings: string[] } {
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

function frontmatterName(text: string): string | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return undefined;
  try {
    const fm = parseYaml(m[1]!) as { name?: unknown } | null;
    return typeof fm?.name === "string" ? fm.name : undefined;
  } catch {
    return undefined; // a broken skill file is a missing skill, reported by the caller
  }
}

export function skillDirs(cwd: string): string[] {
  const project = projectDirs(cwd);
  return [
    ...project.flatMap((d) => [join(d, ".pi", "skills"), join(d, ".agents", "skills"), join(d, ".claude", "skills")]),
    join(homedir(), ".pi", "agent", "skills"),
    join(homedir(), ".agents", "skills"),
    join(homedir(), ".claude", "skills"),
  ];
}

// Directories holding SKILL.md, found recursively like pi does. Symlinks are followed; a skill directory is not
// searched further (its subdirectories are the skill's own files).
function skillFiles(dir: string, seen = new Set<string>()): string[] {
  if (!existsSync(dir)) return [];
  const real = realpathSync(dir);
  if (seen.has(real)) return [];
  seen.add(real);
  const own = join(dir, "SKILL.md");
  if (existsSync(own) && statSync(own).isFile()) return [own];
  return readdirSync(dir)
    .sort()
    .filter((e) => !e.startsWith(".") && e !== "node_modules")
    .map((e) => join(dir, e))
    .filter((p) => existsSync(p) && statSync(p).isDirectory())
    .flatMap((p) => skillFiles(p, seen));
}

// Matched by frontmatter name, else the directory name. Earlier dirs win.
function findSkill(name: string, dirs: string[]): string | undefined {
  for (const dir of dirs) {
    for (const file of skillFiles(dir)) {
      const text = readFileSync(file, "utf8");
      if ((frontmatterName(text) ?? basename(dirname(file))) === name) return text;
    }
  }
  return undefined;
}

export function buildSystemPrompt(def: AgentDefinition, cwd: string, now: Date): { text: string; warnings: string[] } {
  const parts = [def.prompt];
  const warnings: string[] = [];
  const dirs = skillDirs(cwd);
  for (const name of def.skills ?? []) {
    const text = findSkill(name, dirs);
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

export function subagentSessionDir(parent: ParentContext): string {
  return join(dirname(parent.sessionFile!), "subagents", parent.sessionId);
}

// Written next to the child session on a first run, so a resume knows which agent it was.
export function agentMetaFile(parent: ParentContext, agentId: string): string {
  return join(subagentSessionDir(parent), `${agentId}.json`);
}

// The agentType a resumable run was started with. Throws for anything that cannot be resumed.
export function storedAgentType(parent: ParentContext, resume: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(resume)) throw new Error(`invalid resume id "${resume}"`);
  if (!parent.sessionFile) throw new Error("resume needs a persisted parent session");
  const file = agentMetaFile(parent, resume);
  if (!existsSync(file)) throw new Error(`no subagent session "${resume}" to resume`);
  return (JSON.parse(readFileSync(file, "utf8")) as { agentType: string }).agentType;
}

export function newAgentId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join("");
}

export function resolveChild(
  def: AgentDefinition,
  input: CallInput,
  config: Config,
  parent: ParentContext,
  now = new Date(),
): ChildSpec {
  const model = resolveModel(input, def, config, parent);
  const thinking = input.effort ?? def.effort ?? parent.thinking;
  const tools = resolveTools(def, config);
  const system = buildSystemPrompt(def, parent.cwd, now);

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
