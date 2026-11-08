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

The project walk never includes your home directory (`~/.pi/agent/agents` and `~/.claude/agents` are user sources only).
Scans skip dot directories and `node_modules`, go at most 6 levels deep and read at most 5000 entries per source.

Definitions are re-read on every call, so edits apply at once. The agent list in the tool's description is built at
session start: a new agent can be called right away but shows up in the description only after `/reload`.
Invalid files are skipped with a warning.

| Field | Handling |
|---|---|
| `name`, `description`, body | Same as Claude Code. The body replaces pi's default system prompt. |
| `tools`, `disallowedTools` | Without `tools` the agent gets your normal pi tools (`defaultTools`) and every installed extension. Otherwise mapped to `--tools` / `--exclude-tools`. `Read→read`, `Write→write`, `Edit→edit`, `Bash→bash`, `Grep→grep`, `Glob→find`, `LS→ls`, `mcp__*` unchanged. A `tools` list without `mcp__` entries also excludes all MCP tools. A `Bash(...)` deny rule removes the whole tool. Tools with no pi equivalent are dropped with a warning. |
| `codemode` | `false` keeps this agent on direct tools. Default: children see only the `codemode` tool and call their allowed tools from scripts (the `tools` list still binds inside scripts). |
| `model` | See [Model selection](#model-selection). |
| `effort` | `--thinking` |
| `maxTurns` | The child is stopped after that many turns; the result is `partial`. |
| `skills` | Full `SKILL.md` text preloaded into the system prompt. Searched (recursively) in `.pi/skills`, `.agents/skills`, `.claude/skills` from cwd up to the repo root, then `~/.pi/agent/skills`, `~/.agents/skills`, `~/.claude/skills`. Skill paths from settings or pi packages are not searched. |
| `omitClaudeMd` | `--no-context-files` |
| `mcpServers`, `isolation`, `autoCompactWindow`, `color`, `permissionMode`, `hooks`, `memory`, `background`, `initialPrompt`, `experimental` | Accepted, no effect yet (warning). |

## Model selection

**Subagents run on Claude Haiku 5.5 by default, not on your session's model.** The model is picked in this order:

1. `model` in the `Agent` call
2. `model` in the agent definition
3. `pipipi.defaultModel` in settings, default `"haiku"`

The built-in agents (`Explore`, `Plan`, `general-purpose`) set no model, so they run on haiku too.

Values:

| Value | Model |
|---|---|
| `haiku` (default) | `anthropic/claude-haiku-5-5` |
| `sonnet` | `anthropic/claude-sonnet-5-5` |
| `opus` | `anthropic/claude-opus-5-5` |
| `fable` | `anthropic/claude-fable-5-1` |
| `inherit` | the parent session's current model. Only used when written explicitly. |
| anything else | passed to `pi --model` as is (`provider/id` or a pattern pi resolves) |

To follow your session's model everywhere, set `"defaultModel": "inherit"`. To use another provider for an alias,
remap it in `pipipi.models`; the other aliases keep their defaults.

Without Anthropic credentials, haiku (and so every agent by default) fails with a provider error in `error`. Set
`defaultModel` to `inherit` or remap the aliases you use, for example:

```jsonc
"pipipi": { "models": { "haiku": "<provider>/<cheap-model-id>", "sonnet": "<provider>/<model-id>" } }
```

## The Agent tool

Input (compatible with Claude Code's Agent tool): `{ description, prompt, subagent_type?, model?, effort?, resume? }`.
`subagent_type` defaults to `general-purpose`. `run_in_background`, `isolation` and `name` are accepted and ignored
with a warning. Children run as `pi --mode rpc` and get the prompt over stdin, so prompts
of any size work.

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
(unknown agent, no usable tools, unknown `resume` id) throws. A model value that is not a known alias is passed to
`--model` unchanged, and the child fails with pi's own error.

Children run with `PIPIPI_DEPTH=1` and get no `Agent` tool: nesting is one level. Child sessions are stored next to
the parent session under `subagents/<parent session id>/`. With an in-memory parent session, children are in memory
too and cannot be resumed. A resume without `subagent_type` reuses the agent type of the first run; a different
`subagent_type` is an error. Children inherit the parent's project trust.

## Config

Optional, in `.pi/settings.json` or `~/.pi/agent/settings.json`:

```jsonc
"pipipi": {
  "models": { "haiku": "anthropic/claude-haiku-5-5" },  // per-alias overrides of the defaults above
  "defaultModel": "haiku",                         // default "haiku"; "inherit" follows the session model
  "toolMap": { "WebFetch": "mcp__fetch__fetch" },  // merged over the built-in map
  "maxConcurrent": 20,                             // running children per pi process; extra calls queue. The first session's value wins for the process
  "childCodemode": "only",                         // "only" (default): children see only `codemode`; "inherit": v1 behaviour, direct tools
  "piCommand": "pi"
}
```

## Development

```bash
npm install
npm test            # real suite (test/real) + fault suite (test/faults)
npm run test:real   # only the real suite
npm run test:faults # only the fault suite: scripted fake pi (test/fake-pi.mjs), no model, free
npm run typecheck
```

The real suite drives the Agent tool in-process with real children: the pinned pi (`node_modules/.bin/pi`, 1.5.0) on
real Claude Haiku 5.5. It needs Anthropic credentials in `~/.pi/agent/auth.json`. Each test gets a temp repo, a temp
HOME and a temp pi agent dir (auth linked from yours, no packages), so your own setup does not leak in. Assertions
read structure and side effects (the child's session file, files it wrote), never wording. One full `npm test` runs
54 real and 13 fault tests in about 35 s and costs about $0.01 (measured with `PIPIPI_COST_LOG=<file> npm test`,
which makes each test file append its sum of `usage.cost.total`). The fault suite covers what real pi will not do on
demand: malformed JSON line, missing session header, crash with stderr, provider-error retries, a child that never
settles or never exits, exact usage arithmetic.

Real-model smoke test (costs well under a cent with haiku). Run it from this repo:

```bash
pi -e ./src/index.ts --tools +codemode -p 'Use the codemode tool. Script:
const a = await tools.Agent({ description: "list builtins", prompt: "List file names in src/builtin. quick", subagent_type: "Explore" });
const [b, c] = await Promise.all([
  tools.Agent({ description: "follow up", prompt: "What was the first file name you listed? One word.", resume: a.agentId }),
  tools.Agent({ description: "find tool", prompt: "Which file registers the Agent tool? quick", subagent_type: "Explore" }),
]);
return [a, b, c].map((r) => ({ status: r.status, agentType: r.agentType, model: r.model, cost: r.usage.cost.total, output: r.output.slice(0, 200), error: r.error }));
Reply with the returned JSON only.'
```

Expect three `completed` results on `anthropic/claude-haiku-5-5`, the second one an `Explore` answering from its
earlier turn.

### Evals (real model, haiku throughout)

```bash
npm run eval                       # every case once
npm run eval -- --runs 3           # repeat, for pass rates
npm run eval -- --only resume      # cases whose name contains "resume"
```

`evals/cases.ts` holds 13 cases. Eleven call the tool in-process with real `pi` children (listing, read-only agents
cannot write, custom agent tools, resume, `maxTurns`, skills, context files vs `omitClaudeMd`, model aliases, a bad
model, no nesting, parallel runs). Two start a real parent `pi` on haiku with codemode and this checkout
(`--no-extensions -e builtin:codemode -e ./src/index.ts`), one with a given script and one where the model decides to
delegate. Cases are graded from the structured result and side effects. `defaultModel` is pinned to `haiku` whatever
your settings say, and every case checks that every result (or, for the parent cases, every assistant message of the
parent and its children) ran on haiku. A case running over 5 minutes is aborted and its children stopped. Results go
to `evals/results/` (ignored by git).

Last run (pi 1.5.0): 39/39 over 3 runs, $0.028 in all. The first version of the suite found a bug that the fake-pi
tests had missed (a run could go past `maxTurns` and still be reported `completed`), fixed since. Two checks depend on
the model or on timing and could fail without a bug: `maxTurns` needs haiku to call a tool on its first turn, and the
parallel case needs wall time under 0.7 × the summed run times.

### Stress test

```bash
npm run stress                     # haiku: 20 calls at once, then 40 (20 run, 20 queue)
npm run stress -- --calls 20 --limit 20
npm run stress -- --fake           # 200 calls against test/fake-pi.mjs: the extension's own overhead
```

Last run (Apple M5, 10 cores, 24 GB; pi 1.5.0; each call an Explore reading one file):

| | 20 calls | 40 calls (limit 20) | 200 fake calls (limit 20, 550 ms each) |
|---|---|---|---|
| completed (all on haiku, right answer) | 20/20 | 40/40 | 200/200 |
| wall | 4.9 s | 10.4 s | 5.6 s (ideal 5.5 s) |
| call latency p50 / p95 | 4.6 / 4.9 s | 6.0 / 9.3 s | 2.9 / 5.5 s |
| latency − child run p50 / p95 (queue wait + spawn) | 9 / 26 ms | 29 ms / 5.4 s | 2.3 / 5.0 s |
| peak children (sampled from `ps`) | 20 | 20 | 20 |
| peak RSS (all children) | 3.7 GB | 4.5 GB | 0.9 GB |
| cost | $0.0086 | $0.0059 | — |

The 40-call phase costs less than the 20-call one because it runs second: the shared system prompt is then in the
prompt cache. One earlier run sampled 21 children once (`ps` caught a short-lived extra process); the limit itself is a
semaphore and never lets more than 20 children start.

Each child is a full `pi` that loads your installed extensions, about 220 MB each. With the default limit of 20,
plan for about 4.5 GB of memory while a large fan-out runs. Lower `maxConcurrent` on smaller machines.

Design notes and tickets: `.scratch/pi-pipipi/`.

## License

Apache-2.0
