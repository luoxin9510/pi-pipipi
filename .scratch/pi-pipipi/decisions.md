# pi-pipipi: decisions (v1)

Agreed in grilling. Verified against `@earendil-works/pi-coding-agent@1.5.0` docs.

## Scope

pi-pipipi is a pi extension that runs Claude Code-compatible subagents, exposed as a tool for codemode scripts.
The mp workflow and work/dev modes are out of scope for v1.

## Architecture

- The main session uses codemode. The extension registers one tool, `Agent`, with `exposure: "codemode"`.
  The model cannot see it directly. Scripts call `tools.Agent({...})`, batch calls with `Promise.all`, and filter results before returning them.
- Each `Agent` call spawns one `pi --mode json -p` subprocess. The child is a plain pi session, not codemode.
  It runs the agent definition exactly as Claude Code would: listed tools are declared to the child model.
- The tool returns a structured result (`outputSchema` + `structuredContent`) and reports the child's `usage` so it counts toward session cost.

## Agent definition format: fully Claude Code compatible

An existing `.claude/agents/*.md` file must work unchanged.

Discovery, highest priority first (recursive; project dirs walk up from cwd to repo root):
1. `.pi/agents/`
2. `.claude/agents/`
3. `~/.pi/agent/agents/`
4. `~/.claude/agents/`
5. Built-in agents shipped with the package

Invalid files (no `name`, no `description`, bad YAML, bad name) are skipped as Claude Code does, with a visible warning per file.
Unknown fields are ignored.

Field handling:

| Tier | Fields | Handling |
|---|---|---|
| A: implemented | `name`, `description`, body (system prompt), `tools`, `disallowedTools`, `model`, `effort`, `maxTurns`, `skills`, `omitClaudeMd` | Same semantics as Claude Code |
| B: mapped later | `mcpServers`, `isolation: worktree`, `autoCompactWindow`, `color` | Via pi equivalents, v2 |
| C: accepted, no effect | `permissionMode`, `hooks`, `memory`, `background`, `initialPrompt`, `experimental` | Parsed; warn that the field has no effect |

Mapping to child process flags:

| Field | pi flag |
|---|---|
| body | `--system-prompt <file>` |
| `tools` / `disallowedTools` | `--tools` / `--exclude-tools` (deny applied first; `mcp__*` patterns pass through; `Bash(...)` in deny removes the whole tool) |
| `model` | `--model`; aliases `sonnet`/`opus`/`haiku`/`fable` map to the same-name Anthropic models by default (overridable in settings), `inherit` = parent model (explicit only), full IDs resolved in the pi model registry |
| `effort` | `--thinking` (same level names) |
| `skills` | Full SKILL.md text preloaded into the system prompt (Claude semantics) |
| `omitClaudeMd` | `--no-context-files` |
| `maxTurns` | Parent counts `turn_end` events in the JSON stream, stops the child, returns `partial` |
| resume | `--session-dir` on first run, `--session <id>` on resume |

Tool name mapping (extendable in settings): `Read`→`read`, `Write`→`write`, `Edit`→`edit`, `Bash`→`bash`, `Grep`→`grep`, `Glob`→`find`, `LS`→`ls`, `mcp__*` unchanged.
Tools with no pi equivalent (e.g. `WebFetch`, `NotebookEdit`, `TodoWrite`) are dropped with a warning; the agent still runs.

## Invocation

Tool name `Agent`. Input is compatible with Claude Code's Agent tool: `{ description, prompt, subagent_type?, model?, resume? }`.
Output: `{ status: "completed" | "partial" | "failed", agentId, output, usage, turns, durationMs, model }`.
Model resolution: call `model` > definition `model` > `pipipi.defaultModel` (default `haiku`). The parent model is used only for an explicit `inherit`.

Built-in agents modelled on Claude Code's (roles and tool sets; prompts written by us): `Explore`, `Plan`, `general-purpose`. User definitions with the same name override them.

## Limits

- Nesting: fixed at 1 level in v1. Children get `PIPIPI_DEPTH=1` and do not register `Agent`.
- Concurrency: follows Claude Code, default 20 running subagents, configurable; extra calls queue.

## Config

`.pi/settings.json` under `pipipi`: model alias map, tool name map, concurrency.
Verify that `pi.getSettings()` keeps unknown keys; otherwise use `.pi/pipipi.json`.

## Project

- Name: `pi-pipipi`. Repo to be renamed to `pi-pipipi` (by the owner on GitHub). Package lives at the repo root.
- License: Apache-2.0 (kept).
- Tests: a fake `pi` binary on `PATH` that emits scripted JSON event streams. Real-model smoke tests run locally by the owner.

## Out of scope for v1

Background runs, fork, worktree isolation, hooks, MCP servers per agent, memory, budget cap, nesting > 1, mp workflow, modes.

## Grill 2 (2026-11-07): spec choices beyond the above

1. The agent body **replaces** pi's default system prompt; preloaded skills and an environment block (cwd, platform, date) follow it.
2. Built-in prompts are written by us, modelled on Claude Code's roles.
3. Child sessions live in `<parent session dir>/subagents/<parent session id>/` (`--session-dir` + `--session-id <agentId>`). An in-memory parent gives in-memory children, which cannot be resumed.
4. Child project trust mirrors the parent (`--approve` / `--no-approve`). Agent definitions are read regardless of trust, as in Claude Code.
5. Caller errors throw (unknown agent, no usable tools, bad resume). A child that ran and failed returns `status: "failed"` with `error` and `isError: true`.
6. `run_in_background`, `isolation`, `name` are accepted, ignored, and reported in `warnings`.
7. Result adds `agentType`, `warnings`, `error?` to the fields above.
8. Call input also takes an optional `effort` (thinking override).
9. `subagent_type` defaults to `general-purpose`.
10. Definitions are re-read on every call. The agent list in the tool description is a snapshot from `session_start` (documented).
11. A tier A field with a wrong type skips the whole file. Same name twice in one source: first in sorted path order wins, with a warning. Project dirs walk from cwd to the nearest `.git`; without one only cwd. `Agent`/`Task` in `tools` are dropped silently.
12. An agent without `tools` inherits the user's pi defaults: `defaultTools` and all installed extensions. pi-pipipi itself stays off in children (`PIPIPI_DEPTH`).
13. `maxTurns` reached: stop the child, return `partial`, no extra summary turn.
14. `output` is the text of the last assistant message that has text.
15. Model: aliases default to `anthropic/claude-{opus,sonnet,haiku}-5-5` and `anthropic/claude-fable-5-1`, overridable via `pipipi.models`. `pipipi.defaultModel` defaults to `haiku`. `inherit` must be explicit. The README explains this, including what to change without Anthropic credentials.
16. Skills are looked up in pi's locations (`.pi/skills`, `.agents/skills` from cwd to repo root, `~/.pi/agent/skills`, `~/.agents/skills`) plus `.claude/skills` and `~/.claude/skills`, recursively. Skill paths from settings or packages are not searched in v1; a missing skill warns.
17. All three built-in agents omit `model`, so they default to haiku like everything else.
18. The concurrency limit is per pi process.
19. A first run writes `<agentId>.json` (`{ agentType }`) next to the child session. Resume without `subagent_type` uses the stored type; a different `subagent_type` throws.
20. Prompts over 100 KB go to the child as `@<tmpfile>` (Linux caps one argv string at 128 KiB). Documented.

## Grill 3 (2026-11-08): v2, viewing and entering subagents; codemode-only children

Facts that shaped it (pi 1.5.0): an `Agent` call made from a codemode script gets no TUI row of its own (only a
one-line summary under the codemode row), so the UI is ours to build from `tool_execution_*` events. pi's
`switchSession` aborts the running turn of the process, so it cannot be used while main runs. `codemode.mode` is read
from settings only (no flag). A `--tools` allowlist does not drop MCP tools.

Viewing (as in Claude Code):
1. Only the current parent session's subagents. An in-memory parent: "cannot view" notice.
2. A panel below the editor: one row per subagent (type, description, status, turns, last tool, cost). Running rows
   stay; finished rows stay 30 s. `/subagents` lists all of the session's subagents, old ones included.
3. Empty editor + ↓ focuses the panel; ↑/↓ select; Enter enters; `x` stops a running subagent. A stopped child
   returns `status: "failed"`, `error: "stopped by user"` to the script (no throw); main may still resume it.
4. Standalone in pi-pipipi; no dependency on pi-roost.

Entering:
5. A full-screen subagent screen in the parent's TUI, not `switchSession`: header `main › <type>(<description>)`,
   the transcript drawn with pi's own message components (live while it runs), an editor at the bottom. Main keeps
   running underneath. Back: `/main`, or the `main` row in the panel.
6. Commands inside: `/model` (via rpc, this conversation only), `/stop`, `/main`.
7. Typing to a running subagent steers it (rpc `steer`); to a finished one resumes it.
8. One process per subagent at a time; whoever comes second (the user or main's script) queues; no error.
9. After each exchange, main gets a short note ("user said …; it replied …"): as a steer while main runs, stored
   without triggering a turn while main is idle.

Children:
10. Children run as `pi --mode rpc`; the prompt goes over stdin (the `@file` path for long prompts goes away).
    The fake pi gains an rpc mode.
11. `pipipi.childCodemode`: `"only"` (default: the model sees only `codemode`) or `"inherit"` (v1 behaviour).
    An agent file may set `codemode: false` (pi-only field).
12. With `tools`, a child gets `--tools codemode,<mapped tools>`; the allowlist also binds inside scripts (an eval
    checks a read-only agent cannot write from a script).
13. Every child system prompt ends with a line telling it to use codemode and batch independent calls in one script.
14. A comparison eval (codemode-only vs direct tools: turns, time, cost) goes in the README. Default stays `"only"`
    unless the data is clearly worse (then back to the owner).
15. A `tools` list without `mcp__` entries also passes `--exclude-tools mcp__*`.

Process: one v2 spec, then the Matt Pocock flow (to-spec → to-tickets → implement → code-review → pr).

## Grill 4 (2026-11-08): v3 — background work; worktrees, memory, polish

Facts that shaped it: a codemode call blocks main's turn until its script ends, so `await tools.Agent` keeps main busy.
A prototype (a pi-pipipi codemode tool wrapping pi's own via `createCodemodeExtension`, returning early) showed that a
script keeps calling tools after its codemode call has returned and main's turn has ended, and that a
`sendMessage(..., { triggerTurn: true })` wakes an idle main with the result. `ctrl+b` is pi's editor cursor-left.

v3a — background (first):
1. Like Claude Code, delegating does not block main by default: when a codemode script starts an `Agent` call, the
   whole script moves to the background. The codemode call returns at once ("moved to the background, id S…"); main's
   turn can end; the script keeps running and still awaits its agents' results.
2. `run_in_background` on an `Agent` call: omitted → rule 1; `false` → this script stays in the foreground (main waits);
   `true` → this agent does not block the script either (the call returns `running`; the agent reports on its own).
3. A script without agents runs in the foreground; ctrl+b moves it to the background, but only while a foreground
   script runs and the editor is empty (otherwise ctrl+b stays cursor-left).
4. When a background script (or a `true` agent) ends, main gets a message: the script's return value (over 8 KB:
   truncated, full text in a file whose path is given), the agents it ran (id, status, cost), or its error. Main idle:
   it starts a turn. Main running: delivered as steer.
5. The panel shows each background script as a row with its agents indented below; `x` on a script row stops the
   script and its agents.
6. Several background scripts may run at once; agents still share `maxConcurrent`.
7. Session end or `/reload` stops everything in the background (stopped, resumable).
8. pi-pipipi replaces main's built-in codemode with a wrapper around pi's own (the user's codemode settings still
   apply). `pipipi.backgroundScripts: false` turns this off (v2 behaviour). The porting guide covers it.
9. No `AgentWait` tool.

v3b — later:
10. Worktree isolation (`isolation: "worktree"` in the call or the agent file, the call wins): local repos are fine;
    not a git repo → caller error. `<repo>/.pi/worktrees/<agentId>`, branch `pipipi/<agentId>`, `/.pi/worktrees/` in
    `.git/info/exclude`. Based on the main checkout's HEAD (a warning when it has uncommitted changes);
    `.worktreeinclude` files copied. Changed = uncommitted or untracked files or new commits: kept, the result gives
    path, branch, changed files and commits; unchanged: removed with its branch after each exchange. No auto-commit,
    merge or sweep; `/subagents worktrees` lists and removes kept ones. A resume re-enters its worktree.
11. Memory (`memory: user|project|local`): Claude Code's directories (`~/.claude/agent-memory/<name>/`,
    `.claude/agent-memory/<name>/`, `.claude/agent-memory-local/<name>/`), always under the main checkout. First 200
    lines / 25 KB of `MEMORY.md` in the prompt plus our own instructions. Read/Write/Edit enabled automatically unless
    `disallowedTools` denies Write/Edit (then read-only, with a warning); the risk is documented. The local dir goes
    into `.git/info/exclude`.
12. Polish: `color` on panel rows and the screen header; model and effort on the screen and in `/subagents`;
    `/subagents stop` (all) and a shortcut.

### Grill 4 addendum (2026-11-08): v3b gaps, all as recommended

1. Resume after an unchanged worktree was removed: recreate it at the same path and branch from the main checkout's
   current HEAD; a changed one removed by the user is an error naming the path.
2. Resume ignores the call's `isolation` (the stored one wins, with a warning).
3. `.worktreeinclude`: gitignore syntax, only files also matched by `.gitignore` are copied.
4. Memory outside a git repo: `project`/`local` use the parent's cwd; no `info/exclude` write.
5. `color`: Claude Code's eight names mapped to fixed 256-colour escapes; unknown values warn once.
6. Stop all: `shift+x` while the panel is focused, `/subagents stop` anywhere; no global key.
7. `/subagents stop` also stops background scripts.
8. Session end / reload while an exchange runs: same end-of-exchange check (unchanged removed, changed kept).
9. `/subagents worktrees` looks only at the current cwd's main checkout.
