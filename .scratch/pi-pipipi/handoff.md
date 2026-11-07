# pi-pipipi: handoff

Status as of 2026-11-07. Branch: `pipipi-v1` (built on `claude/exciting-tesla-w5876m`).

## Done

- `decisions.md`, `spec.md`: v1 design. spec.md was grilled with the owner and approved on 2026-11-07
  ("Grill 2" in decisions.md: 21 decisions, incl. default model haiku, stored agentType for resume, recursive skills).
- The code (first written before the grill) has been brought in line with Grill 2.
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

## Flow (Matt Pocock skills)

setup (local markdown tracker) -> grill -> to-spec (spec.md rewritten) -> to-tickets (01-09) -> implement (tests
moved to one seam, mutation-checked) -> code-review x2 (fixed) -> pr (PR #1 ready for review) -> 3 rounds of Opus adversarial review (all confirmed findings fixed test-first; 62 tests).

## Open

- Owner: review and merge PR #1; run the README smoke test and close ticket 09.
- v2 candidates: tier B fields (mcpServers, worktree isolation, autoCompactWindow), background runs, nesting > 1.
