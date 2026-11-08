# 04: Subagent registry and `/subagents`

**What to build:** pi-pipipi keeps a registry of the session's subagents (type, description, status, turns, last tool, usage, times). `/subagents` lists them all, newest first, including old ones after `/reload` or a resumed parent session. An in-memory parent shows a "cannot view" notice.

**Blocked by:** 02

**Status:** closed (done 2026-11-08)

- [x] The agent meta file next to each child session holds type, description, model, thinking, status, turns, usage and times; it is written at start and updated at the end of each exchange; v1 meta files (type only) still load
- [x] The registry is rebuilt from meta files on session start and updated live from runs
- [x] `/subagents` shows a picker of every subagent of this session with its status (opening comes in 06)
- [x] In-memory parent: `/subagents` shows the notice; the Agent tool works as before

Done: `src/registry.ts` (process-wide `registry`: `list(parentSessionId)` newest first, `get`, `handle(id)` for the live child, `subscribe`, `rebuild(parent)`, `begin/attach/progress/finish` used by the Agent tool, `clear()` for tests), `src/subagents-command.ts`, wiring in `index.ts` and `agent-tool.ts`. Meta file: v1 `agentType` key kept, plus description, model, thinking, status, turns, lastTool, usage, startedAt, endedAt; written at start, rewritten at the end of every exchange (turns and usage add up over resumes). v1 files load as completed with startedAt from the file mtime; a `running` file with no live child loads as `stopped`. A caller abort ends the record as `stopped`. Tests: `test/real/10-registry.test.ts` (4). Full suite 77/77, about 35 s, real part about $0.018.
