# 05: Evals, docs, and a look

**What to build:** an isolation eval and a memory eval; README sections (worktree isolation, agent memory with its risk, colour, `/subagents` changes); the porting guide covers the git commands, `info/exclude`, memory paths and prompt additions; the owner tries v3b in a real session.

**Blocked by:** 02, 03, 04

**Status:** ready-for-human

- [x] Eval cases added (isolated edit keeps a worktree with the right fields and an untouched main checkout; memory carries a fact across two runs); `npm run eval` numbers in README
- [x] README and `docs/porting.md` updated; the inert-field list drops `isolation`, `memory`, `color`; AGENTS.md layout lists the new modules
- [x] The spec's Open questions are all answered and the answers recorded in the spec
- [ ] The owner has tried it and recorded the result in Comments: an isolated agent that edits (worktree kept, `/subagents worktrees`, resume), an isolated read-only agent (nothing left), an agent with memory across two sessions, colours, `/subagents stop`

## Comments

- 2026-11-09: Evals and docs done; the owner-look box stays open (status ready-for-human). Two eval cases in `evals/cases.ts` on temp git repos (new `gitFixture`): "isolated agent keeps a worktree only when it changes files" (writer keeps worktree with path/branch/files, file in the worktree, main checkout clean; read-only run leaves no worktree or branch) and "agent memory carries a fact across runs" (`memory: project` in the temp repo, run 1 writes MEMORY.md, fresh run 2 answers from it; nothing under the real `~/.claude`). `--runs 3`, all cases: 51/51, $0.037, 94 s wall (isolation 3/3 $0.0008/run, memory 3/3 $0.0011/run); no flaky case. README: test counts now 204 over seven suites, eval count 17 with numbers, `/subagents worktrees` named in the `/subagents` paragraph; the inert-field list already matched `INERT_FIELDS`. porting.md: git commands, memory paths and prompt order checked against code; added the colour-escape row. AGENTS.md layout lists color.ts, stop-all.ts and the new test files. `npm test` 204/204, typecheck clean.
