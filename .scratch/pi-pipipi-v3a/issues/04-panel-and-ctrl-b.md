# 04: Script rows in the panel, `x` on a script, ctrl+b

**What to build:** the panel shows each background script as a row (id, state, agents running, elapsed, cost) with its agents indented below; finished script rows linger like agent rows; `x` on a script row stops the script and its agents, on an agent row only that agent. ctrl+b with an empty editor while a foreground script runs moves it to the background; otherwise ctrl+b stays cursor-left.

**Blocked by:** 03

**Status:** closed (done 2026-11-08)

- [x] Script rows and indented agent rows; linger; markers
- [x] `x` on a script row vs an agent row
- [x] ctrl+b: empty editor + foreground script → background (consumed); text in the editor or no script → passes through; key releases ignored
- [x] Panel unit tests and pty tests; full `npm test` green

## Comments

2026-11-08 (implementer): built on ticket 03.
- Panel rows (src/panel.ts): a script row (`● background · script S1 · N agents running · 12s · $cost`, cost summed from its agents) for every script of the session that is running or ended less than lingerMs ago, its visible agents indented below; agents in no shown script stay top-level. Groups ordered by start time. Header: `Subagents (n agents) · Scripts (k)`. A foreground script (no agent yet) also gets a row. The panel redraws each second while a script runs (elapsed). Failed/stopped markers reuse the agent icons.
- Selection runs over all rows; the script row now comes first, so existing TUI tests press `down` twice to reach the first agent. `x` on a script row = `scripts.stop(id)`; on an agent row only `registry.stop`. Enter on a script row does nothing (no screen for scripts).
- ctrl+b: `scripts.background(id)` / `scripts.backgroundAll(sessionId)` in src/background.ts call the existing mover (the wrapper's race). `Panel.handleKey` consumes ctrl+b when the editor is empty and a foreground script of the session moved, focus or not; otherwise it passes through. Releases are ignored. The call result text still says "it started a subagent" even for a ctrl+b move.
- Tests: test/panel/scripts.test.ts (stand-in move/stop callbacks on the real script registry), test/tui/10-script-panel.test.ts (codemode sandbox has no setTimeout; use `tools.bash({command:"sleep 25"})` for a slow agent-less script).
