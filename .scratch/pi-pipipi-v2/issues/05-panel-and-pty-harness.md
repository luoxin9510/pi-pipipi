# 05: The subagent panel below the editor

**What to build:** a panel below the editor shows one live row per subagent (type, description, status, turns, last tool, cost), as in Claude Code. Running rows stay, finished rows drop out after 30 s, failed/stopped are marked, and the panel hides when empty. ↓ on an empty editor focuses it; ↑/↓ move; Esc or ↑ above the first row returns focus.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] A pty test harness drives real interactive pi (parent on haiku, this checkout loaded) and reads the screen, waiting for text with timeouts
- [ ] The panel appears when a script starts subagents and its rows update while they run
- [ ] Finished rows disappear 30 s after they end; the panel hides when empty
- [ ] Focus moves into and out of the panel as described; keys are consumed only while it has focus
