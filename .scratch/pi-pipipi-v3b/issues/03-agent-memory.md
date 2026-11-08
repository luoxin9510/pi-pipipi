# 03: Agent memory

**What to build:** `memory: user|project|local` in an agent file gives the agent Claude Code's memory directory; the head of its `MEMORY.md` is in its prompt with our instructions, and it can write to it.

**Blocked by:** None (can start immediately; independent of the worktree tickets, though it must use the main checkout, not a worktree, once 01 is in)

**Status:** ready-for-agent

Needs the owner's answer to spec Open question 4 (memory scopes outside a git repo).

- [ ] `memory` parsed into `AgentDefinition` (wrong value skips the file with a reason) and dropped from the inert list (definition tests)
- [ ] Directories per scope (`~/.claude/agent-memory/<name>/`, `<main checkout>/.claude/agent-memory/<name>/`, `<main checkout>/.claude/agent-memory-local/<name>/`), created on start; the main checkout is the git root of the parent's cwd, never a worktree
- [ ] Prompt section "Persistent memory": our instructions plus the first 200 lines or 25 KB of `MEMORY.md` (whichever first) with a truncation note; `resolveChild` tests with no model for: no file, short file, over 200 lines, over 25 KB, multibyte text at the byte limit
- [ ] Read/Write/Edit are enabled automatically (through `toolMap`) when the agent's tools exclude them; if `disallowedTools` denies Write or Edit the memory is read-only, the prompt says so and the result carries a warning (tests with no model)
- [ ] Local scope appends its directory to `info/exclude` once
- [ ] Real haiku tests (in-process): an agent with project memory reads a fact planted in `MEMORY.md` and answers with it; a second run writes a new note into the directory and a later run sees it; a read-only agent cannot change the file
- [ ] The memory risk is written in the README section (also covered by ticket 05)
