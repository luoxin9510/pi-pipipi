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

2026-11-08 Review fixes (branch v2-review-fixes), from the code review of the v2 branch and the owner's two decisions
(no `main` row in the panel: back hint, Esc and /main; the subagent screen streams live):

- Streaming: the runner passes every rpc event to the registry (`registry.event/watch/streaming`, `src/live.ts` rebuilds the
  message being written from `message_update` deltas). The subagent screen draws it token by token (text, thinking, a tool
  call once complete). The session file is read when the screen opens and when the child reports a non-delta event or the
  status changes; the 300 ms readdir/stat timer is gone. pty test `test/tui/09-streaming.test.ts` (real haiku, 150-line reply).
- Bugs: panel passes unused keys (ctrl+c, ctrl+d, text) through and gives the focus back; `turn()` removes its abort listener;
  `set_model` ids from a counter; a run that finishes before the abort lands is no longer "stopped" (the child's `aborted`
  flag decides, `RunResult.aborted`), `abortChild` asks once so the grace period cannot move; `busy()` is exact;
  only a caller abort marks an exchange stopped, other failures are failed; the panel is disposed explicitly when a
  session installs it again; the in-memory parent panel lists no rows and shows a notice; dead `running` meta files get an
  `endedAt` (file mtime); rows rebuilt from disk never show in the panel (only subagents that ran in this process linger);
  a corrupt meta file is skipped with a warning at session start; note delivery and the screens use the latest context
  (`agent_start`/`agent_end`/`session_start` refresh it).
- Standards: no `PIPIPI_PANEL_LINGER_MS` env seam, the linger is the setting `pipipi.panelLingerMs` (the pty harness writes it);
  `LINGER_MS` export gone; no `stdin.writable` guards (explicit `finished`/`settled` state); `registry.stopRequested` is
  used, not discarded; `ModelChoice` is a plain function; `=new Set` formatting; AGENTS.md layout and the two test helper
  files explained.
- Smells done: ICONS/COLORS keyed by `SubagentStatus` and one `label()` in `registry.ts`; `Panel.rows()` logic moved to
  `registry.visible()`; `exchange.ts` names (`host`, `userSteers`), `talkConfig` middle man removed; `submit()` splits once.
- Smells skipped: moving the semaphore out of `exchange.ts` (documented in AGENTS.md instead; only exchanges use it).

2026-11-08 (owner look check, round 1): the panel and screen show; but ↓ could not select the first row, only the second. Cause: kitty-protocol terminals send a key release after each press, and pi passes releases to input listeners (not to components); the release of the focusing ↓ moved the selection. Fixed in e9dc05d (releases ignored, swallowed while focused), unit + pty test (press + release). Waiting for the owner to retry.
