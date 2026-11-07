# 03: Model selection

**What to build:** each call picks the child model as call `model` > definition `model` > `pipipi.defaultModel` (default `haiku`). Aliases map to the same-name Anthropic models unless settings override them; `inherit` (explicit only) uses the parent's model. `effort` sets the thinking level. The README explains all of this.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] With nothing set, the child runs `anthropic/claude-haiku-5-5`, never the parent model; built-in agents do too
- [ ] Each alias maps to its default; a settings override changes only that alias; full ids pass through
- [ ] `inherit` in the call, the definition or `defaultModel` uses the parent model; with no parent model it throws
- [ ] Thinking: call `effort` > definition `effort` > parent thinking level
- [ ] README has a "Model selection" section: order, alias table, inherit, and what to change without Anthropic credentials
