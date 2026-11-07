# 01: Run the built-in general-purpose agent end to end

**What to build:** a codemode script calls `tools.Agent({ description, prompt })` and gets back a completed `AgentResult` from a child `pi --mode json -p` process running the built-in `general-purpose` agent. Progress updates show the turn count and last tool. In a child process (`PIPIPI_DEPTH` set) the tool is not registered.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The tool is named `Agent`, has `codemode` exposure, an output schema, and returns the result as structured content, details and `usage`, plus a text summary
- [ ] `output` is the text of the last assistant message that has text; usage is summed over assistant messages; turns are counted
- [ ] Progress updates read `<description>: turn N, <last tool>`
- [ ] The child gets `PIPIPI_DEPTH=1`, the parent's working directory, and stdin closed
- [ ] With `PIPIPI_DEPTH` set, the extension registers nothing
