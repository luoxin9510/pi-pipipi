# 02: `run_in_background: false` and `true`

**What to build:** `run_in_background: false` on an `Agent` call pins its script to the foreground (main waits, as in v2). `true` makes that call return `status: "running"` with its `agentId` at once, so the script does not wait; when the agent ends, main gets its own message (output, status, cost).

**Blocked by:** 01

**Status:** closed (done 2026-11-08)

- [x] `false` pins the script (later calls do not move it); the codemode call returns the script's own result
- [x] `true` returns a running result at once; the agent finishes on its own; main gets a message when it ends
- [x] The Agent tool's `run_in_background` parameter and tool description explain the three cases
- [x] Real-parent tests for both; full `npm test` green

## Comments

2026-11-08 (implementer): `scripts.agentStarting(id, flag)` pins on `false` (script.pinned), leaves the script alone on `true`, moves on omitted. `true`: Agent runs `executeAgent` with its own AbortController (not the call's signal), `started` callback hands back the resolved spec synchronously, result is `status: "running"` (schema enum extended), end message `Background agent <id> <type> <status> ($cost)` + `Output:` plain-cut at 8000 chars (ticket 03 refines), delivered like script messages. A `true` agent is not stopped when the session ends (ticket on stop). Old test that expected a run_in_background warning updated. Tests: test/parent/02-run-in-background.test.ts.
