# 03: Errors, long results, several scripts, stop, shutdown, Esc, the off switch

**What to build:** background scripts behave well at the edges: a script that throws reports its error; a return value over 8 KB is truncated in the message with the full text in a file whose path is given; several scripts run at once sharing `maxConcurrent`; stopping a script stops its agents and still sends the message; session end and `/reload` stop everything in the background; Esc on main's turn stops a foreground script but not background ones; `pipipi.backgroundScripts: false` restores v2 behaviour with pi's own codemode.

**Blocked by:** 02

**Status:** closed (done 2026-11-08)

- [x] Script error → message carries it
- [x] >8 KB return value → first 8 KB + file path (session subagents dir; temp dir for in-memory sessions)
- [x] Two background scripts at once both report; agents respect `maxConcurrent`
- [x] Stopping a script (registry) stops its agents (failed / "stopped by user"); the script ends stopped and main is told
- [x] Session shutdown / reload stops background scripts and detached agents (stopped, resumable)
- [x] Esc semantics as described
- [x] `backgroundScripts` config (boolean, default true; wrong type = config error naming the key); false = no wrapper
- [x] Tests; full `npm test` green

## Comments

2026-11-08 (implementer): built on tickets 01-02.
- Errors/long: `capText` (src/sessions.ts) cuts the message text at 8000 chars and writes all of it to `<name>-<ms>.txt` in `subagents/<session id>/` (temp dir `pipipi-*` for in-memory sessions); used for script end messages (`script-S1`, the codemode result text incl. its "Script completed / Wall time / Output:" header, so ~50 chars of the 8000 are header) and detached agents' messages (`<agentId>-output`).
- Stop: `scripts.stop(id): Promise<boolean>` (false if not running) sets `stopRequested`, `registry.stopAll(script.agents)` (each running agent ends failed "stopped by user", registry status stopped; detached agents of the script included), then aborts the script's own controller; end state `stopped` wins over `failed`; main gets the usual message. `scripts.stopAll(sessionId)`.
- Shutdown: pi emits `session_shutdown` (reason quit/reload/new/resume/fork) on every session end, before teardown; rpc SIGTERM gives "quit". Handler sets `closing` (nothing is sent to main), stops all scripts then every running agent of the session. Meta files end `stopped` (resumable). `closing` resets on `session_start`.
- Esc: unchanged mechanism (the abort listener is removed when the script moves); a foreground script now ends `stopped`. Detached agents use their own controller.
- `backgroundScripts: false`: config is not readable at load, so the wrapper stays registered but passes calls straight to pi's codemode (no script tracking); the Agent tool description drops the move-to-background rules; an explicit `run_in_background: true` still detaches (decision).
- Tests: test/faults/background-edges.test.ts (stand-in codemode via a new 4th arg of `installBackground`, real Agent tool, fake pi children), test/parent/03-edges.test.ts (4 real-parent tests). `loadTool` now returns `ctx`, `emit`, `messages`.
