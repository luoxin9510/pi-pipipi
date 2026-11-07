# 09: README and real-model smoke test

**What to build:** a README that lets a new user install pi-pipipi, call it from codemode, understand compatibility with Claude Code, and run a manual smoke test against a real model.

**Blocked by:** 03, 04, 05, 06, 07, 08

**Status:** ready-for-human

- [ ] Install, codemode requirement, usage example, field compatibility table, result shape, config
- [ ] Notes: description snapshot until `/reload`, long prompts via file, children inherit trust, nesting is one level
- [ ] Smoke test: two Explore agents in parallel, then a resume without `subagent_type`; the owner runs it and records the result
