# 04: Tool mapping and permission flags

**What to build:** an agent's `tools` and `disallowedTools` in Claude Code names restrict the child's pi tools; `omitClaudeMd` drops context files; the child follows the parent's project trust.

**Blocked by:** 02

**Status:** closed (done 2026-11-07)

- [x] Claude names map to pi names; `toolMap` from settings extends the map; lowercase pi names and `mcp__*` pass through
- [x] Deny applies first; `Bash(git push *)` removes bash; denied tools go to `--exclude-tools`
- [x] Unmapped tools are dropped with a warning; Agent and Task are dropped silently
- [x] A `tools` list that ends up empty throws; without `tools` the child gets pi's defaults
- [x] `omitClaudeMd` adds `--no-context-files`; trust maps to `--approve` / `--no-approve`
- [x] `run_in_background`, `isolation` and `name` in a call produce "ignored" warnings
