# 05: The subagent panel below the editor

**What to build:** a panel below the editor shows one live row per subagent (type, description, status, turns, last tool, cost), as in Claude Code. Running rows stay, finished rows drop out after 30 s, failed/stopped are marked, and the panel hides when empty. ↓ on an empty editor focuses it; ↑/↓ move; Esc or ↑ above the first row returns focus.

**Blocked by:** 04

**Status:** closed (done 2026-11-08)

- [x] A pty test harness drives real interactive pi (parent on haiku, this checkout loaded) and reads the screen, waiting for text with timeouts
- [x] The panel appears when a script starts subagents and its rows update while they run
- [x] Finished rows disappear 30 s after they end; the panel hides when empty
- [x] Focus moves into and out of the panel as described; keys are consumed only while it has focus

Done: `src/panel.ts` (`Panel` class + `installPanel(ctx)`, called from `session_start` when `ctx.hasUI`), `test/tui/harness.ts`, `test/tui/05-panel.test.ts` (1 pty test, about 31 s), `test/panel/panel.test.ts` (3 fast tests, no pi). `npm test` runs both; `npm run test:tui` / `test:panel` alone. Full suite 81/81, about 40 s wall (files run in parallel), real part about $0.015 plus about $0.01 for the pty test (parent + 2 haiku children).
- Panel: widget key `pipipi-panel`, belowEditor, rows oldest first (ties keep call order). Row: `<icon> <status> · type(desc) · N turns · lastTool · $cost`; failed ✗ (error colour), stopped ■ and partial ◐ (warning), completed ✓, running ●. Selected row: `▸` marker plus `selectedBg`. Header `Subagents (N)`, focus hint line `↑↓ select · enter open · esc back to editor`. Hidden (renders no lines) when empty. Enter only notifies for now (06 replaces the `open` callback in `installPanel`).
- Linger: 30 s, `PIPIPI_PANEL_LINGER_MS` env overrides it (test-only, not a setting). The panel sets one timer for the next expiry and requests a redraw.
- Key hook: `ctx.ui.onTerminalInput`. Keys are only touched when the editor is the focused TUI component (checked through `tui.focusedComponent` having `getText`; a `/subagents` picker or other dialog keeps its own keys) and, to enter, `ctx.ui.getEditorText() === ""`. While the panel has focus it consumes every key, including typing. `x` (stop) is not wired yet (08).
- Stub contexts in `test/real/helpers.ts`, `test/helpers.ts`, `evals/harness.ts` now provide `ui.setWidget` and `ui.onTerminalInput` no-ops, since `hasUI` is true there.
- Harness (`test/tui/harness.ts`): `new PiTerminal({cols,rows,env,args})` or `withPi(opts, async (pi) => ...)` (always kills in `finally`). Methods: `type(text)`, `press("down"|"up"|"left"|"right"|"enter"|"esc"|"ctrlC")`, `submit(text)`, `waitFor(string|RegExp|(viewport)=>bool, timeoutMs=60000)` (polls every 50 ms, throws with the screen on timeout or if pi exited), `waitGone(...)`, `viewport()` (visible rows), `screen()` (with scrollback), `kill()`. Fields `repo`, `root`, `sessionDir` (parent session persisted there). It chmods node-pty's `spawn-helper` itself on import. Kill takes the whole process group (pi plus subagents).
- Harness notes for 06-08: write assertions on text only the new UI draws (the transcript echoes the codemode script with quotes, so `● running · general-purpose(sleepy one)` is panel-only). The editor line sits at column 0 (messages are indented one space). Timing: make the first subagent long enough (here sleep 9, linger 4 s) that the focus steps finish before it ends; a too-short task makes the row vanish before you look. Selection highlight is a background colour, invisible in text; the test relies on the `▸` marker (unit test checks the `selectedBg` call). One pty test per file is enough; each costs about 30 s and a cent.
