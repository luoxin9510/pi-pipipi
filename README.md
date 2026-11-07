# pi-pipipi

Claude Code-compatible subagents for [pi](https://pi.dev). The extension registers one tool, `Agent`, for codemode
scripts. Each call runs an agent definition in its own `pi` subprocess and returns a structured result, so a script can
run agents in parallel and filter what reaches the model.

```js
// inside a codemode script
const [a, b] = await Promise.all([
  tools.Agent({ description: "find auth code", prompt: "Where is login handled? medium", subagent_type: "Explore" }),
  tools.Agent({ description: "find session store", prompt: "Where are sessions stored? quick", subagent_type: "Explore" }),
]);
return [a.output, b.output].join("\n---\n");
```

## Install

```bash
pi install git:github.com/luoxin9510/pi-pipipi
```

The tool has `codemode` exposure: the model reaches it only through the `codemode` tool, so enable codemode
(`pi --tools +codemode`, or `"defaultTools": ["+codemode"]` in settings).

## Agent definitions

Existing Claude Code agent files work unchanged. Sources, highest priority first (each scanned recursively for `*.md`):

1. `.pi/agents/` (cwd up to the repo root, closest wins)
2. `.claude/agents/` (same walk)
3. `~/.pi/agent/agents/`
4. `~/.claude/agents/`
5. Built-in: `Explore`, `Plan`, `general-purpose`

Definitions are re-read on every call. Invalid files are skipped with a warning.

| Field | Handling |
|---|---|
| `name`, `description`, body | Same as Claude Code. The body replaces pi's default system prompt. |
| `tools`, `disallowedTools` | Mapped to `--tools` / `--exclude-tools`. `Read→read`, `Write→write`, `Edit→edit`, `Bash→bash`, `Grep→grep`, `Glob→find`, `LS→ls`, `mcp__*` unchanged. A `Bash(...)` deny rule removes the whole tool. Tools with no pi equivalent are dropped with a warning. |
| `model` | `opus`/`sonnet`/`haiku`/`fable` via `pipipi.models`; `inherit` = parent model; anything else is passed to `--model`. |
| `effort` | `--thinking` |
| `maxTurns` | The child is stopped after that many turns; the result is `partial`. |
| `skills` | Full `SKILL.md` text preloaded into the system prompt. |
| `omitClaudeMd` | `--no-context-files` |
| `mcpServers`, `isolation`, `autoCompactWindow`, `color`, `permissionMode`, `hooks`, `memory`, `background`, `initialPrompt`, `experimental` | Accepted, no effect yet (warning). |

## The Agent tool

Input (compatible with Claude Code's Agent tool): `{ description, prompt, subagent_type?, model?, effort?, resume? }`.
`run_in_background`, `isolation` and `name` are accepted and ignored with a warning.

Result:

```ts
{
  status: "completed" | "partial" | "failed";
  agentId: string;      // pass as `resume` to continue this agent's session
  agentType: string;
  output: string;       // the agent's last message
  model: string;
  usage: Usage;         // added to the session cost
  turns: number;
  durationMs: number;
  warnings: string[];
  error?: string;       // when failed
}
```

A child that fails returns `status: "failed"` instead of throwing, so scripts keep the structured result. Bad input
(unknown agent, unmapped model alias, no usable tools, unknown `resume` id) throws.

Children run with `PIPIPI_DEPTH=1` and get no `Agent` tool: nesting is one level. Child sessions are stored next to
the parent session under `subagents/<parent session id>/`. With an in-memory parent session, children are in memory
too and cannot be resumed. Children inherit the parent's project trust.

## Config

Optional, in `.pi/settings.json` or `~/.pi/agent/settings.json`:

```jsonc
"pipipi": {
  "models": {
    "opus": "anthropic/claude-opus-5-5",
    "sonnet": "anthropic/claude-sonnet-5-5",
    "haiku": "anthropic/claude-haiku-5-5",
    "fable": "anthropic/claude-fable-5-1"
  },
  "defaultModel": "haiku",                         // used when neither the call nor the definition names a model
  "toolMap": { "WebFetch": "mcp__fetch__fetch" },  // merged over the built-in map
  "maxConcurrent": 20,                             // running children per pi process; extra calls queue
  "piCommand": "pi"
}
```

## Development

```bash
npm install
npm test          # node:test against a fake pi binary (test/fake-pi.mjs)
npx tsc -p .      # typecheck
```

Real-model smoke test (costs a few cents with haiku):

```bash
pi -e ./src/index.ts --model anthropic/claude-haiku-5-5 --tools +codemode -p \
  'Use the codemode tool: run two Explore agents in parallel with tools.Agent, one asking which file registers the
   Agent tool, one listing src/builtin. Return status, turns, usage.cost.total and output for each.'
```

Design notes: `.scratch/pi-pipipi/` (decisions, spec, tickets, handoff).

## License

Apache-2.0
