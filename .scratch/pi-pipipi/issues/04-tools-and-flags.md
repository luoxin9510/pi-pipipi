# 04: Tool mapping and permission flags

**What to build:** an agent's `tools` and `disallowedTools` in Claude Code names restrict the child's pi tools; `omitClaudeMd` drops context files; the child follows the parent's project trust.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Claude names map to pi names; `toolMap` from settings extends the map; lowercase pi names and `mcp__*` pass through
- [ ] Deny applies first; `Bash(git push *)` removes bash; denied tools go to `--exclude-tools`
- [ ] Unmapped tools are dropped with a warning; Agent and Task are dropped silently
- [ ] A `tools` list that ends up empty throws; without `tools` the child gets pi's defaults
- [ ] `omitClaudeMd` adds `--no-context-files`; trust maps to `--approve` / `--no-approve`
- [ ] `run_in_background`, `isolation` and `name` in a call produce "ignored" warnings
