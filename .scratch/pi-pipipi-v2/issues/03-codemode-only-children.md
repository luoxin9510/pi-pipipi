# 03: Codemode-only children and MCP exclusion

**What to build:** by default a subagent's model sees only the `codemode` tool and calls its allowed tools from scripts, whatever the user's own `codemode.mode` is. Tool restrictions still hold inside scripts. Agents with a `tools` list never get MCP tools they did not list.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `pipipi.childCodemode`: `"only"` (default) or `"inherit"`; another value is a config error naming the key
- [ ] Agent files accept `codemode: false` (boolean; a wrong type skips the file)
- [ ] Codemode-only children load a pi-pipipi extension that registers `codemode` with mode `only` via pi's exported factory; verified that the built-in is replaced and its warning does not break the stream
- [ ] With `tools`: `--tools codemode,<mapped>`; without: the user's defaults plus `codemode`; `disallowedTools` still exclude
- [ ] The child system prompt ends with one line telling it to use codemode and batch independent calls
- [ ] Real-pi tests: a read-only agent cannot write from a script; the model is offered only `codemode`; `"inherit"` and `codemode: false` give v1 flags
- [ ] A `tools` list without `mcp__` entries adds `--exclude-tools mcp__*`
