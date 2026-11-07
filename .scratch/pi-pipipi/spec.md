# pi-pipipi: spec (v1)

Source of truth for decisions: `decisions.md`. This spec turns them into modules, contracts and tests.
Facts checked against `@earendil-works/pi-coding-agent@1.5.0` docs. Items marked **[verify]** are confirmed during implementation of the ticket that needs them.

## 1. What it is

A pi package with one extension. The extension registers a tool `Agent` that codemode scripts call to run a Claude Code-compatible subagent in a `pi` subprocess. The script gets a structured result and decides what reaches the model.

```js
// inside a codemode script in the main session
const [a, b] = await Promise.all([
  tools.Agent({ description: "find auth code", prompt: "...", subagent_type: "Explore" }),
  tools.Agent({ description: "find session store", prompt: "...", subagent_type: "Explore" }),
]);
return [a.output, b.output].join("\n---\n");
```

## 2. Module layout

```
package.json            # name pi-pipipi, keywords [pi-package], pi.extensions ["./src/index.ts"]
src/index.ts            # extension entry: read config, register Agent tool (unless nested)
src/config.ts           # read + validate the `pipipi` settings block
src/definition.ts       # parse one agent .md file -> AgentDefinition | skip reason
src/discovery.ts        # scan the five sources, apply precedence, collect warnings
src/builtin/*.md        # Explore, Plan, general-purpose (Claude Code format)
src/resolve.ts          # definition + call input + config -> ChildSpec (argv, env, prompt files)
src/runner.ts           # spawn pi, parse JSONL, enforce maxTurns, collect usage -> RunResult
src/agent-tool.ts       # tool schema, execute(): discovery -> resolve -> semaphore -> runner
test/fake-pi.mjs        # scripted stand-in for the pi binary
test/*.test.ts          # node:test
AGENTS.md  README.md  LICENSE (Apache-2.0, kept)
```

Runtime dependency: `yaml` (frontmatter parsing). Types from `@earendil-works/pi-coding-agent` and `typebox`, which pi supplies to extensions (dev dependencies only).
Tests run with `node --test --experimental-strip-types` on Node 22. No build step; pi loads `.ts` extensions directly.

## 3. Config

Read from `pi.getSettings().pipipi` **[verify: unknown keys survive]**. If they do not, read `.pi/pipipi.json` (project) over `~/.pi/agent/pipipi.json` (user) instead.

```jsonc
"pipipi": {
  "models": {                       // Claude aliases -> pi model pattern (passed to --model)
    "opus":   "anthropic/claude-opus-5-5",
    "sonnet": "anthropic/claude-sonnet-5-5",
    "haiku":  "anthropic/claude-haiku-5-5",
    "fable":  "anthropic/claude-fable-5-1"
  },
  "defaultModel": "haiku",          // optional; like CLAUDE_CODE_SUBAGENT_MODEL
  "toolMap": { "WebFetch": "mcp__fetch__fetch" },  // optional; merged over the built-in map
  "maxConcurrent": 20,              // optional; default 20
  "piCommand": "pi"                 // optional; path to the pi binary (tests point it at fake-pi)
}
```

Validation is at this boundary: wrong types throw at extension load with the offending key named. All keys optional.

## 4. Agent definitions

### 4.1 Parsing (`definition.ts`)

Input: file path + text. Output: `{ ok: true, def }` or `{ ok: false, reason }`.

Skip (with reason) exactly where Claude Code skips:
- opening `---` is not the first line;
- YAML does not parse;
- `name` missing, not a string, longer than 256 chars, contains `:`, or starts with `-`;
- `description` missing.

`AgentDefinition`:

```ts
interface AgentDefinition {
  name: string;
  description: string;
  prompt: string;                 // body after the closing ---, trimmed
  tools?: string[];               // comma string or YAML list, split + trimmed
  disallowedTools?: string[];
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTurns?: number;              // positive integer
  skills?: string[];
  omitClaudeMd?: boolean;
  source: string;                 // file path, or "builtin:<name>"
  inert: string[];                // tier B/C fields present in the file
}
```

A tier A field with a wrong type (e.g. `maxTurns: "ten"`) is a skip reason, not a silent default.
Tier B fields (`mcpServers`, `isolation`, `autoCompactWindow`, `color`) and tier C fields (`permissionMode`, `hooks`, `memory`, `background`, `initialPrompt`, `experimental`) are recorded in `inert`. Any other key is ignored silently, as in Claude Code.

### 4.2 Discovery (`discovery.ts`)

Sources, highest priority first:
1. `.pi/agents/` — every such dir from cwd up to the repo root (closest wins)
2. `.claude/agents/` — same walk
3. `~/.pi/agent/agents/`
4. `~/.claude/agents/`
5. `src/builtin/`

Each dir is scanned recursively for `*.md`. Identity is `name`, not the file path. A higher source replaces a lower one with the same name. Two files with the same name in the same source: the first in sorted path order wins, and a warning names both.
The repo root is the nearest ancestor containing `.git`; with none, only cwd is scanned.

Output: `{ agents: Map<string, AgentDefinition>, warnings: string[] }`. Warnings cover: skipped files (path + reason), same-source duplicates, inert fields (`<name>: field "hooks" has no effect in pi-pipipi`).

Discovery runs once at `session_start` (to build the tool description and show warnings via `ctx.ui.notify` when `ctx.hasUI`) and again on every `Agent` call, so edits apply without reload, as in Claude Code.

### 4.3 Built-in agents

Written by us in Claude Code format, matching Claude Code's roles (not its prompt text):

| Name | tools | disallowedTools | model | Other |
|---|---|---|---|---|
| `Explore` | `Read, Grep, Glob, LS, Bash` | `Write, Edit` | `inherit` | `omitClaudeMd: true`; prompt asks for a compressed report and a thoroughness level from the task |
| `Plan` | `Read, Grep, Glob, LS, Bash` | `Write, Edit` | `inherit` | `omitClaudeMd: true`; returns a step plan with files to change |
| `general-purpose` | (omitted: inherit) | | `inherit` | multi-step research and edits |

## 5. Resolving a call (`resolve.ts`)

Pure function. Input: definition, call input, config, parent context (`{ model: "provider/id", thinking, cwd, trusted, sessionDir? }`). Output:

```ts
interface ChildSpec {
  command: string;           // config.piCommand
  args: string[];
  env: Record<string, string>;
  systemPrompt: string;      // written to a temp file, path goes into args
  maxTurns?: number;
  agentId: string;
  warnings: string[];
}
```

### 5.1 Model

Order: call `model` > definition `model` > `config.defaultModel` > parent model.
- `inherit` → parent model.
- `opus` | `sonnet` | `haiku` | `fable` → `config.models[alias]`; a missing mapping throws `pipipi.models.<alias> is not configured`.
- Anything else is passed to `--model` as is (full ID or `provider/id`); pi resolves it.

Thinking: call `effort` > definition `effort` > parent thinking level. Passed as `--thinking <level>`.

### 5.2 Tools

1. Map names: built-in map `Read→read, Write→write, Edit→edit, Bash→bash, Grep→grep, Glob→find, LS→ls`, merged with `config.toolMap`. Lowercase pi names and `mcp__…` pass through unchanged. `Agent` and `Task` are dropped (no nesting in v1). Any other name is dropped with a warning `tool "WebFetch" has no pi equivalent`.
2. `disallowedTools`: `Name(...)` specifiers reduce to `Name` (whole tool removed). Mapped names go to `--exclude-tools`.
3. `tools` present → mapped names go to `--tools` as a plain list. If the list is empty after mapping and deny, throw `agent "<name>" has no usable tools`.
4. `tools` absent → no `--tools` flag; the child gets pi's default tools minus the excludes.

### 5.3 System prompt

Claude semantics: the agent body replaces the default prompt. The file passed to `--system-prompt` is:
1. the definition `prompt`;
2. preloaded skills: for each name in `skills`, the full `SKILL.md` text under a `# Skill: <name>` heading. Lookup by skill `name` in `.pi/skills`, `.agents/skills`, `.claude/skills` (cwd up to repo root), then `~/.pi/agent/skills`, `~/.agents/skills`, `~/.claude/skills` **[verify: whether the extension can read pi's loaded skill list instead]**. Missing skills are skipped with a warning, as in Claude Code. Unlisted skills stay discoverable by the child as normal pi skills;
3. an environment block: cwd, platform, date.

### 5.4 Flags and env

```
pi --mode json -p
   --model <m> --thinking <t>
   --system-prompt <tmpfile>
   [--tools a,b,c] [--exclude-tools x,y]
   [--no-context-files]                     # omitClaudeMd
   --approve | --no-approve                 # mirrors parent ctx.isProjectTrusted()
   --session-dir <dir> --session-id <agentId>   # or --no-session, see 5.5
   <prompt>
env: PIPIPI_DEPTH=1 (plus the parent's environment)
```

The prompt is passed as the final argument. **[verify: argv length is fine for long prompts; if not, pass `@file`]**.

### 5.5 Sessions and resume

- `agentId`: new random id (`[a-z0-9]{12}`) per call, or the call's `resume` value.
- Parent session persisted (`ctx.sessionManager.getSessionFile()` defined): `--session-dir <dir of parent session file>/subagents/<parent session id> --session-id <agentId>`. `--session-id` opens the existing session or creates it, so a resume uses the same flags.
- Parent session in memory: `--no-session`; `resume` throws `resume needs a persisted parent session`.
- Resume of an unknown `agentId` throws (checked by looking for the session file before spawning).
- A resumed run uses the definition named in the call; the caller passes the same `subagent_type`.

## 6. Running the child (`runner.ts`)

Input: `ChildSpec`, `AbortSignal`, `onProgress`. Output:

```ts
interface RunResult {
  status: "completed" | "partial" | "failed";
  output: string;          // text of the last assistant message
  usage: Usage;            // summed over assistant message_end events
  turns: number;           // count of turn_end events
  durationMs: number;
  error?: string;          // set when status is "failed"
}
```

- Read stdout as bytes, split records on LF only, strip an optional CR, `JSON.parse` each (do not use `readline`; JSON mode may contain U+2028/U+2029 inside strings). A record that is not valid JSON fails the run with the line in `error`.
- First record must be `{"type":"session",…}`; otherwise failed.
- `message_end` with `role: "assistant"`: add `usage`; remember text blocks as the latest output; if `stopReason` is `"error"`, remember `errorMessage`.
- `turn_end`: `turns++`, call `onProgress({ turns, lastTool })`. When `turns === maxTurns`, send SIGTERM; the result is `partial` with the latest output.
- `tool_execution_start`: track `lastTool` for progress.
- `agent_settled`: the run is done.
- Exit: code 0 and `agent_settled` seen and no error → `completed`. Non-zero exit, a missing `agent_settled`, or an assistant error → `failed`, with `error` = assistant `errorMessage`, or the last 30 lines of stderr.
- Abort signal: SIGTERM the child (pi sends SIGKILL after 5 s itself for `pi.exec`; we do the same here), then throw `aborted`.
- The temp system prompt file is removed when the run ends.

## 7. The `Agent` tool (`agent-tool.ts`)

```ts
pi.registerTool({
  name: "Agent",
  exposure: "codemode",
  description,           // built at session_start, lists agent names + descriptions
  parameters: Type.Object({
    description: Type.String(),            // 3-5 word label, shown in progress
    prompt: Type.String(),
    subagent_type: Type.Optional(Type.String()),   // default "general-purpose"
    model: Type.Optional(Type.String()),
    effort: Type.Optional(StringEnum(["low","medium","high","xhigh","max"])),
    resume: Type.Optional(Type.String()),          // agentId from an earlier result
    run_in_background: Type.Optional(Type.Boolean()),  // accepted, ignored + warning
    isolation: Type.Optional(Type.String()),           // accepted, ignored + warning
    name: Type.Optional(Type.String()),                // accepted, ignored
  }),
  outputSchema,          // AgentResult below
  execute,
});
```

`AgentResult` (the `structuredContent`):

```ts
{
  status: "completed" | "partial" | "failed";
  agentId: string;
  agentType: string;
  output: string;
  model: string;           // resolved --model value
  usage: Usage;
  turns: number;
  durationMs: number;
  warnings: string[];
  error?: string;
}
```

`execute`:
1. Discover agents; unknown `subagent_type` throws with the list of available names.
2. Resolve (section 5). Resolution errors throw.
3. Wait for a slot in a process-wide semaphore of `maxConcurrent`.
4. Run (section 6), streaming `onUpdate` progress: `<description>: turn N, <lastTool>`.
5. Return `{ content: [text summary], details: result, structuredContent: result, usage: result.usage, isError: status === "failed" }`. `failed` returns rather than throws so scripts still get the structured result.

Registration is skipped when `PIPIPI_DEPTH` is set (`>= 1`), so children cannot spawn agents.

## 8. Error policy

Follows AGENTS.md: fail fast, validate only at boundaries.
- Boundaries: settings block, agent files, call input (schema), child JSONL stream, child exit status.
- Throw: bad config, unknown agent, unmapped model alias, no usable tools, bad resume, abort.
- Structured `failed`: the child ran and failed (exit code, provider error, bad stream).
- Warn and continue: skipped definition files, inert fields, unmapped tools, missing skills, ignored call fields. These are Claude Code compatibility behaviours, agreed in decisions.
- No retries anywhere. pi's own provider retry inside the child is untouched.

## 9. Tests

Highest seam: call the registered tool's `execute` with a fake `pi` (`config.piCommand` → `test/fake-pi.mjs`). The fake reads a scenario from an env var, writes it as JSONL, records its argv and env to a file for assertions, and exits with the scenario's code.

| # | Area | Case |
|---|---|---|
| 1 | definition | valid Claude file with every tier A field parses; comma and list `tools` both work |
| 2 | definition | each skip reason from 4.1 yields the matching reason |
| 3 | definition | tier B/C fields land in `inert`; unknown keys ignored |
| 4 | discovery | precedence across the five sources; closest project dir wins; same-source duplicate warns |
| 5 | discovery | a real `.claude/agents/` file from Claude Code docs loads unchanged |
| 6 | resolve | model order, aliases, `inherit`, missing alias throws |
| 7 | resolve | tool mapping, deny-first, `Bash(git push *)` removes bash, `mcp__*` passes, unmapped warns, empty list throws |
| 8 | resolve | skills preloaded into the prompt file; missing skill warns |
| 9 | resolve | `omitClaudeMd`, trust flag, session flags, `PIPIPI_DEPTH=1` |
| 10 | runner | completed run: output = last assistant text, usage summed, turns counted |
| 11 | runner | `maxTurns` stops the child → `partial` |
| 12 | runner | provider error, non-zero exit, garbage line, missing session header → `failed` with `error` |
| 13 | runner | U+2028 inside a JSON string does not split a record |
| 14 | runner | abort kills the child and throws |
| 15 | tool | end-to-end execute through fake pi returns the `AgentResult` shape |
| 16 | tool | resume reuses the agentId and session flags; unknown agentId throws |
| 17 | tool | concurrency: with `maxConcurrent: 2`, the third call waits |
| 18 | index | `PIPIPI_DEPTH=1` → `Agent` not registered |

Real-model smoke test (run by the owner): a script in README that calls `Explore` twice in parallel from a codemode session and prints the results and cost.

## 10. Out of scope (v1)

Background runs, fork, worktree isolation, hooks, per-agent MCP servers, memory, budget cap, nesting, custom TUI rendering beyond `onUpdate` text, mp workflow, modes.
