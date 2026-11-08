# 07: Subagent screen: talking

**What to build:** text typed on a subagent screen steers a running subagent or continues a finished one with its own prompt, tools and model; the reply streams in. One process per subagent at a time: whoever comes second (the user or main's resume) waits in a queue. After each exchange main gets a short note of what was said and answered: a steer while main runs, stored without a turn while main is idle.

**Blocked by:** 06

**Status:** closed (done 2026-11-08)

- [x] Typing to a running subagent sends rpc `steer`; it changes course (real haiku test with an unambiguous instruction)
- [x] Typing to a finished subagent resumes its session with its stored config; the reply streams onto the screen
- [x] A user message and a main resume of the same subagent run one after the other, never together; neither errors
- [x] Main receives the note (displayed custom message, reply truncated); delivered as steer while main runs, no turn while idle

## Comments

2026-11-08: done. New `src/exchange.ts`: `exchange(parent, spec, {type, description, said?}, signal, onProgress)` is the one path for a run (queue turn, concurrency slot, registry begin/progress/finish, note). `Agent` (src/agent-tool.ts) and the screen both use it; the Semaphore moved here. Queue: `registry.turn(id, signal, fn)` chains per-subagent promises (arrival order; an abort while waiting leaves the line; the slot is taken only after the turn comes, so a waiting resume never holds a slot); `registry.busy(id)`, `registry.drained(id)` for the screen and tests. Talking: `src/talk.ts` `talkTo(parent, id, text)`: handle present and `send` accepts -> rpc `steer` ("steered", text recorded); else a new exchange resuming the session via `resolveChild` with the record's type definition and stored model/thinking ("started", or "queued" if the subagent is busy). `ChildHandle.send` now returns false once the run settled or stdin closed, so a steer that comes too late becomes a resumed exchange instead of being lost. Note: sent after the exchange settles with the user's text(s) + final reply (cut at 2000 chars, a failure reads `(failed: ...)`); `bindTalk` in src/index.ts calls `pi.sendMessage({customType:"pi-pipipi", content, display:true}, ctx.isIdle() ? undefined : {deliverAs:"steer"})`. Main's own resumes get no note. Screen: plain text calls `talkTo`; the hint line says sent/queued; errors show as a notice. Tests: test/real/11-talk.test.ts (4, tool seam with `t.say` / `t.messages`), test/tui/07-talk.test.ts (2, pty).
