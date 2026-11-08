# 05: Evals, docs, and a look

**What to build:** a background eval case (main stays free while agents run; the result arrives and is used); README "Background work" section; the porting guide covers the codemode wrapper, `sendMessage` with `triggerTurn`, nested tool call ids; the owner tries background work in a real session.

**Blocked by:** 04

**Status:** ready-for-human

- [x] Eval case added; `npm run eval` numbers in README
- [x] README and `docs/porting.md` updated; AGENTS.md layout
- [ ] The owner has tried it and recorded the result in Comments

## Comments

2026-11-08 (implementer): evals, docs and layout done; the owner box stays open for a real-session try.
- Eval case "background script frees main" (evals/cases.ts). print mode (`runParent`) exits when main's turn ends, so the case uses a new `runRpcParent` in evals/harness.ts (long-lived `pi --mode rpc`). Checks: the codemode call returns "moved to the background"; `agent_settled` before the Agent ends; the S1 message holds `TOK-42 completed`; it started a new run; main's final answer contains the token; everything on haiku. 3/3, about $0.001 and 14 s per run.
- The two existing parent cases ("parent runs a codemode script", "parent delegates on its own") broke under v3a: their scripts now moved to the background and print mode never saw the result. Fixed by passing `run_in_background: false` (the prompt says so in the second case), not by loosening checks.
- `node --experimental-strip-types evals/run.ts --runs 3`: 45/45 over 15 cases, $0.029, 80 s wall. README eval section, Background work section, config docs; docs/porting.md layer 4/5 and Verify (test:parent); AGENTS.md layout lines updated.
- For the owner to try: run a task that delegates (main should be free right away; the panel shows `S1` with its agents; the result arrives as a message and main answers), ctrl+b on a slow agent-less script, `x` on a script row, Esc during a background run.
