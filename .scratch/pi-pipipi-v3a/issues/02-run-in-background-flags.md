# 02: `run_in_background: false` and `true`

**What to build:** `run_in_background: false` on an `Agent` call pins its script to the foreground (main waits, as in v2). `true` makes that call return `status: "running"` with its `agentId` at once, so the script does not wait; when the agent ends, main gets its own message (output, status, cost).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `false` pins the script (later calls do not move it); the codemode call returns the script's own result
- [ ] `true` returns a running result at once; the agent finishes on its own; main gets a message when it ends
- [ ] The Agent tool's `run_in_background` parameter and tool description explain the three cases
- [ ] Real-parent tests for both; full `npm test` green
