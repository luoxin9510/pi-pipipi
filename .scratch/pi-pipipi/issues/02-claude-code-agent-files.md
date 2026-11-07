# 02: Load Claude Code agent files

**What to build:** agents are discovered from project `.pi/agents` and `.claude/agents` (cwd up to the repo root, closest first), `~/.pi/agent/agents`, `~/.claude/agents` and the built-ins (Explore, Plan, general-purpose), and a call with `subagent_type` runs the right one. Bad files are skipped with warnings shown at session start. The tool description lists the agents.

**Blocked by:** 01

**Status:** closed (done 2026-11-07)

- [x] Precedence across the five sources; folders are scanned recursively; the repo root bounds the walk; without a repo only cwd is scanned
- [x] Every skip reason from the spec produces a warning naming the file and the reason; comma and list forms of `tools` both work
- [x] Unsupported Claude Code fields produce a "has no effect" warning; other unknown keys are ignored
- [x] Two files with the same name in one folder: the first in sorted path order wins, with a warning
- [x] A user file overrides a built-in of the same name; definitions are re-read on every call
- [x] The code-reviewer example from the Claude Code docs loads with no warnings
- [x] An unknown `subagent_type` throws and lists the available agents
