# 09: README and real-model smoke test

**What to build:** a README that lets a new user install pi-pipipi, call it from codemode, understand compatibility with Claude Code, and run a manual smoke test against a real model.

**Blocked by:** 03, 04, 05, 06, 07, 08

**Status:** closed (done 2026-11-08)

- [x] Install, codemode requirement, usage example, field compatibility table, result shape, config
- [x] Notes: description snapshot until `/reload`, long prompts via file, children inherit trust, nesting is one level
- [x] Smoke test: two Explore agents in parallel, then a resume without `subagent_type`; the owner runs it and records the result

## Comments

- 2026-11-07 (agent): ran the README smoke command against pi 1.5.0 on the owner's machine: three `completed` results on `anthropic/claude-haiku-5-5`; the resumed Explore answered from its earlier turn; total ≈ $0.0011. Left `ready-for-human` for the owner's own run.
- 2026-11-08 (agent, on the owner's request): ran it again through the installed package (`pi install ~/Developer/pi-pipipi`, no `-e`), parent also on haiku: three `completed` on `anthropic/claude-haiku-5-5`, resume answered `Explore.md`, total ≈ $0.0011, 20 s. Closed.
