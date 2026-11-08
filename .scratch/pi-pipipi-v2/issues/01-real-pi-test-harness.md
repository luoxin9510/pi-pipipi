# 01: Test harness on real pi and real haiku

**What to build:** the test suite runs the extension against real pi (the repo's pinned 1.5.0) and real Claude Haiku 5.5. Each test gets a temp repo and a temp pi agent dir (auth linked from the user's, no installed packages, known settings). v1 behaviour tests move to it; faults real pi cannot produce on demand stay on fake pi in a separate script.

**Blocked by:** None (can start immediately)

**Status:** closed (done 2026-11-08)

- [x] A helper builds the temp agent dir and runs the in-process tool with real `pi` children on haiku
- [x] v1 behaviour tests (listing, tools/flags, model selection, skills, sessions/resume, maxTurns, concurrency, config) pass on real pi; assertions use structure and side effects, not wording
- [x] Fault tests (malformed line, missing header, crash with stderr, never settles, never exits) run on fake pi only, with their own npm script and no model
- [x] `npm test` runs the real suite; README states credentials are needed and the measured cost per run
- [x] AGENTS.md: real haiku is allowed in `npm test`; tests never run test commands

## Comments

2026-11-08: done. `test/real/` (54 tests, real pinned pi 1.5.0 + haiku, helper `test/real/helpers.ts`) and `test/faults/` (13 tests, fake pi, no model). `npm test` runs both; `test:real` and `test:faults` run one each. Full run: 67/67 in about 35 s (file-level parallelism), cost about $0.01 per run. Children's model, thinking level, tools and system prompt are asserted from the session file pi writes (model_change, thinking_level_change, system message with toolsAdded); trust is shown by a project extension that does or does not load. Model choices that name non-runnable models are observed with a missing `piCommand` (no child starts, result still reports the model). Fake tests removed because real pi shows the same intent: argv/env/stdin recording (01), last-turn-settles-completed, abort, >100 KB prompt, `@`/dash prompt, NUL-byte spawn failure, missing binary (06; now real tests), and the whole of 02-05, 07, 08 (now real). Removed with no direct replacement: exact argv shape (`--mode json -p`, `--tools` strings), now implied by the child running and by the active tools it reports.
