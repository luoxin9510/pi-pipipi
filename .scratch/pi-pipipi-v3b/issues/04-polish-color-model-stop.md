# 04: Colour, model and effort display, stop all

**What to build:** `color` tints an agent's panel row and screen header; the screen and `/subagents` show model and effort; `/subagents stop` and a shortcut stop everything in the session.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec Resolved questions apply (answered 2026-11-08).

- [ ] `color` parsed into `AgentDefinition` and dropped from the inert list; an unknown value warns once and is ignored (definition tests)
- [ ] Panel rows tint the agent label by colour, status icon and text keep status colours; the screen header tints the label (panel-seam tests on rendered lines, no pi)
- [ ] The subagent screen header and the `/subagents` picker show model and effort (panel-seam tests; older meta files without a model show nothing instead of a blank)
- [ ] `/subagents stop` stops every running subagent (and background scripts, per the owner's answer) through the existing registry stop paths and notifies with the counts; with nothing running it says so
- [ ] The shortcut is wired in the panel's key handling and listed in the panel's hint line; other keys still pass through
- [ ] Real haiku tests: two slow agents running, `/subagents stop` (rpc parent seam, command via the rpc `prompt` of a slash command) leaves both `stopped` and resumable
- [ ] pty test: coloured rows (cell attributes), model and effort on the screen, the shortcut stops running agents
