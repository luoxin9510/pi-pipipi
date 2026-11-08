# 02: Children run as `pi --mode rpc`

**What to build:** every subagent runs as a long-lived rpc process: the prompt goes over stdin as an rpc `prompt` command, events are read as before, and the process is closed when the last queued message settles. A script sees no difference except that prompts of any size work.

**Blocked by:** 01

**Status:** closed (done 2026-11-08)

- [x] First, verified on real pi and written in the ticket comments: rpc mode accepts the v1 flags, emits the session header and the json-mode events, and `steer`, `abort`, `set_model` behave as documented
- [x] The runner uses rpc mode; the `@file` path for long prompts is gone and a >150 KB prompt reaches the child intact
- [x] rpc responses to our commands are checked; a failed `prompt` response fails the run with pi's error
- [x] maxTurns stops the child with rpc `abort` (signals remain the fallback); results match v1 (`partial`, turns, usage)
- [x] Fake pi gains an rpc mode so the fault tests keep working
- [x] All v1 behaviour tests pass unchanged in their assertions

## Comments

2026-11-08, implementer. Verified on real pi 1.5.0 + haiku (details also in ~/Developer/pi-pipipi-notes/pi-1.5.0-facts.md, "RPC (verified)"):
- v1 flags are accepted in `--mode rpc`. There is NO session header on stdout in rpc (the first line is the response to the first command); the runner's header check is removed. Other events are the same as json mode.
- `prompt` over stdin answers `success:true, data:{disposition:"started"}`; a second prompt while running fails ("Agent is already processing..."), so queueing stays ours. `steer` mid-run -> `disposition:"queued"`. `abort` -> success, run ends with `agent_settled {aborted:true}`, process stays up for further prompts. `set_model {provider, modelId}` -> full model object; unknown model -> `success:false, error:"Model not found: ..."`. Closing stdin after settle exits 0.
- Prompts > 300 KB, with NUL, leading `@` or `-` all work.

Done: runner now spawns rpc, sends `prompt` over stdin, checks the prompt response (failure -> failed run with pi's error), closes stdin on `agent_settled`, maxTurns/stop-by-caller use rpc `abort` with SIGTERM/SIGKILL fallback after a 2 s grace; `partial` also when the abort settles. Seam for later tickets: `runChild(..., onStart?)` hands out `{ send(steer|abort|set_model) }`. `@file` route and README note removed. Fake pi speaks rpc (waits for the prompt command, scenario `promptError`, `abortSettles`, records received commands). Two tests changed premise: "missing session header" became "failed prompt response"; the NUL-in-argv spawn-throws test now asserts the NUL prompt works over rpc (the synchronous-spawn catch in the runner stays for other spawn errors). Added fault tests for stdin prompt (300 KB, leading @) and abort on maxTurns. 73 tests pass (real + faults), about 36 s, about $0.015; typecheck clean.
