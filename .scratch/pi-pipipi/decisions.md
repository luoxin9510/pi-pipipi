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
