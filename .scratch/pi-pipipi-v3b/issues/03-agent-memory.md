# 03: Agent memory

**What to build:** `memory: user|project|local` in an agent file gives the agent Claude Code's memory directory; the head of its `MEMORY.md` is in its prompt with our instructions, and it can write to it.

**Blocked by:** None (can start immediately; independent of the worktree tickets, though it must use the main checkout, not a worktree, once 01 is in)

**Status:** closed (done 2026-11-08)

Open question 4 answered: outside a git repo, project/local use the parent's cwd; no info/exclude.

- [x] `memory` parsed into `AgentDefinition` (wrong value skips the file with a reason) and dropped from the inert list (definition tests)
- [x] Directories per scope (`~/.claude/agent-memory/<name>/`, `<main checkout>/.claude/agent-memory/<name>/`, `<main checkout>/.claude/agent-memory-local/<name>/`), created on start; the main checkout is the git root of the parent's cwd, never a worktree
- [x] Prompt section "Persistent memory": our instructions plus the first 200 lines or 25 KB of `MEMORY.md` (whichever first) with a truncation note; `resolveChild` tests with no model for: no file, short file, over 200 lines, over 25 KB, multibyte text at the byte limit
- [x] Read/Write/Edit are enabled automatically (through `toolMap`) when the agent's tools exclude them; if `disallowedTools` denies Write or Edit the memory is read-only, the prompt says so and the result carries a warning (tests with no model)
- [x] Local scope appends its directory to `info/exclude` once
- [x] Real haiku tests (in-process): an agent with project memory reads a fact planted in `MEMORY.md` and answers with it; a second run writes a new note into the directory and a later run sees it; a read-only agent cannot change the file
- [x] The memory risk is written in the README section (also covered by ticket 05)

## Comments

Decisions: the user scope base is `ResolveOptions.claudeDir` (default `~/.claude`); `memoryRoot` is the repository root of the parent cwd, computed in `executeAgent` (new `gitRoot`; `addExclude` generalised from the worktree exclude helper in `worktree.ts`). Directories are created in `resolveChild`. 25 KB is 25000 bytes; lines are cut first, then bytes, dropping a cut multibyte character whole. The local exclude line is the agent's own directory `/.claude/agent-memory-local/<name>/`. Read-only means Write or Edit denied (either); then only Read is added to a `tools` list. A name with a path separator throws when memory is used. Without `tools` nothing is added (default tools assumed to include Read/Write/Edit). Tests: `test/memory/` (resolveChild and the tool on fake pi, no model, temp dirs and HOME) and `test/real/14-memory.test.ts` (haiku, 3 tests). `npm run test:memory`.
