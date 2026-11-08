# 02: Children run as `pi --mode rpc`

**What to build:** every subagent runs as a long-lived rpc process: the prompt goes over stdin as an rpc `prompt` command, events are read as before, and the process is closed when the last queued message settles. A script sees no difference except that prompts of any size work.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] First, verified on real pi and written in the ticket comments: rpc mode accepts the v1 flags, emits the session header and the json-mode events, and `steer`, `abort`, `set_model` behave as documented
- [ ] The runner uses rpc mode; the `@file` path for long prompts is gone and a >150 KB prompt reaches the child intact
- [ ] rpc responses to our commands are checked; a failed `prompt` response fails the run with pi's error
- [ ] maxTurns stops the child with rpc `abort` (signals remain the fallback); results match v1 (`partial`, turns, usage)
- [ ] Fake pi gains an rpc mode so the fault tests keep working
- [ ] All v1 behaviour tests pass unchanged in their assertions
