# pi-pipipi v1: Claude Code-compatible subagents for pi codemode

Status: ready-for-agent

Decisions behind this spec: `decisions.md` (grill 1, and "Grill 2" of 2026-11-07, which approved it).

## Problem Statement

I use pi with codemode, where the model writes a script that calls tools and only the script's result reaches the
model. I want that script to hand work to subagents the way Claude Code does: several focused agents in parallel, each
with its own prompt, tools and model, returning a short report. pi has no such tool. I also already have Claude Code
agent definitions (`.claude/agents/*.md`) that I don't want to rewrite for pi.

## Solution

A pi package with one extension. It registers a tool named `Agent` that only codemode scripts can call. Each call runs
one agent definition, in Claude Code's file format, as a separate `pi` process in JSON mode, and returns a structured
result: status, the agent's final message, token usage and cost, and an id to resume it later. A script can run many
agents with `Promise.all`, filter their output, and return only what the model needs. Existing Claude Code agent files
work unchanged; pi-pipipi maps their fields to pi's command-line flags. Subagents run on Claude Haiku 5.5 unless the
call or the definition says otherwise.

## User Stories

1. As a codemode script author, I want to call `tools.Agent({ description, prompt, subagent_type })`, so that I can hand a task to a subagent from a script.
2. As a script author, I want to run several agents with `Promise.all`, so that independent searches run in parallel.
3. As a script author, I want each call to resolve to a structured object (status, agentId, agentType, output, model, usage, turns, durationMs, warnings, error), so that I can filter and combine results in code.
4. As a script author, I want `output` to be only the agent's final message, so that intermediate turns and tool output don't flood my script.
5. As a script author, I want a failed child run to return `status: "failed"` with an `error` message instead of throwing, so that one failure in a `Promise.all` batch does not lose the other results.
6. As a script author, I want caller mistakes (unknown agent, bad resume id, an agent left with no usable tools) to throw, so that I notice bugs in my script at once.
7. As a script author, I want to resume an earlier agent with `resume: agentId`, so that I can ask a follow-up question without re-explaining the task.
8. As a script author, I want a resume without `subagent_type` to reuse the agent type of the first run, so that a follow-up keeps the same prompt and tools.
9. As a script author, I want a resume that names a different `subagent_type` to throw, so that I don't silently continue a session with the wrong agent.
10. As a script author, I want to override the model per call (`model`) and the thinking level per call (`effort`), so that I can spend more on hard tasks.
11. As a script author, I want `subagent_type` to default to `general-purpose`, so that quick delegations need no extra argument.
12. As a script author, I want calls written for Claude Code (with `run_in_background`, `isolation` or `name`) to still run, with a warning that those fields are ignored, so that I can reuse snippets.
13. As a pi user, I want the tool description to list the available agents with their descriptions, so that the model knows what it can delegate to.
14. As a pi user, I want subagents to run on haiku by default, so that delegation is cheap unless I ask for more.
15. As a pi user, I want `inherit` to mean my session's current model, used only when written explicitly, so that the default never surprises me with an expensive model.
16. As a pi user, I want the aliases `opus`, `sonnet`, `haiku` and `fable` to map to the same-name Anthropic models, so that Claude Code agent files mean what their authors intended.
17. As a pi user without Anthropic credentials, I want to remap any alias, or the default model, in settings, so that agents run on my provider.
18. As a pi user, I want the README to explain model selection clearly, so that I know why an agent ran on haiku and how to change it.
19. As a pi user, I want child token usage and cost to count toward my session totals, so that `/session` and the footer show the true cost.
20. As a pi user, I want to see progress while an agent runs (turn count and last tool), so that long runs are not a black box.
21. As a pi user, I want to abort the parent run and have every child stop, so that nothing keeps running and spending after I cancel.
22. As a pi user, I want at most 20 children running at once in a pi process (configurable), with extra calls queued, so that a large batch can't overload my machine.
23. As a pi user, I want children not to get the `Agent` tool, so that agents can't spawn agents (nesting is one level in v1).
24. As a pi user, I want children to follow my project trust decision, so that an untrusted project's extensions and settings don't load in a child either.
25. As a pi user, I want child sessions stored next to the parent session, grouped by parent, so that they don't clutter my session list and are easy to find.
26. As a pi user whose session is not persisted, I want children to be in-memory too, and a clear error if I try to resume one.
27. As an agent author, I want my existing `.claude/agents/*.md` files to load unchanged, so that I keep one set of definitions for both tools.
28. As an agent author, I want project agents in `.pi/agents/` and `.claude/agents/` (from my working directory up to the repo root, closest first) to override user agents in `~/.pi/agent/agents/` and `~/.claude/agents/`, which override the built-ins, so that the most specific definition wins.
29. As an agent author, I want subdirectories of those folders to be searched, so that I can organise agents in folders.
30. As an agent author, I want edits to an agent file to apply on the next call without reloading pi, as in Claude Code.
31. As an agent author, I want an invalid file (no frontmatter, bad YAML, missing or invalid `name`, missing `description`, a wrongly typed field) to be skipped with a visible warning naming the file and the reason, so that one bad file doesn't break the others and I can fix it.
32. As an agent author, I want two files with the same name in the same folder to produce a warning, so that I notice the duplicate.
33. As an agent author, I want the body of my file to replace pi's default system prompt, so that the child follows exactly my instructions, as in Claude Code.
34. As an agent author, I want `tools` and `disallowedTools` with Claude Code names (Read, Write, Edit, Bash, Grep, Glob, LS, mcp__…) to be mapped to pi tools, so that tool limits work unchanged.
35. As an agent author, I want a `disallowedTools` rule like `Bash(git push *)` to remove the whole tool, since pi has no per-command rules, so that a deny never becomes an allow.
36. As an agent author, I want tools that pi lacks (WebFetch, NotebookEdit, …) to be dropped with a warning, or mapped to a pi tool through settings, so that the agent still runs.
37. As an agent author, I want an agent without `tools` to get my normal pi tools and extensions, so that it behaves like my everyday pi session.
38. As an agent author, I want `skills` to preload the full text of each named skill into the system prompt, found in pi's skill folders and in `.claude/skills`, so that Claude Code skill preloading works.
39. As an agent author, I want a missing skill to produce a warning rather than a failure, as in Claude Code.
40. As an agent author, I want `effort` to set the child's thinking level, `maxTurns` to cap its turns, and `omitClaudeMd` to skip context files, as in Claude Code.
41. As an agent author, I want a run that hits `maxTurns` to return `status: "partial"` with the latest output, so that I still get what it found.
42. As an agent author, I want Claude Code fields pi-pipipi does not support yet (mcpServers, isolation, hooks, memory, …) to be accepted with a warning, so that my files still load.
43. As a pi user, I want built-in `Explore` (read-only search), `Plan` (read-only planning) and `general-purpose` agents, so that delegation works with no setup.
44. As a pi user, I want to override a built-in agent by writing my own file with the same name.
45. As a pi user, I want very long prompts (over 100 KB) to still reach the child, so that I can pass large context.
46. As a pi user, I want bad pi-pipipi settings to fail with a message that names the bad key, so that I can fix my config.

## Implementation Decisions

Modules:

- **Config**: reads the `pipipi` block from pi's merged settings at every session start (verified: pi keeps unknown keys). Keys, all optional: `models` (alias → pi model pattern, merged over built-in defaults `opus`/`sonnet`/`haiku` → `anthropic/claude-{opus,sonnet,haiku}-5-5`, `fable` → `anthropic/claude-fable-5-1`), `defaultModel` (default `haiku`), `toolMap` (Claude name → pi name, merged over the built-in map), `maxConcurrent` (default 20), `piCommand` (default `pi`). Wrong types throw naming the key.
- **Definition parser**: one agent file → a definition or a skip reason. Skip reasons match Claude Code: opening `---` not on the first line, frontmatter not closed, YAML error, `name` missing / not a string / longer than 256 / containing `:` / starting with `-`, `description` missing, and a supported field with the wrong type. `tools`, `disallowedTools` and `skills` accept a comma-separated string or a YAML list. Unsupported Claude Code fields (mcpServers, isolation, autoCompactWindow, color, permissionMode, hooks, memory, background, initialPrompt, experimental) are recorded as inert; other unknown keys are ignored.
- **Discovery**: scans the sources in priority order (project `.pi/agents` per directory from cwd up to the nearest directory containing `.git`, closest first; then project `.claude/agents` the same way; then `~/.pi/agent/agents`, `~/.claude/agents`, built-ins), recursively for `*.md`. Identity is `name`. Higher sources win. Subdirectories are followed, including symlinked ones (realpath guards against loops); an unreadable directory is skipped with a warning (`cannot read agent directory <path>: <code>`). Within one folder the first file in sorted path order wins, with a warning. A project agent (`.pi/agents` or `.claude/agents` in the walk) that overrides a built-in warns: `project agent "<name>" overrides the built-in (<path>)`; user-dir overrides do not. Without a repo, only cwd is scanned. The project walk stops before the home directory and never includes it (cwd = home means no project directories), so `~/.pi/agent/agents` and `~/.claude/agents` are user sources only. Scans are bounded: dot directories and `node_modules` are not entered, at most 6 levels below the source root, at most 5000 entries per source root (then `stopped scanning <root>: more than 5000 entries`); an entry whose `stat` fails (ELOOP, EACCES, ...) is skipped with a warning (`cannot read <path>: <code>`). Returns agents and warnings. Runs at session start (tool description, warnings shown via UI notify) and on every call.
- **Built-in agents**: three agent files in Claude Code format, with prompts written for pi-pipipi, modelled on Claude Code's roles. Explore and Plan: tools Read, Grep, Glob, LS, Bash; deny Write, Edit; omitClaudeMd. general-purpose: no tool limits. None sets a model, so all use the default.
- **Resolver**: definition + call input + config + parent context → child spec (argv, environment, system prompt text, prompt, model, maxTurns, agentId, warnings).
  - Model: call `model` > definition `model` > `defaultModel`. `inherit` → parent model (throws if none); an alias → `models[alias]`; anything else passes to `--model` unchanged.
  - Thinking: call `effort` > definition `effort` > parent thinking level, passed as `--thinking`.
  - Tools: built-in map Read→read, Write→write, Edit→edit, Bash→bash, Grep→grep, Glob→find, LS→ls, merged with `toolMap`; lowercase pi names and `mcp__…` pass through; Agent and Task are dropped silently; other names are dropped with a warning. `Name(...)` deny rules reduce to `Name`. Denied tools go to `--exclude-tools`; with `tools` present, allowed minus denied go to `--tools`, and an empty result throws. Without `tools`, no `--tools` flag.
  - System prompt (replaces pi's default via `--system-prompt <file>`): the definition body, then each preloaded skill as `# Skill: <name>` + full SKILL.md text, then an environment block (working directory, platform, date). Skills are found by frontmatter name (else directory name) for each directory from cwd up to the repo root (closest first): `.pi/skills`, then `.agents/skills`, then `.claude/skills`; then `~/.pi/agent/skills`, `~/.agents/skills`, `~/.claude/skills`; searched recursively for folders holding SKILL.md, following symlinks, not descending into a skill folder, dot directories or `node_modules`, at most 6 levels deep and 5000 entries per root; an unreadable entry is skipped (its skill is just not found). The project walk excludes the home directory. Extensions cannot read pi's loaded skill list (verified), and skill paths from settings or packages are not searched in v1.
  - Flags: `--mode json -p`, model, thinking, tools, `--no-context-files` when omitClaudeMd, `--approve` or `--no-approve` mirroring the parent's trust, session flags, `--system-prompt`, then `--` and the prompt. Prompts over 100 KB are written to a temp file and passed as `@<file>` (Linux limits one argument to 128 KiB); a shorter prompt starting with `@` is prefixed with a newline so pi reads it as text. Environment: the parent's plus `PIPIPI_DEPTH=1`. Working directory: the parent's.
  - Sessions: with a persisted parent, `--session-dir <parent session dir>/subagents/<parent session id> --session-id <agentId>`; otherwise `--no-session`. agentId is 12 random `[a-z0-9]` characters, or the resume id.
- **Resume**: a first run with a persisted parent writes `<agentId>.json` = `{ agentType }` beside the child session. A resume id must match `[A-Za-z0-9._-]+`, needs a persisted parent, and needs that file; otherwise it throws. The stored type is used when `subagent_type` is omitted; a different one throws.
- **Runner**: spawns the child with stdin closed and reads stdout as bytes, splitting records on LF only (JSON strings may hold U+2028/U+2029; Node's readline would split on them). The first record must be the session header. Assistant `message_end` events add to usage and set output when they carry text; a `stopReason` of `error` records the error message, and a later assistant message with any other stopReason clears it (pi auto-retries, so the last assistant message decides). A prompt starting with `@` gets a leading newline, because pi reads `@x` as a file even after `--`. Any exception while handling a record (`null`, a `message_end` without `usage` or `message`) is a stream error naming the line: the child is stopped and the run fails. `tool_execution_start` reports progress for the turn in progress; `turn_end` counts turns and reports progress, except a turn whose assistant message ended with `stopReason: "error"` (pi retries it; it counts toward neither `turns` nor `maxTurns`); reaching `maxTurns` on a turn whose assistant message ended with `stopReason: "toolUse"` stops the child at once and the result is `partial` (the run wanted another turn); on any other turn it waits up to 2 s for `agent_settled` (ignoring later turns' output): if it arrives the result is `completed`, otherwise the child is stopped and the result is `partial`. `agent_settled` marks success, unless it carries `aborted: true` (then the run failed: "child run was aborted"). If the child has not exited 2 s after `agent_settled`, it is stopped (SIGTERM, then SIGKILL) and the result stands as settled (completed, or failed if there was an error). A synchronous `spawn` throw (for example a NUL byte in the prompt) is a spawn failure. Completed = exit 0, settled, no error. Failed = non-zero exit, not settled, assistant error, unparseable line, missing header, or spawn failure, with `error` = assistant error, else the last 30 stderr lines, else a description. Abort sends SIGTERM, then SIGKILL after 5 s, and throws `aborted`. Temp files are removed when the run ends.
- **Agent tool**: name `Agent`, exposure `codemode`, parameters `description`, `prompt`, optional `subagent_type`, `model`, `effort` (low/medium/high/xhigh/max), `resume`, `run_in_background`, `isolation`, `name`. Declares an output schema; returns the result as structured content, as details, and as `usage` (so pi adds it to session totals; verified that codemode reports nested tool usage through the session), plus a text summary; `isError` when failed. Execution: resolve resume type → discover → resolve → wait for a slot in a process-wide semaphore (its limit is set from the first config read in the process; later sessions' `maxConcurrent` is ignored) → run → release. Progress updates read `<description>: turn N, <last tool>`; an update identical to the previous one is not sent again.
- **Extension entry**: does nothing when `PIPIPI_DEPTH` is set. Otherwise, on every session start: read config (on an error, show it via UI notify when a UI exists, then rethrow), discover, register the tool with a description that lists the agents (a snapshot until `/reload`), and show discovery warnings when a UI exists.

## Testing Decisions

- One seam: the extension loaded against a fake pi extension API, with the `Agent` tool's `execute` called directly, and a scripted fake `pi` binary (configured through `piCommand`) that replays a JSONL scenario, records its argv, environment, working directory, system prompt and prompt file, and exits with a chosen code. A temporary repo (with `.git`) and a temporary HOME isolate discovery from the real machine.
- Tests assert external behaviour only: what the tool returns, what it throws, what warnings and description it produces, and what the child was started with. No test calls an internal module directly.
- Areas to cover: definition parsing and skip reasons; discovery precedence, walk-up and duplicates; a Claude Code docs example loading unchanged; model selection (default haiku, aliases, overrides, explicit inherit); tool mapping and deny rules; skills preloading (recursive, symlinked, missing); flags, trust and environment; completed runs with summed usage; maxTurns; each failure mode; U+2028 framing; abort; resume with stored type, mismatch and unknown id; concurrency queuing; long prompts via file; no registration when nested; config errors.
- Tests never run the test command themselves.
- Real-model smoke test (manual, by the owner): a codemode session that runs two Explore agents in parallel, then resumes one without `subagent_type`. Documented in the README.

## Out of Scope

Background runs, fork, worktree isolation, hooks, per-agent MCP servers, memory, a budget cap, nesting deeper than one level, skill paths from settings or packages, custom TUI rendering beyond progress text, the mp workflow, and work/dev modes.

## Further Notes

- A prototype implementation already exists on branch `pipipi-v1` (written before this spec was approved). It matches the decisions above except the test layout, which calls internal modules directly.
- pi docs referenced: extensions, codemode, CLI, JSON event stream, skills, session format (pi 1.5.0).
