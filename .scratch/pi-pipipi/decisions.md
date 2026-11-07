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
| `model` | `--model`; aliases `sonnet`/`opus`/`haiku`/`fable` map via settings, `inherit` = parent model, full IDs resolved in the pi model registry |
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
Model resolution: call `model` > definition `model` > settings default > parent model.

Built-in agents copied from Claude Code: `Explore`, `Plan`, `general-purpose`. User definitions with the same name override them.

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
