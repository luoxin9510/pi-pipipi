# 01: Background script tracer bullet

**What to build:** in a real pi session with pi-pipipi, a codemode script that starts a subagent moves to the background: the codemode call returns at once with a short "moved to the background (id S1)" result, main's turn ends while the agent runs, and when the script ends main receives a message with its return value that starts a new turn.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] First verified on real pi and recorded in Comments + the shared notes: nested tool call ids carry the codemode call id as prefix; a background script keeps calling tools while main runs another turn; the built-in codemode is replaced without a breaking diagnostic; renderCall/renderResult and codemode store entries still work through the wrapper
- [ ] The wrapper registers `codemode` in parents (not children) from pi's exported factory with default options; the user's codemode settings still apply
- [ ] A background script registry (S1, S2, …; state; agents; session) with subscribe, beside the subagent registry
- [ ] The first `Agent` call in a foreground script moves it to the background; the codemode call returns the background result; the script keeps awaiting its agents
- [ ] On script end: message with the return value and its agents (id, type, status, cost); `triggerTurn` when main is idle, steer when running
- [ ] A new real-parent rpc test seam (temp agent dir, haiku, this checkout) and tests for the above; full `npm test` green
