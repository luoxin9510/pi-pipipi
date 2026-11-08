# 03: Errors, long results, several scripts, stop, shutdown, Esc, the off switch

**What to build:** background scripts behave well at the edges: a script that throws reports its error; a return value over 8 KB is truncated in the message with the full text in a file whose path is given; several scripts run at once sharing `maxConcurrent`; stopping a script stops its agents and still sends the message; session end and `/reload` stop everything in the background; Esc on main's turn stops a foreground script but not background ones; `pipipi.backgroundScripts: false` restores v2 behaviour with pi's own codemode.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Script error → message carries it
- [ ] >8 KB return value → first 8 KB + file path (session subagents dir; temp dir for in-memory sessions)
- [ ] Two background scripts at once both report; agents respect `maxConcurrent`
- [ ] Stopping a script (registry) stops its agents (failed / "stopped by user"); the script ends stopped and main is told
- [ ] Session shutdown / reload stops background scripts and detached agents (stopped, resumable)
- [ ] Esc semantics as described
- [ ] `backgroundScripts` config (boolean, default true; wrong type = config error naming the key); false = no wrapper
- [ ] Tests; full `npm test` green
