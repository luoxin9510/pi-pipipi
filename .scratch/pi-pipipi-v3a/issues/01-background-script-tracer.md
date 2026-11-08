# 01: Background script tracer bullet

**What to build:** in a real pi session with pi-pipipi, a codemode script that starts a subagent moves to the background: the codemode call returns at once with a short "moved to the background (id S1)" result, main's turn ends while the agent runs, and when the script ends main receives a message with its return value that starts a new turn.

**Blocked by:** None (can start immediately)

**Status:** closed (done 2026-11-08)

- [x] First verified on real pi and recorded in Comments + the shared notes: nested tool call ids carry the codemode call id as prefix; a background script keeps calling tools while main runs another turn; the built-in codemode is replaced without a breaking diagnostic; renderCall/renderResult and codemode store entries still work through the wrapper
- [x] The wrapper registers `codemode` in parents (not children) from pi's exported factory with default options; the user's codemode settings still apply
- [x] A background script registry (S1, S2, …; state; agents; session) with subscribe, beside the subagent registry
- [x] The first `Agent` call in a foreground script moves it to the background; the codemode call returns the background result; the script keeps awaiting its agents
- [x] On script end: message with the return value and its agents (id, type, status, cost); `triggerTurn` when main is idle, steer when running
- [x] A new real-parent rpc test seam (temp agent dir, haiku, this checkout) and tests for the above; full `npm test` green

## Comments

2026-11-08 (implementer): the four facts verified on real pi + haiku (details in `~/Developer/pi-pipipi-notes/pi-1.5.0-facts.md`, "Background scripts (verified)"):
1. nested ids are `<codemode id>/<n>` and the rpc events carry `parentToolCallId`; 2. a background script's nested tools (Agent, bash) ran after main settled and while main ran its own `bash sleep 16`; 3. the built-in codemode is replaced with one stderr warning, no extension error; 4. renderCall/renderResult survive the spread, and `store()` entries are still appended (at script end, after the early return).
Built: `src/background.ts` (wrapper + script registry), hooks in `src/agent-tool.ts` and `src/index.ts`, seam `test/parent/` (`npm run test:parent`, part of `npm test`). Not done here (later tickets): `backgroundScripts` config key, `run_in_background` rules, 8 KB truncation, panel rows/`x`, ctrl+b, stop on session end.
