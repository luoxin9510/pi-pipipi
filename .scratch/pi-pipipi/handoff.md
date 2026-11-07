# pi-pipipi: handoff

Status as of 2026-11-08. v1 merged to `main` (PR #1, 646cc14). Evals + stress test on branch `eval-and-stress`.

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

## Evals and stress (2026-11-08)

- Installed into the owner's pi (`pi install ~/Developer/pi-pipipi`); the old `pi-subagents` package was removed.
- Ticket 09 closed: README smoke test run through the installed package, 3 x completed on haiku.
- `npm run eval` (evals/, 13 cases, haiku for parent and children, defaultModel pinned, model checked on every
  result/message): 39/39 over 3 runs, $0.028.
- The first eval run found a bug: a last allowed turn that called tools, followed by a quick next turn that settled
  within the 2 s grace, was reported `completed` though the run went past `maxTurns`. Fixed in runner.ts (a turn
  ending in `toolUse` at the limit stops the child at once: `partial`), with a test (63 tests).
- `npm run stress`: 20 at once 20/20 in 4.9 s; 40 with limit 20 40/40 in 10.4 s; 200 fake 5.6 s vs 5.5 s ideal; the
  cap holds at 20 children; ~220 MB per child (4.5 GB at 20). Numbers in README.
- PR #2 got a two-axis code review; its findings were fixed (flag validation, abortable case timeout, haiku pinned
  and checked, spec.md maxTurns line, `closed` status documented in triage-labels.md).

## Open

- Not done (owner decisions): usage of aborted runs is not reported; >100 KB prompts reach the child as a file attachment (unverified effect).
- Not published to npm.
- v2 candidates: tier B fields (mcpServers, worktree isolation, autoCompactWindow), background runs, nesting > 1.
