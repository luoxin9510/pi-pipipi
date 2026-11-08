# 03: Codemode-only children and MCP exclusion

**What to build:** by default a subagent's model sees only the `codemode` tool and calls its allowed tools from scripts, whatever the user's own `codemode.mode` is. Tool restrictions still hold inside scripts. Agents with a `tools` list never get MCP tools they did not list.

**Blocked by:** 01

**Status:** closed (done 2026-11-08)

- [x] `pipipi.childCodemode`: `"only"` (default) or `"inherit"`; another value is a config error naming the key
- [x] Agent files accept `codemode: false` (boolean; a wrong type skips the file)
- [x] Codemode-only children load a pi-pipipi extension that registers `codemode` with mode `only` via pi's exported factory; verified that the built-in is replaced and its warning does not break the stream
- [x] With `tools`: `--tools codemode,<mapped>`; without: the user's defaults plus `codemode`; `disallowedTools` still exclude
- [x] The child system prompt ends with one line telling it to use codemode and batch independent calls
- [x] Real-pi tests: a read-only agent cannot write from a script; the model is offered only `codemode`; `"inherit"` and `codemode: false` give v1 flags
- [x] A `tools` list without `mcp__` entries adds `--exclude-tools mcp__*`

## Comments

2026-11-08, verified on pi 1.5.0 with haiku before implementing:
- `-e src/child-codemode.ts` (`createCodemodeExtension({ mode: "only" })`) replaces `builtin:codemode`: one stderr warning ("registers tool `codemode`, so built-in extension `codemode` was not loaded"), exit 0, JSON stream intact (agent_start ... agent_settled).
- The provider request (seen with a `before_provider_request` probe) lists only `codemode` (plus pi's `__pi_deferred_placeholder__`) while the session file's `toolsAdded` still lists codemode, read, grep, find, ls: hidden declarations are filtered per request, so tests read the request, not the session file. Provider names may be capitalised (`Read`).
- With `--tools codemode,read,grep,find,ls` a script calling `tools.write`/`tools.bash` gets "tools.write does not exist. Available: read, grep, find, ls"; no file was created. The allowlist binds inside scripts.
- `--exclude-tools 'mcp__*'` is accepted and removes a fake `mcp__fake__ping` extension tool; without a `tools` list, or with the tool listed, it stays.
- Without `tools` the child gets `--tools +codemode` (defaults plus codemode).

Done: `pipipi.childCodemode`, `codemode: false`, `src/child-codemode.ts`, flags in `resolve.ts`, prompt line, MCP exclusion (also applies in "inherit" mode, per criterion). Tests: `test/real/09-codemode-only.test.ts`, config/definition cases in 02 and 08; older tests now expect `codemode` in the child's tools. Full suite 71/71, about 36 s, real part about $0.011.
