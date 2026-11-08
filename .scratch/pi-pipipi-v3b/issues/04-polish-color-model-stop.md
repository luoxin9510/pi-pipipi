# 04: Colour, model and effort display, stop all

**What to build:** `color` tints an agent's panel row and screen header; the screen and `/subagents` show model and effort; `/subagents stop` and a shortcut stop everything in the session.

**Blocked by:** None (can start immediately)

**Status:** closed (done 2026-11-08)

Spec Resolved questions apply (answered 2026-11-08).

- [x] `color` parsed into `AgentDefinition` and dropped from the inert list; an unknown value warns once and is ignored (definition tests)
- [x] Panel rows tint the agent label by colour, status icon and text keep status colours; the screen header tints the label (panel-seam tests on rendered lines, no pi)
- [x] The subagent screen header and the `/subagents` picker show model and effort (panel-seam tests; older meta files without a model show nothing instead of a blank)
- [x] `/subagents stop` stops every running subagent (and background scripts, per the owner's answer) through the existing registry stop paths and notifies with the counts; with nothing running it says so
- [x] The shortcut is wired in the panel's key handling and listed in the panel's hint line; other keys still pass through
- [x] Real haiku tests: two slow agents running, `/subagents stop` (rpc parent seam, command via the rpc `prompt` of a slash command) leaves both `stopped` and resumable
- [x] pty test: coloured rows (cell attributes), model and effort on the screen, the shortcut stops running agents

## Comments

- 2026-11-08: Done. `color` is parsed into `AgentDefinition` (`color?`, plus a new `warnings` list for non-fatal problems; an
  unknown colour warns once at discovery, `color` left the inert list). Palette in `src/color.ts`. The colour name travels on
  the registry record (and meta file), so resumes and `/reload` keep it.
- Stop-all lives in `src/stop-all.ts` (scripts first, then the remaining running agents), shared by `shift+x` (matched as
  `"X"` or kitty CSI-u via `matchesKey`; releases are swallowed) and `/subagents stop` (notice counts subagents and scripts).
  The panel's shift+x shows no notice (rows and the script message show the outcome).
- The "real haiku, rpc parent seam" test is `test/parent/04-stop-all.test.ts` (two slow background agents, `/subagents stop`
  via the rpc prompt, both `stopped`, then resumed). pty test: `test/tui/11-polish.test.ts` (cell colour via new
  `fgOf` in the harness). Panel/screen/definition tests: `test/panel/polish.test.ts`. The inert-field test in
  `test/real/02-agent-files.test.ts` now uses `background` instead of `color`.
