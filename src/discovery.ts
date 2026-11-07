// Find agent definitions in the five sources (spec 4.2), highest priority first.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type AgentDefinition, parseDefinition } from "./definition.ts";

export const BUILTIN_DIR = fileURLToPath(new URL("./builtin/", import.meta.url));

export interface Discovery {
  agents: Map<string, AgentDefinition>;
  warnings: string[];
}

// cwd, then each parent up to the nearest ancestor containing .git. Without a repo, only cwd.
export function projectDirs(cwd: string): string[] {
  const dirs: string[] = [];
  for (let dir = cwd; ; dir = dirname(dir)) {
    dirs.push(dir);
    if (existsSync(join(dir, ".git"))) return dirs;
    if (dirname(dir) === dir) return [cwd];
  }
}

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

export function agentSources(cwd: string): string[] {
  const project = projectDirs(cwd);
  return [
    ...project.map((d) => join(d, ".pi", "agents")),
    ...project.map((d) => join(d, ".claude", "agents")),
    join(homedir(), ".pi", "agent", "agents"),
    join(homedir(), ".claude", "agents"),
    BUILTIN_DIR,
  ];
}

export function discoverAgents(cwd: string): Discovery {
  const agents = new Map<string, AgentDefinition>();
  const warnings: string[] = [];

  for (const dir of agentSources(cwd)) {
    const seen = new Map<string, string>(); // name -> path, within this source
    for (const path of markdownFiles(dir)) {
      const result = parseDefinition(path, readFileSync(path, "utf8"));
      if (!result.ok) {
        warnings.push(`skipped agent file ${path}: ${result.reason}`);
        continue;
      }
      const def = result.def;
      const first = seen.get(def.name);
      if (first) {
        warnings.push(`agent "${def.name}" is defined twice: ${first} wins over ${path}`);
        continue;
      }
      seen.set(def.name, path);
      if (agents.has(def.name)) continue; // a higher-priority source already defined it
      agents.set(def.name, dir === BUILTIN_DIR ? { ...def, source: `builtin:${def.name}` } : def);
      for (const field of def.inert) warnings.push(`${def.name}: field "${field}" has no effect in pi-pipipi`);
    }
  }
  return { agents, warnings };
}
