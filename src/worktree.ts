// Worktree isolation (v3b): one git worktree per isolated agent, on its own branch. Shells out to `git` only.
// Callers: agent-tool.ts (plan), exchange.ts (create before the run, settle after it).

import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Where a worktree is, and what it started from. Stored in the agent's meta file.
export interface WorktreeRef {
  root: string; // the main checkout (git root of the parent's cwd)
  path: string; // <root>/.pi/worktrees/<agentId>
  branch: string; // pipipi/<agentId>
  base: string; // commit the worktree started from
}

// What an exchange leaves behind. `changed: false` means the worktree and its branch were removed.
export type WorktreeOutcome = { changed: false } | { changed: true; path: string; branch: string; files: string[]; commits: string[] };

const EXCLUDE_LINE = "/.pi/worktrees/";
const MAX_LISTED = 200; // files and commits reported per worktree

function git(cwd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      const detail = (err as NodeJS.ErrnoException).code === "ENOENT" ? "git is not installed" : stderr.trim() || err.message;
      reject(new Error(`git ${args.slice(0, 2).join(" ")} failed in ${cwd}: ${detail}`));
    });
    if (input !== undefined) child.stdin!.end(input);
  });
}

const gitLine = async (cwd: string, args: string[]) => (await git(cwd, args)).trim();

// Git's own lock would fail concurrent `worktree add` calls in one repo: one at a time per root.
const locks = new Map<string, Promise<unknown>>();
function locked<T>(root: string, work: () => Promise<T>): Promise<T> {
  const run = (locks.get(root) ?? Promise.resolve()).then(work, work);
  locks.set(root, run.catch(() => {}));
  return run;
}

// Check that `cwd` is in a repository with a commit, and say where the worktree for `agentId` will be.
export async function planWorktree(cwd: string, agentId: string): Promise<WorktreeRef> {
  let root: string;
  try {
    root = await gitLine(cwd, ["rev-parse", "--show-toplevel"]);
  } catch (err) {
    if ((err as Error).message.includes("not installed")) throw err;
    throw new Error(`isolation "worktree" needs a git repository: ${cwd} is not inside a git repository`);
  }
  let base: string;
  try {
    base = await gitLine(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  } catch {
    throw new Error(`isolation "worktree" needs a commit to start from: the repository at ${root} has no commits`);
  }
  return { root, path: join(root, ".pi", "worktrees", agentId), branch: `pipipi/${agentId}`, base };
}

async function excludeWorktrees(root: string): Promise<void> {
  const file = resolve(root, await gitLine(root, ["rev-parse", "--git-path", "info/exclude"]));
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text.split("\n").includes(EXCLUDE_LINE)) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${EXCLUDE_LINE}\n`);
}

// Claude Code's rules: gitignore syntax, and only files that match a pattern and are also gitignored are copied.
async function copyIncluded(root: string, path: string): Promise<void> {
  if (!existsSync(join(root, ".worktreeinclude"))) return;
  const listed = (await git(root, ["ls-files", "--others", "--ignored", "--exclude-from=.worktreeinclude", "-z"])).split("\0");
  const candidates = listed.filter((f) => f !== "" && !f.startsWith(".pi/worktrees/"));
  if (candidates.length === 0) return;
  const ignored = (await git(root, ["check-ignore", "-z", "--stdin"], candidates.join("\0") + "\0").catch(() => "")).split("\0");
  for (const file of ignored.filter((f) => f !== "")) {
    const to = join(path, file);
    if (existsSync(to)) continue;
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(root, file), to, { verbatimSymlinks: true });
  }
}

// Make sure the worktree exists. A kept one is re-entered as it is. Otherwise it is created from the main checkout's
// current HEAD (also when an unchanged one was removed after an earlier exchange): `ref.base` is updated. Returns warnings.
export function ensureWorktree(ref: WorktreeRef): Promise<string[]> {
  return locked(ref.root, async () => {
    if (existsSync(ref.path)) return [];
    const warnings: string[] = [];
    if ((await git(ref.root, ["branch", "--list", ref.branch])).trim() !== "") {
      throw new Error(`worktree ${ref.path} was removed but its branch ${ref.branch} still exists; remove the branch with "git branch -D ${ref.branch}" or restore the worktree with "git worktree add ${ref.path} ${ref.branch}"`);
    }
    await excludeWorktrees(ref.root);
    await git(ref.root, ["worktree", "prune"]);
    if ((await git(ref.root, ["status", "--porcelain"])).trim() !== "") {
      warnings.push("the main checkout has uncommitted changes; the isolated agent does not see them");
    }
    ref.base = await gitLine(ref.root, ["rev-parse", "--verify", "HEAD^{commit}"]);
    await git(ref.root, ["worktree", "add", "-q", "-b", ref.branch, ref.path, ref.base]);
    try {
      await copyIncluded(ref.root, ref.path);
    } catch (err) {
      await remove(ref).catch(() => {}); // do not leave a half-made worktree behind
      throw err;
    }
    return warnings;
  });
}

// Entries of `git status --porcelain -z`: "XY path", and for a rename or copy the old path as an extra entry.
function statusPaths(out: string): string[] {
  const entries = out.split("\0").filter((e) => e !== "");
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    paths.push(entries[i].slice(3));
    if (/^[RC]/.test(entries[i])) i++;
  }
  return paths;
}

async function inspect(ref: WorktreeRef): Promise<WorktreeOutcome> {
  const status = statusPaths(await git(ref.path, ["status", "--porcelain", "-z", "--untracked-files=all"]));
  const head = await gitLine(ref.path, ["rev-parse", "HEAD"]);
  if (status.length === 0 && head === ref.base) return { changed: false };
  const committed = head === ref.base ? [] : (await git(ref.path, ["diff", "--name-only", "-z", ref.base, "HEAD"])).split("\0").filter((f) => f !== "");
  const commits = head === ref.base ? [] : (await gitLine(ref.path, ["log", "--format=%h %s", `${ref.base}..HEAD`])).split("\n").filter((l) => l !== "");
  const files = [...new Set([...status, ...committed])];
  return { changed: true, path: ref.path, branch: ref.branch, files: files.slice(0, MAX_LISTED), commits: commits.slice(0, MAX_LISTED) };
}

async function remove(ref: WorktreeRef): Promise<void> {
  if (existsSync(ref.path)) await git(ref.root, ["worktree", "remove", "--force", ref.path]);
  await git(ref.root, ["worktree", "prune"]);
  await git(ref.root, ["branch", "-D", ref.branch]);
}

// End of an exchange, after the child has exited: an unchanged worktree is removed with its branch, a changed one is kept.
export function settleWorktree(ref: WorktreeRef): Promise<WorktreeOutcome> {
  return locked(ref.root, async () => {
    const outcome = await inspect(ref);
    if (!outcome.changed) await remove(ref);
    return outcome;
  });
}

// Remove a worktree whatever it holds (`/subagents worktrees`).
export function removeWorktree(ref: WorktreeRef): Promise<void> {
  return locked(ref.root, () => remove(ref));
}
