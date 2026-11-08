# 07: Subagent screen: talking

**What to build:** text typed on a subagent screen steers a running subagent or continues a finished one with its own prompt, tools and model; the reply streams in. One process per subagent at a time: whoever comes second (the user or main's resume) waits in a queue. After each exchange main gets a short note of what was said and answered: a steer while main runs, stored without a turn while main is idle.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Typing to a running subagent sends rpc `steer`; it changes course (real haiku test with an unambiguous instruction)
- [ ] Typing to a finished subagent resumes its session with its stored config; the reply streams onto the screen
- [ ] A user message and a main resume of the same subagent run one after the other, never together; neither errors
- [ ] Main receives the note (displayed custom message, reply truncated); delivered as steer while main runs, no turn while idle
