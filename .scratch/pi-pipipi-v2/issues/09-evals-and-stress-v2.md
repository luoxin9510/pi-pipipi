# 09: Evals and stress on v2

**What to build:** the real-model evals and the stress test run on rpc, codemode-only children, with new cases for the v2 behaviour, and the README carries the new numbers.

**Blocked by:** 03, 07

**Status:** ready-for-agent

- [ ] All existing eval cases pass on v2 children
- [ ] A comparison: the same tasks with codemode-only vs direct tools (turns, time, cost); if codemode-only is clearly worse, stop and ask the owner before keeping the default
- [ ] A steer case: a running subagent changes course after a steer
- [ ] `npm run stress` rerun (20 at once, 40 at limit 20, fake); README numbers updated
