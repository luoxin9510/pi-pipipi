# 09: Evals and stress on v2

**What to build:** the real-model evals and the stress test run on rpc, codemode-only children, with new cases for the v2 behaviour, and the README carries the new numbers.

**Blocked by:** 03, 07

**Status:** closed (done 2026-11-08)

- [x] All existing eval cases pass on v2 children
- [x] A comparison: the same tasks with codemode-only vs direct tools (turns, time, cost); if codemode-only is clearly worse, stop and ask the owner before keeping the default
- [x] A steer case: a running subagent changes course after a steer
- [x] `npm run stress` rerun (20 at once, 40 at limit 20, fake); README numbers updated

## Comments

2026-11-08: 13 original cases 39/39 over 3 runs ($0.027) on rpc codemode-only children; the only change was the eval harness stub (registerCommand, sendMessage, isIdle). Comparison (`npm run compare`, 5 runs): codemode-only 2.0/3.0 turns, 4.9/6.0 s vs direct 2.6/4.4 turns, 8.1/10.2 s; cost within +21%/-9% (about $0.001); codemode-only not worse, default kept. Steer case 11/13 (a miss = haiku batched all steps into one script). Stress: 20/20 in 5.3 s, 40/40 at limit 20 in 11.3 s, fake 200/200 in 6.1 s; stress script needed only the harness stub fix. README updated.
