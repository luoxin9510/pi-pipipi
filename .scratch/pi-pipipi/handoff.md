# pi-pipipi: handoff

Status as of 2026-11-07. Branch: `pipipi-v1` (built on `claude/exciting-tesla-w5876m`).

## Done

- `decisions.md`, `spec.md`: v1 design. The 7 spec choices beyond decisions.md were taken as written
  (owner said "continue development").
- Tickets 01-09 in `issues/` are all implemented.
- `src/`: config, definition, discovery, resolve, runner, agent-tool, index, built-in Explore/Plan/general-purpose.
- `test/`: all 18 spec cases (+5 extra) pass against `test/fake-pi.mjs`; `tsc` clean.
- Real-model smoke test with pi 1.5.0 + haiku on the owner's machine: two parallel Explore runs from a codemode
  script (~5 s, ~$0.0008 each), and a real `resume` of one of them in a resumed parent session.

## [verify] results

- `pi.getSettings()` keeps the unknown `pipipi` key: yes, so config lives in settings.json.
- Extensions cannot read pi's loaded skill list (no API on ctx or pi): skills are found by scanning the dirs in spec 5.3.
- Long prompts: macOS takes 900 KB in one argv string, Linux caps one string at 128 KiB. Prompts over 100 KB go
  through `@<tmpfile>`.
- `--session-dir <dir> --session-id <id>` writes `<dir>/<timestamp>_<id>.jsonl` directly (no per-cwd subfolder).

## Open

- Owner review of PR, then merge to `main`.
- v2 candidates: tier B fields (mcpServers, worktree isolation, autoCompactWindow), background runs, nesting > 1.
