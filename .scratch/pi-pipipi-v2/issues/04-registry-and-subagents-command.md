# 04: Subagent registry and `/subagents`

**What to build:** pi-pipipi keeps a registry of the session's subagents (type, description, status, turns, last tool, usage, times). `/subagents` lists them all, newest first, including old ones after `/reload` or a resumed parent session. An in-memory parent shows a "cannot view" notice.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The agent meta file next to each child session holds type, description, model, thinking, status, turns, usage and times; it is written at start and updated at the end of each exchange; v1 meta files (type only) still load
- [ ] The registry is rebuilt from meta files on session start and updated live from runs
- [ ] `/subagents` shows a picker of every subagent of this session with its status (opening comes in 06)
- [ ] In-memory parent: `/subagents` shows the notice; the Agent tool works as before
