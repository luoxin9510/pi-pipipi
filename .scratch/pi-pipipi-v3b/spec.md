# pi-pipipi v3b: worktree isolation, memory, polish

Status: ready-for-agent

Decisions behind this spec: `../pi-pipipi/decisions.md`, "Grill 4" (2026-11-08), items 10-12. v3a spec:
`../pi-pipipi-v3a/spec.md`. v2 spec: `../pi-pipipi-v2/spec.md`. Shared pi facts: `~/Developer/pi-pipipi-notes/pi-1.5.0-facts.md`.
The gaps the decisions left were answered by the owner on 2026-11-08 ("all as recommended"); see "Resolved questions".

## Problem Statement

Several subagents that write files in the same checkout step on each other, and I cannot let an agent try a risky change
without touching my working tree. Agents also start every run from nothing: a reviewer that learned my project's
conventions last week has forgotten them today. And the panel and the subagent screen are plain: I cannot tell agents
apart at a glance, I cannot see which model and effort a run uses without opening it, and stopping everything means
pressing `x` row by row. Claude Code has `isolation: worktree`, `memory` and `color` in its agent files; today pi-pipipi
parses them and says they have no effect.

## Solution

`isolation: "worktree"` (in the `Agent` call or the agent file, the call wins) runs the agent in its own git worktree on
its own branch, so it can edit freely. When the exchange ends, an unchanged worktree is removed with its branch; a
changed one is kept and the result tells main its path, branch, changed files and commits. Nothing is merged or committed
for me. `/subagents worktrees` lists the kept ones and removes them. Resuming an agent re-enters its worktree.

`memory: user|project|local` gives an agent a persistent directory at Claude Code's paths. The first lines of its
`MEMORY.md` go into the agent's prompt with instructions on keeping it up to date, and Read/Write/Edit are enabled so it can.

`color` tints the agent's panel row and the screen header. The screen and `/subagents` show model and effort.
`/subagents stop` and a shortcut stop everything.

## User Stories

1. As a pi user, I want `isolation: "worktree"` on an `Agent` call to run that agent in its own git worktree, so that its edits do not touch my checkout or other agents.
2. As an agent author, I want `isolation: worktree` in the agent file's frontmatter, so that every run of that agent is isolated without the caller asking.
3. As a caller, I want the call's `isolation` to win over the agent file, so that I can override a default for one run.
4. As a pi user, I want a clear error when I ask for a worktree outside a git repository, so that I do not get a silent non-isolated run.
5. As a pi user, I want local repos without a remote to work, so that isolation does not need GitHub.
6. As a pi user, I want the worktree at `<repo>/.pi/worktrees/<agentId>` on branch `pipipi/<agentId>`, so that I can find it and tell whose it is.
7. As a pi user, I want `/.pi/worktrees/` added to `.git/info/exclude`, so that worktrees never show up as untracked files.
8. As a pi user, I want the worktree based on the main checkout's HEAD, with a warning on the result when the main checkout has uncommitted changes (the agent will not see them), so that I know why the agent's view differs from mine.
9. As a pi user, I want files listed in `.worktreeinclude` copied into the worktree, so that things like `.env` are there for the agent.
10. As a pi user, I want an unchanged worktree and its branch removed when the exchange ends, so that read-only runs leave nothing behind.
11. As a pi user, I want a worktree with uncommitted files, untracked files or new commits kept, so that no work is lost.
12. As main, I want the result of an isolated run to give the worktree path, branch, changed files and commits when kept, so that I can review or merge them.
13. As a pi user, I want no automatic commit, merge or sweep, so that pi-pipipi never rewrites my history or deletes work.
14. As a pi user, I want `/subagents worktrees` to list kept worktrees (agent, branch, path, changed files, commits) and remove the ones I pick, so that I can clean up.
15. As a pi user, I want removing a worktree to warn when it has changes, so that I do not lose work by accident.
16. As a pi user, I want a resumed agent to run in its worktree again, so that its follow-up work builds on its earlier work.
17. As a pi user, I want the agent to be told its working directory is the worktree, so that its paths and shell commands land there.
18. As an agent author, I want `memory: user`, `project` or `local` to give the agent a directory at Claude Code's paths (`~/.claude/agent-memory/<name>/`, `.claude/agent-memory/<name>/`, `.claude/agent-memory-local/<name>/`), so that agent files and memories carry over from Claude Code.
19. As a pi user, I want project and local memory under the main checkout even when the agent runs in a worktree, so that memory is not lost when the worktree is removed.
20. As an agent, I want the first 200 lines or 25 KB of `MEMORY.md` in my prompt, with instructions on how to read, write and keep the memory, so that I start with what earlier runs learned.
21. As a pi user, I want Read, Write and Edit enabled automatically for an agent with memory, so that it can maintain its memory without my editing `tools`.
22. As a pi user, I want an agent whose `disallowedTools` denies Write or Edit to get read-only memory with a warning, so that my deny rule is respected.
23. As a pi user, I want the risk documented (an agent with memory writes files outside its working directory), so that I choose it knowingly.
24. As a pi user, I want the local memory directory added to `.git/info/exclude`, so that it is never committed by accident.
25. As a pi user, I want `color` in an agent file to tint that agent's panel row and the subagent screen header, so that I can tell agents apart.
26. As a pi user, I want an unknown `color` value to warn once and be ignored, so that a typo does not break the agent.
27. As a pi user, I want the subagent screen and `/subagents` to show each agent's model and effort, so that I see how it runs without opening its file.
28. As a pi user, I want `/subagents stop` to stop every running subagent and background script of this session, so that I can cancel delegated work with one command.
29. As a pi user, I want a shortcut for the same, so that I can do it without typing.
30. As someone porting pi-pipipi, I want the porting guide to cover the git commands, memory paths and prompt additions these features rely on, so that I know what my agent must support.

## Implementation Decisions

Worktree isolation

- A new module owns worktrees: create, inspect (changed or not), remove, list. It shells out to `git` only (no library).
  `isolation` is a real `Agent` parameter (`"worktree"`); any other value is a caller error naming the value. The agent
  file field `isolation` is parsed into `AgentDefinition` and removed from the inert list.
- Effective isolation: the call's value if given, else the agent file's. A resume uses the stored record (below) and
  ignores both.
- Not a git repository (`git rev-parse --show-toplevel` fails in the parent's cwd): the call throws before anything
  starts. The repo root is the main checkout.
- Creation: `git worktree add -b pipipi/<agentId> <root>/.pi/worktrees/<agentId> HEAD`. Before the first one,
  `/.pi/worktrees/` is appended to `<git-dir>/info/exclude` if absent (the path from `git rev-parse --git-path
  info/exclude`, so it also works when the main checkout is itself a linked worktree). A dirty main checkout adds a warning to the result.
- `.worktreeinclude` at the main checkout root lists files to copy (rules in Resolved questions 3); copied after creation.
- The child's `cwd`, and the "Working directory:" line in its prompt, are the worktree path. Its session dir stays in the
  parent's `subagents/<parent session id>/`.
- The base commit and the worktree path are stored in the agent's meta file, next to `agentType`.
- End of each exchange (completed, partial, failed or stopped alike): changed = `git status --porcelain` non-empty or
  `HEAD` differs from the stored base commit. Unchanged: `git worktree remove` and `git branch -D`. Changed: kept.
  Removal and inspection run after the child has exited.
- Output schema gains an optional `worktree`: `{ path, branch, changed, files, commits }`. The background end message
  includes it for agents that kept one. `changed` false means it was removed (the field then carries only that).
- Resume: the stored path is used as the child's cwd. If the worktree no longer exists (it was unchanged and removed, or
  the user removed it), see Resolved questions 1.
- `/subagents worktrees`: lists `pipipi/*` worktrees under the main checkout from `git worktree list --porcelain`
  (agent id, branch, path, change summary) and offers removal of a picked one through `ctx.ui.select` and a confirm;
  removing one with changes names what would be lost. Removal runs `git worktree remove --force` and `git branch -D`.
- Creation and removal for one repo are serialised (git's own lock would otherwise fail concurrent `worktree add` calls).

Memory

- `memory` is parsed into `AgentDefinition` (`"user" | "project" | "local"`; other values skip the file like other
  wrong-typed fields) and removed from the inert list.
- Directories: user `~/.claude/agent-memory/<name>/`; project `<main checkout>/.claude/agent-memory/<name>/`; local
  `<main checkout>/.claude/agent-memory-local/<name>/`, `<name>` being the agent's `name` field. "Main checkout" is the
  git root of the parent's cwd, never a worktree. Created on start; the file the agent keeps is `MEMORY.md`.
- Prompt: after the agent's own prompt and skills, a "# Persistent memory" section with our instructions (where the
  directory is, what to save, how to keep `MEMORY.md` a short index, to update rather than duplicate) followed by the
  first 200 lines or 25 KB of `MEMORY.md`, whichever comes first, with a note when truncated.
- Tools: Read, Write and Edit (mapped through `toolMap`) are added to the child's tools unless already available. If
  `disallowedTools` names Write or Edit, they stay denied, the memory is read-only (the prompt says so) and a warning is
  added to the result.
- `local` scope appends its directory to `<git-dir>/info/exclude`. Project scope is meant to be committed.
- A resume rebuilds the prompt, so it reads the current `MEMORY.md`.

Polish

- `color` is parsed into `AgentDefinition` and removed from the inert list. Known values map to a terminal colour (see
  Resolved questions 6). The panel tints the agent's label on its row and the screen header tints the label; status icon and
  text keep their status colours.
- The subagent screen header and the `/subagents` picker lines show model and effort (the record already has both).
- `/subagents stop` stops every running subagent and every background script of this session through the existing
  registry stop paths; a notice says how many. The shortcut: Resolved questions 7.

Config and docs

- No new settings.
- README: sections "Worktree isolation" and "Agent memory" (including the risk), `color` and `/subagents` changes. The
  inert-field list drops `isolation`, `memory`, `color`. Porting guide: the git commands used, `info/exclude`, memory
  paths, prompt additions.

## Testing Decisions

- Real pi and real Claude Haiku 5.5, as in v2/v3a; fake pi only for faults (for example `git` failing).
- Worktree and memory behaviour that involves a child runs through the in-process tool seam (`test/real/helpers.ts`:
  temp git repo, temp HOME, temp agent dir): prompts with one clear answer ("create file x.txt containing y", "answer
  with the first word of your memory"). Assertions are on the git state (worktrees, branches, exclude file), files, and
  result fields, never on wording.
- The worktree module's git operations also get direct tests on temp repos with no model (create, changed detection for
  each of the four cases, remove, list, non-repo error, exclude idempotence, `.worktreeinclude`).
- Prompt-building for memory (line and byte truncation, read-only variant) is tested without a model on `resolveChild`;
  one real test proves an agent reads and then writes its memory.
- The parent rpc seam (`test/parent`) covers one end-to-end case: main delegates an isolated edit and the result carries the
  worktree fields; and `/subagents stop` while a background script runs.
- The pty seam covers what only a terminal shows: colour on panel rows and screen header (via the cell attributes of the
  headless xterm), model and effort on the screen, `/subagents worktrees`, the stop shortcut.
- Never run `npm test` (or another test command) from inside a test.
- Prior art: `test/real/helpers.ts`, `test/parent/helpers.ts` (`startParent`), `test/tui/harness.ts`, `test/panel/`,
  `evals/harness.ts`.
- Evals gain an isolation case and a memory case; README numbers updated.

## Out of Scope

- Auto-commit, merge, push, PR creation or sweeping of worktrees; deleting branches the user created.
- Memory outside Claude Code's three directories; memory for the main agent; memory search or compaction.
- Remote or non-git isolation (no `isolation: remote`).
- Colour themes, user-defined colours.
- Worktrees for children of children (children have no Agent tool).

## Resolved questions

Answered by the owner on 2026-11-08: every recommendation below is accepted as the decision.

1. Resume of an agent whose unchanged worktree was removed. The decisions say a resume re-enters its worktree, but an
   unchanged one is removed after each exchange. Decided: recreate it at the same path and branch name from the current
   HEAD of the main checkout (the stored base commit is updated); if the user removed a changed one, throw naming the path.
2. Isolation value on a resume. Decided: the stored one wins, the call's `isolation` is ignored with a warning.
3. `.worktreeinclude` rules. Decided: Claude Code's: gitignore syntax, and only files that match both a pattern and
   `.gitignore` are copied (so tracked files are never duplicated); directories are copied recursively; missing file means nothing to copy.
4. Memory scopes outside a git repo. Decided: `project` and `local` use the parent's cwd as the "main checkout"
   (no `info/exclude` write); `user` is unaffected.
5. Memory directory name when the agent has no usable name for a path (not possible for parsed agents, whose `name` is
   required). Decided: nothing to decide; noted only so the ticket does not invent a fallback.
6. `color` palette. Decided: Claude Code's names (red, blue, green, yellow, purple, orange, pink, cyan) mapped to
   fixed 256-colour escapes, because pi's theme only exposes its own named colours; any other value warns once.
7. The stop-all shortcut. Decided: `shift+x` while the panel is focused (the panel already owns `x` for one row), plus
   `/subagents stop` anywhere; no global key, to avoid clashing with pi's bindings.
8. Does `/subagents stop` also stop background scripts? Decided: yes (stopping a script's agents alone would leave
   scripts running to a failed end); the notice counts both.
9. Cleanup when the session ends or reloads while an exchange is running. Decided: the stop path (agents marked stopped)
   runs the same end-of-exchange check, so unchanged worktrees are removed and changed ones kept.
10. Where `/subagents worktrees` looks. Decided: the main checkout of the current cwd only, not other repos.

## Further Notes

- The base commit is `HEAD` at creation. A kept branch therefore starts where the main checkout was, and the user merges
  it with plain git.
- A kept worktree's agent id is also its branch suffix, so `resume` plus `git log pipipi/<agentId>` is the whole story.
- The memory risk to document: an agent with memory gets Write/Edit and writes outside its working directory (user
  scope: into the home directory); project memory is meant to be committed and reviewed like code.
- The first worktree ticket should verify on real git: `worktree add` from a repo that is itself a linked worktree, a
  repo with no commits (HEAD does not resolve: caller error), and a repo with submodules (ignored, noted).
