# 07: Child sessions and resume

**What to build:** with a persisted parent session, children are stored under `subagents/<parent session id>/` and can be resumed by agentId; the agent type of the first run is remembered.

**Blocked by:** 02

**Status:** closed (done 2026-11-07)

- [x] First run: `--session-dir <parent dir>/subagents/<parent id> --session-id <agentId>` and `<agentId>.json` with the agent type
- [x] Resume without `subagent_type` reuses the stored type, agentId and session flags
- [x] Resume with a different `subagent_type`, an unknown id, or an invalid id throws
- [x] In-memory parent: children get `--no-session`, and resume throws
