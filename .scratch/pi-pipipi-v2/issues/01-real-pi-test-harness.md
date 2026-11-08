# 01: Test harness on real pi and real haiku

**What to build:** the test suite runs the extension against real pi (the repo's pinned 1.5.0) and real Claude Haiku 5.5. Each test gets a temp repo and a temp pi agent dir (auth linked from the user's, no installed packages, known settings). v1 behaviour tests move to it; faults real pi cannot produce on demand stay on fake pi in a separate script.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A helper builds the temp agent dir and runs the in-process tool with real `pi` children on haiku
- [ ] v1 behaviour tests (listing, tools/flags, model selection, skills, sessions/resume, maxTurns, concurrency, config) pass on real pi; assertions use structure and side effects, not wording
- [ ] Fault tests (malformed line, missing header, crash with stderr, never settles, never exits) run on fake pi only, with their own npm script and no model
- [ ] `npm test` runs the real suite; README states credentials are needed and the measured cost per run
- [ ] AGENTS.md: real haiku is allowed in `npm test`; tests never run test commands
