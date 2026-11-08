# 10: Docs and a look at the TUI

**What to build:** README and AGENTS.md describe v2 (panel, subagent screen, talking, stop, `/model`, codemode-only, `childCodemode`, `codemode: false`, MCP exclusion, rpc children, test setup). The owner looks at the panel and the subagent screen in a real session and says whether they look right.

**Blocked by:** 08, 09

**Status:** ready-for-human

- [x] README and AGENTS.md updated; the v1 `@file` note removed
- [ ] The owner has tried the panel and the subagent screen and recorded the result in Comments

## Comments

2026-11-08: docs done (README sections "Watching and talking to subagents", "Codemode-only children", "MCP", "Limits and memory", Development; AGENTS.md layout; `.scratch/pi-pipipi-v2/handoff.md`). Waiting for the owner's look check. Steps to try:

1. In a git repo with some files, start `pi -e <path to pi-pipipi>/src/index.ts --tools +codemode` (or the installed package).
2. Ask it to run a codemode script that starts 2-3 subagents with `Promise.all`, work that takes 10+ s (e.g. `Explore` agents each reading several files, or a `general-purpose` agent that runs `sleep 8` first).
3. While they run, check the panel below the editor: header `Subagents (N)`, one row each (marker, type(description), turns, last tool, cost).
4. With the editor empty press `↓`: the first row is selected (`▸`); `↓`/`↑` move; `Esc` returns to the editor.
5. Select a running row and press `Enter`: the full-screen subagent screen opens; check the header (back hint, name, status, main idle/running) and that the transcript grows.
6. Scroll with `PgUp`/`PgDn`/`Home`/`End`.
7. Type a steer (e.g. "also report how many files you read") and `Enter`; the hint says it was sent and the subagent changes course.
8. Type `/model`: a list appears on the screen; choose another model with `↑↓` and `Enter`; also try `/model nonsense/x` (unknown model).
9. Try `/nonsense` (not available) and `/main` (back to main; main kept running meanwhile).
10. In the panel select a running row and press `x`: the row turns `■ stopped`, and the script finishes with `error: "stopped by user"`.
11. After the script ends wait 30 s: finished rows drop out. Run `/subagents`, pick a finished one, type a follow-up: it continues and streams a reply; main gets a note.
12. Note anything that looks wrong (layout, colours, key conflicts, flicker) in a comment here, then set Status to closed.
