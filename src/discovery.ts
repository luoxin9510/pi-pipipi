// Find agent definitions in the five sources (spec 4.2), highest priority first.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type AgentDefinition, inertNotice, parseDefinition } from "./definition.ts";

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

// Symlinked directories are followed (like skills); realpath keeps a loop from repeating.
function markdownFiles(dir: string, warnings: string[], seen = new Set<string>()): string[] {
  if (!existsSync(dir)) return [];
  const real = realpathSync(dir);
  if (seen.has(real)) return [];
  seen.add(real);
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch (err) {
    warnings.push(`cannot read agent directory ${dir}: ${(err as NodeJS.ErrnoException).code}`);
    return [];
  }
  return entries.flatMap((e) => {
    const path = join(dir, e);
    const stat = statSync(path, { throwIfNoEntry: false }); // a dangling symlink is skipped
    if (stat?.isDirectory()) return markdownFiles(path, warnings, seen);
    return stat?.isFile() && e.endsWith(".md") ? [path] : [];
  });
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

  const projectSources = new Set(agentSources(cwd).slice(0, 2 * projectDirs(cwd).length));
  const winners = new Map<string, { dir: string; path: string }>();
  for (const dir of agentSources(cwd)) {
    const seen = new Map<string, string>(); // name -> path, within this source
    for (const path of markdownFiles(dir, warnings)) {
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
      const winner = winners.get(def.name);
      if (winner) {
        // a higher-priority source already defined it
        if (dir === BUILTIN_DIR && projectSources.has(winner.dir)) {
          warnings.push(`project agent "${def.name}" overrides the built-in (${winner.path})`);
        }
        continue;
      }
      winners.set(def.name, { dir, path });
      agents.set(def.name, dir === BUILTIN_DIR ? { ...def, source: `builtin:${def.name}` } : def);
      for (const field of def.inert) warnings.push(`${def.name}: ${inertNotice(field)}`);
    }
  }
  return { agents, warnings };
}
