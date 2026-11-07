// Find skills to preload into a child's system prompt (spec 5, System prompt).

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { projectDirs } from "./discovery.ts";

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

function skillDirs(cwd: string): string[] {
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
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // an unreadable directory holds no skills
  }
  return entries
    .sort()
    .filter((e) => !e.startsWith(".") && e !== "node_modules")
    .map((e) => join(dir, e))
    .filter((p) => existsSync(p) && statSync(p).isDirectory())
    .flatMap((p) => skillFiles(p, seen));
}

// Matched by frontmatter name, else the directory name. Earlier dirs win.
export function findSkill(name: string, cwd: string): string | undefined {
  for (const dir of skillDirs(cwd)) {
    for (const file of skillFiles(dir)) {
      const text = readFileSync(file, "utf8");
      if ((frontmatterName(text) ?? basename(dirname(file))) === name) return text;
    }
  }
  return undefined;
}
