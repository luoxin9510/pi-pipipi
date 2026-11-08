# 06: Subagent screen: viewing

**What to build:** Enter on a panel row, or choosing one in `/subagents`, switches the TUI to a full-screen subagent screen: `main › type(description)` and main's state at the top, the transcript drawn with pi's own message components (codemode scripts and nested calls included), growing live while the subagent runs, scrollable. `/main` or the `main` row goes back. Main keeps running throughout; pi's `switchSession` is never used.

**Blocked by:** 05

**Status:** closed (done 2026-11-08)

- [x] Opening a running subagent while main runs shows its transcript growing; main's run is not interrupted (pty test)
- [x] Opening a finished subagent shows its full transcript from the session file
- [x] Scrolling reaches earlier turns
- [x] `/main` and the `main` row return to main; other slash commands say they are not available here

## Comments

2026-11-08: done. `src/subagent-screen.ts`: `openSubagentScreen(ctx, record)` mounts `SubagentScreen` with `ctx.ui.custom(..., { overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left" } })`; the component renders exactly `tui.terminal.rows` lines, so it covers the terminal while main's TUI and run continue underneath (no switchSession). Leaving: Esc or `/main` calls `done()`. Deviation from spec story 18: no `main` row (the overlay covers the panel); instead the header shows a visible `‹ main (esc or /main)` back hint, and Esc or `/main` leave. Main state: `ctx.isIdle()` of the session_start context, re-read on every render (a 300 ms timer re-renders). Live transcript: each render stats the child's `<sessionDir>/<ts>_<id>.jsonl` and, when size/mtime changed, re-parses it (`parseSessionEntries` + `buildSessionContext`) into pi's UserMessageComponent / AssistantMessageComponent / ToolExecutionComponent (expanded). Tool calls use a small own `renderCall` (name + args, strings raw) because pi's registered renderers are not reachable and its default prints a codemode script as one JSON line. Session file is written per finished message, so growth is per message, not per token. Scroll: PgUp/PgDn, Up/Down, Home/End (Up/Down always scroll; the input line is single line). Input line: `/main` leaves, other `/x` shows a notice, plain text shows "not available yet" (ticket 07 replaces it). Tests: test/panel/screen.test.ts (3, fast), test/tui/06-screen.test.ts (2, pty, haiku, ~26 s).
