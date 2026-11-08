# pi-pipipi

Claude Code-compatible subagents for [pi](https://pi.dev). The extension registers one tool, `Agent`, for codemode
scripts. Each call runs an agent definition in its own `pi` subprocess and returns a structured result, so a script can
run agents in parallel and filter what reaches the model. In interactive pi you can watch the subagents in a panel
below the editor, open one in a full-screen view, and talk to it (see [Watching and talking](#watching-and-talking-to-subagents)).

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
| `codemode` | `false` keeps this agent on direct tools. Default: children see only the `codemode` tool and call their allowed tools from scripts. See [Codemode-only children](#codemode-only-children). |
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
with a warning. Children run as `pi --mode rpc` and get the prompt as a protocol message on stdin, not as a command
line argument, so prompts of any size work.

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
the parent session under `subagents/<parent session id>/`, with a small meta file per child (type, description, model,
status, turns, usage, times). With an in-memory parent session (`pi --no-session`), children are in memory too: they
cannot be resumed, and the subagent screen cannot show them: the panel shows a one-line notice instead of rows and
`/subagents` says so. The
`Agent` tool itself works as before. A resume without `subagent_type` reuses the agent type of the first run; a different
`subagent_type` is an error. Children inherit the parent's project trust.

## Watching and talking to subagents

This part needs interactive pi. In `-p` mode only the `Agent` tool exists.

### The panel

While a session has subagents, a panel sits below the editor. One row per subagent, oldest first:

```
Subagents (2)
  ● running · Explore(find auth code) · 3 turns · read · $0.0004
  ✓ completed · general-purpose(summarize) · 2 turns · $0.0011
```

| Marker | Status |
|---|---|
| `●` | running |
| `✓` | completed |
| `◐` | partial (stopped by `maxTurns`) |
| `✗` | failed |
| `■` | stopped by you or by an abort |

A row shows the type and description, turns, the last tool, and cost. A finished row stays 30 s (setting `panelLingerMs`) and then
drops out; running rows stay. Only subagents that ran in this pi process show as rows: ones rebuilt from disk after a
`/reload` are not rows and are reached with `/subagents`. The panel hides when it is empty. Older subagents of the session are still reachable with
`/subagents`.

| Key | Effect |
|---|---|
| `↓` on an empty editor | focus the panel |
| `↓` / `↑` | move the selection (`↑` on the first row, or `Esc`, goes back to the editor) |
| `Enter` | open the selected subagent's screen |
| `x` | stop the selected subagent (nothing happens on a row that is not running) |

While the panel has focus it takes `↑ ↓ Enter x Esc`. Any other key (ctrl+c, ctrl+d, text) goes to pi as usual and gives the
focus back to the editor. In an in-memory session (`pi --no-session`) the panel lists no rows, only a one-line notice that
subagents cannot be viewed.

`/subagents` lists every subagent of the session, newest first, including finished ones, ones from before a `/reload`
and ones from a resumed parent session. Pick one to open its screen.

### The subagent screen

It covers the whole terminal. It is a view: main's pi keeps running underneath, and your main session is not
switched. The header shows `‹ main (esc or /main)`, the subagent (`type(description)`, status, turns) and whether main
is idle or running. Below it is the subagent's conversation, drawn like pi draws a session: messages, tool calls with
their results, codemode scripts in full. While the subagent runs, the message it is writing streams in token by
token (text and thinking as they arrive, a tool call once its arguments are complete), taken from the child's rpc event
stream; finished messages come from its session file, which is read when the screen opens and when the child reports
that something was added (not on a timer). There is one input line at the bottom.

| Input | Effect |
|---|---|
| `PgUp` / `PgDn`, `↑` / `↓`, `Home` / `End` | scroll (`End` follows the live end) |
| `Esc` or `/main` | back to main |
| text + `Enter` | talk to the subagent (below) |
| `/stop` | stop the subagent |
| `/model` | pick a model from a list drawn on the screen (`↑↓`, `Enter`, `Esc`); `/model provider/id` names one |
| any other `/command` | says it is not available here |

There is no `main` row in the panel: the screen covers it, so use the back hint, `Esc` or `/main`.

**Talking.** Text you type goes to the subagent. If it is running, it is sent as a steer and the subagent takes it
after its current step. If it is finished, it is continued from its own session with its own prompt, tools and model,
and the reply streams in. After each exchange main gets a short note (what you said and the reply, cut at 2000
characters): as a steer if main is running, stored without starting a turn if main is idle.

**One process per subagent.** A subagent never runs two exchanges at once. If you type to a subagent that main's
script is resuming, your message waits in a queue and goes out when it is free (the screen says "queued"). The same
holds the other way round. A waiting resume does not hold one of the `maxConcurrent` slots.

**Stop.** `x` in the panel or `/stop` on the screen aborts a running subagent. The script's `Agent` call gets a
result, not an exception: `status: "failed"`, `error: "stopped by user"`. Turns and cost so far are kept. The
subagent is not lost: main can resume it with `resume`, or you can type to it.

**`/model`.** Changes the model of that subagent's conversation. A running subagent switches at once; the choice is
kept in its meta file for later exchanges. The agent definition file is not touched. Only models pi lists as available
are accepted.

## Codemode-only children

By default a child sees only the `codemode` tool (pi's `codemode` extension in `only` mode, added with `-e`) and calls
its allowed tools from scripts. The `tools` / `disallowedTools` of the agent still bind inside those scripts, and a
`tools` list without `mcp__` entries still removes every MCP tool. The child's system prompt gets one extra line:
"Use the `codemode` tool for all tool calls, and put independent calls in one script."

Why: fewer turns and less wall time. In the [comparison](#codemode-only-vs-direct-tools) below, codemode-only needed
2 to 3 turns where direct tools needed 2.6 to 4.4, at about the same cost.

Opt out:

- per agent: `codemode: false` in the agent file
- for everything: `"childCodemode": "inherit"` in `pipipi` settings (direct tools, as in v1)

## MCP

MCP tools are excluded from a child whenever its agent file has a `tools` list without `mcp__` entries. An agent with
no `tools` list gets your normal tools and every installed extension, MCP included. `mcpServers` in an agent file is
still ignored (a warning).

## Limits and memory

- The registry, panel and queues live in the memory of the pi process. After `/reload` or in a resumed session the
  registry is rebuilt from the meta files; a meta file left in `running` (pi died) shows as `stopped`. A meta file that cannot be read is skipped with a
  warning at session start.
- `maxConcurrent` (default 20) caps running children per pi process; extra calls and extra exchanges queue.
- Each child is a full `pi`, about 220 MB (see [Stress test](#stress-test)).
- An in-memory parent session keeps nothing on disk: no meta files, no viewing, no resume.

## Config

Optional, in `.pi/settings.json` or `~/.pi/agent/settings.json`:

```jsonc
"pipipi": {
  "models": { "haiku": "anthropic/claude-haiku-5-5" },  // per-alias overrides of the defaults above
  "defaultModel": "haiku",                         // default "haiku"; "inherit" follows the session model
  "toolMap": { "WebFetch": "mcp__fetch__fetch" },  // merged over the built-in map
  "maxConcurrent": 20,                             // running children per pi process; extra calls queue. The first session's value wins for the process
  "childCodemode": "only",                         // "only" (default): children see only `codemode`; "inherit": v1 behaviour, direct tools
  "panelLingerMs": 30000,                          // how long a finished subagent stays in the panel (the pty tests shorten it)
  "piCommand": "pi"
}
```

## Development

```bash
npm install
npm test            # real suite (test/real) + fault suite (test/faults)
npm run test:real   # only the real suite
npm run test:faults # only the fault suite: scripted fake pi (test/fake-pi.mjs), no model, free
npm run test:panel  # panel rows, focus rules and screen rendering against the registry: no pi, no model, free
npm run test:tui    # drives real interactive pi in a pty (node-pty + headless xterm), real haiku
npm run typecheck
```

`npm test` runs all four suites (`test/real`, `test/faults`, `test/panel`, `test/tui`). The `test/tui` tests start the
real `pi` with this checkout loaded and read its screen, so they are slow (about 25 to 30 s each) and each costs about a
cent. Never run `npm test` from inside a test.

The real suite drives the Agent tool in-process with real children: the pinned pi (`node_modules/.bin/pi`, 1.5.0) on
real Claude Haiku 5.5. It needs Anthropic credentials in `~/.pi/agent/auth.json`; so do the `test/tui` tests, the evals and the stress test
(the panel and fault suites need none). Each test gets a temp repo, a temp
HOME and a temp pi agent dir (auth linked from yours, no packages), so your own setup does not leak in. Assertions
read structure and side effects (the child's session file, files it wrote), never wording. `npm test` runs 110 tests (70 real, 18
fault, 14 panel, 8 tui) in about 1.5 to 2 min wall, files in parallel. The in-process real suite costs about $0.02 per run
(measured with `PIPIPI_COST_LOG=<file> npm test`, which makes each real test file append its sum of
`usage.cost.total`); the tui tests add roughly a cent each. The fault suite covers what real pi will not do on
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

`evals/cases.ts` holds 14 cases. Twelve call the tool in-process with real `pi` children (listing, read-only agents
cannot write, custom agent tools, resume, `maxTurns`, skills, context files vs `omitClaudeMd`, model aliases, a bad
model, no nesting, parallel runs, and a steer that changes a running subagent's course, sent through the registry handle and graded by an exact token and a file that must not appear). Two start a real parent `pi` on haiku with codemode and this checkout
(`--no-extensions -e builtin:codemode -e ./src/index.ts`), one with a given script and one where the model decides to
delegate. Cases are graded from the structured result and side effects. `defaultModel` is pinned to `haiku` whatever
your settings say, and every case checks that every result (or, for the parent cases, every assistant message of the
parent and its children) ran on haiku. A case running over 5 minutes is aborted and its children stopped. Results go
to `evals/results/` (ignored by git).

Children are `pi --mode rpc` and codemode-only by default. Last run (pi 1.5.0, v2): 39/39 over 3 runs for the 13 original cases, $0.027 in all; the steer case passed 11/13 over two batches (the miss: haiku batched both steps into one codemode script, so there was nothing left to steer; $0.0005 per run). The first version of the suite found a bug that the fake-pi
tests had missed (a run could go past `maxTurns` and still be reported `completed`), fixed since. Two checks depend on
the model or on timing and could fail without a bug: `maxTurns` needs haiku to call a tool on its first turn, and the
parallel case needs wall time under 0.7 × the summed run times.

#### Codemode-only vs direct tools

`npm run compare -- --runs 5` runs the same two tasks with the default children (codemode-only) and with an agent that
lists `Read, Grep, Glob, Bash` under `childCodemode: "inherit"` (direct tools), 5 runs each, children in parallel:

| task | mode | correct | turns | wall s | cost |
|---|---|---|---|---|---|
| 5 reads + grep | codemode-only | 5/5 | 2.0 | 4.9 | $0.00122 |
| 5 reads + grep | direct tools | 3/5 | 2.6 | 8.1 | $0.00101 |
| search + read chain | codemode-only | 5/5 | 3.0 | 6.0 | $0.00067 |
| search + read chain | direct tools | 5/5 | 4.4 | 10.2 | $0.00074 |

Codemode-only saves turns and about 40% wall time. Cost is about equal (+21% on the first task, -9% on the second, on
fractions of a cent); direct tools got the first task wrong twice (haiku miscounted by hand).

### Stress test

```bash
npm run stress                     # haiku: 20 calls at once, then 40 (20 run, 20 queue)
npm run stress -- --calls 20 --limit 20
npm run stress -- --fake           # 200 calls against test/fake-pi.mjs: the extension's own overhead
```

Last run (Apple M5, 10 cores, 24 GB; pi 1.5.0, v2 rpc codemode-only children; each call an Explore reading one file):

| | 20 calls | 40 calls (limit 20) | 200 fake calls (limit 20, 550 ms each) |
|---|---|---|---|
| completed (all on haiku, right answer) | 20/20 | 40/40 | 200/200 |
| wall | 5.3 s | 11.3 s | 6.1 s (ideal 5.5 s) |
| call latency p50 / p95 | 4.7 / 5.2 s | 7.9 / 9.4 s | 3.3 / 6.0 s |
| latency − child run p50 / p95 (queue wait + spawn) | 9 / 17 ms | 21 ms / 5.2 s | 2.8 / 5.4 s |
| peak children (sampled from `ps`) | 20 | 20 | 20 |
| peak RSS (all children) | 4.5 GB | 4.9 GB | 0.9 GB |
| cost | $0.0085 | $0.0059 | — |

The 40-call phase costs less than the 20-call one because it runs second: the shared system prompt is then in the
prompt cache. One earlier run sampled 21 children once (`ps` caught a short-lived extra process); the limit itself is a
semaphore and never lets more than 20 children start.

Each child is a full `pi` that loads your installed extensions, about 220 MB each. With the default limit of 20,
plan for about 4.5 GB of memory while a large fan-out runs. Lower `maxConcurrent` on smaller machines.

Design notes and tickets: `.scratch/pi-pipipi/` (v1) and `.scratch/pi-pipipi-v2/` (v2).

## License

Apache-2.0
