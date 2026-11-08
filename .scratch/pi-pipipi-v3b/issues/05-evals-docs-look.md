# 05: Evals, docs, and a look

**What to build:** an isolation eval and a memory eval; README sections (worktree isolation, agent memory with its risk, colour, `/subagents` changes); the porting guide covers the git commands, `info/exclude`, memory paths and prompt additions; the owner tries v3b in a real session.

**Blocked by:** 02, 03, 04

**Status:** ready-for-human

- [ ] Eval cases added (isolated edit keeps a worktree with the right fields and an untouched main checkout; memory carries a fact across two runs); `npm run eval` numbers in README
- [ ] README and `docs/porting.md` updated; the inert-field list drops `isolation`, `memory`, `color`; AGENTS.md layout lists the new modules
- [x] The spec's Open questions are all answered and the answers recorded in the spec
- [ ] The owner has tried it and recorded the result in Comments: an isolated agent that edits (worktree kept, `/subagents worktrees`, resume), an isolated read-only agent (nothing left), an agent with memory across two sessions, colours, `/subagents stop`

## Comments
