# pi-pipipi v2: see and enter subagents in the TUI; codemode-only children

Status: ready-for-agent

Decisions behind this spec: `../pi-pipipi/decisions.md`, "Grill 3" (2026-11-08). v1 spec: `../pi-pipipi/spec.md`.

## Problem Statement

My codemode scripts start subagents with `tools.Agent`, but in pi's TUI I can't see them. pi gives a call made from
inside a script no row of its own: I get one summary line under the codemode row, after the fact. I don't know which
subagents are running, what they are doing, or what they said, and I can't step in. In Claude Code I can see each
subagent in a panel, open one, read its whole transcript while it works, and type to it. I want the same in pi,
without stopping the main conversation.

Subagents are also slower than they need to be. An agent with a `tools` list gets those tools directly and calls them
one per turn, while my own pi uses codemode, where one script batches many calls in one turn.

## Solution

A panel below the editor lists the session's subagents, live, the way Claude Code does. From the panel (or
`/subagents`) I open one: the TUI switches to a full-screen subagent screen with its transcript, drawn like a normal
pi session and updating live, and an editor. What I type steers it if it is running, or continues it if it has
finished. `/main` (or the `main` row) takes me back. Main keeps running the whole time. I can stop a running subagent
with `x`. Main gets a short note of what I said to a subagent and what it answered.

To make this possible, each subagent runs as a long-lived `pi --mode rpc` process instead of a one-shot `pi --mode json
-p`: pi-pipipi can send it messages, steer it, abort it, and change its model while it runs.

Subagents run codemode-only by default: the model sees one `codemode` tool and calls the agent's allowed tools from
scripts. An agent's tool restrictions still hold inside scripts.

## User Stories

Panel

1. As a pi user, I want a panel below the editor listing the subagents of the current session, so that I see delegated work at a glance.
2. As a pi user, I want each row to show agent type, description, status, turns, last tool and cost, so that I know what each subagent is doing and what it costs.
3. As a pi user, I want running rows to update live (turns, last tool, cost), so that I can follow progress while main waits.
4. As a pi user, I want a finished row to stay 30 seconds and then disappear, so that the panel shows current work without piling up.
5. As a pi user, I want failed and stopped rows marked as such, so that problems stand out.
6. As a pi user, I want the panel hidden when the session has no subagents, so that it costs no screen space.
7. As a pi user, I want ↓ on an empty editor to move focus into the panel and ↑/↓ to choose a row, so that I can pick a subagent from the keyboard, as in Claude Code.
8. As a pi user, I want Esc (or ↑ past the first row) to give focus back to the editor, so that I can return to typing.
9. As a pi user, I want `/subagents` to list every subagent of this session, including ones finished long ago, so that I can reach any of them.
10. As a pi user, I want `/subagents` to work after `/reload` and after resuming the parent session later, so that old subagents stay reachable.
11. As a pi user with an in-memory session, I want a clear notice that subagents cannot be viewed, so that I am not confused by an empty list.

Entering a subagent

12. As a pi user, I want Enter on a row to switch the TUI to that subagent's screen, so that I can see everything it did.
13. As a pi user, I want the screen to show `main › <type>(<description>)` at the top, so that I know where I am.
14. As a pi user, I want the transcript drawn with pi's own message components (user, assistant, thinking, tool calls with their codemode scripts and nested calls), so that it reads like any pi session.
15. As a pi user, I want a running subagent's transcript to grow live, so that I can watch it work.
16. As a pi user, I want to scroll back through a long transcript, so that I can read earlier turns.
17. As a pi user, I want main to keep running while I am on a subagent screen, so that looking never interrupts work.
18. As a pi user, I want `/main`, or choosing the `main` row, to take me back to main, so that leaving is one step.
19. As a pi user, I want to see main's state (running or idle) while I am on a subagent screen, so that I know whether main is waiting.

Talking to a subagent

20. As a pi user, I want text I type to a running subagent to reach it as a steer, so that I can redirect it mid-task.
21. As a pi user, I want text I type to a finished subagent to continue its session with its own prompt, tools and model, so that I can ask follow-up questions.
22. As a pi user, I want the reply to stream into the screen, so that I see the answer as it is written.
23. As a pi user, I want `/model` on a subagent screen to change that subagent's model for this conversation only, so that I can retry with a stronger model without editing the agent file.
24. As a pi user, I want `/stop` on a subagent screen, and `x` on a panel row, to stop a running subagent, so that I can end runaway work.
25. As a codemode script author, I want a subagent the user stopped to resolve with `status: "failed"` and `error: "stopped by user"` (not a throw), so that my script carries on.
26. As a codemode script author, I want to be able to resume a subagent the user stopped, so that work can continue.
27. As a pi user, I want main to receive a short note after each of my exchanges with a subagent (what I said, what it answered), so that main's picture stays true.
28. As a pi user, I want that note delivered as a steer while main runs, and stored without starting a turn while main is idle, so that it informs main without hijacking it.
29. As a pi user and as a script author, I want one subagent to serve one conversation at a time, with whoever comes second waiting their turn, so that my messages and main's resume never collide in one session.

Codemode-only children

30. As a pi user, I want subagents to see only the `codemode` tool by default, so that they batch independent calls in one turn.
31. As a pi user, I want an agent's `tools`/`disallowedTools` to still bind inside its scripts, so that a read-only agent cannot write from a script.
32. As a pi user, I want `pipipi.childCodemode: "inherit"` to restore v1 behaviour, so that I can opt out globally.
33. As an agent author, I want `codemode: false` in an agent file to opt that agent out, so that an agent that does better with direct tools keeps them.
34. As an agent author, I want codemode-only to work whatever my own `codemode.mode` setting is, so that the package behaves the same for everyone.
35. As an agent author, I want every codemode child's system prompt to end with a short instruction to use codemode and batch independent calls, so that a custom prompt does not lose pi's batching guidance.
36. As a pi user, I want README numbers comparing codemode-only and direct-tool children (turns, time, cost), so that I can trust the default.

Fixes and limits

37. As a pi user, I want an agent with a `tools` list (and no `mcp__` entries) never to get MCP tools, so that a read-only agent cannot reach a writing MCP tool.
38. As a script author, I want prompts of any size to reach the child unchanged, so that I don't hit command-line limits.
39. As a script author, I want everything v1 returned (status, output, usage, turns, maxTurns partial, resume, warnings, errors) to keep working, so that existing scripts don't break.

## Implementation Decisions

Child process (runner)

- Children run as `pi --mode rpc` with the v1 flags (model, thinking, tools, system prompt file, context files,
  approve, session dir and id; `PIPIPI_DEPTH=1`). The prompt is sent as an rpc `prompt` command over stdin, so the
  `@file` path for prompts over 100 KB is removed.
- A run is one rpc process from first prompt to `agent_settled` of the last queued message; then stdin is closed and
  the process exits. A later message (resume by main, or the user typing to a finished subagent) starts a new rpc
  process on the same session id.
- Event handling stays as in v1 (usage, output = last assistant text, error turns not counted, maxTurns). maxTurns
  and stops use rpc `abort` instead of signals; signals stay as the fallback when the process does not settle.
- rpc responses (`{type:"response", id, success, error}`) for our commands are checked; a failed `prompt` response is
  a failed run with pi's error.

Subagent registry (new, process-wide)

- One registry holds every subagent this pi process knows: id, parent session id, type, description, status
  (running, completed, partial, failed, stopped), turns, last tool, usage, start and end times, and, while one runs,
  its rpc process. The panel and the subagent screen read it and subscribe to its changes.
- Per subagent, one process at a time. Messages from the user and resume calls from main queue in arrival order; the
  next one starts when the current exchange settles. The queue lives in the registry.
- Stop: rpc `abort`, then close stdin. The pending `Agent` call resolves `status: "failed"`, `error: "stopped by
  user"`. A stopped subagent can be resumed.
- Steer: a user message to a running subagent is sent as rpc `steer` to the live process; it is not queued.
- The agent meta file next to the child session (v1: `{ agentType }`) grows to also hold description, resolved model,
  thinking level, status, turns, usage and times, written at start and updated at the end of each exchange. A user's
  `/model` choice is stored there and used by later exchanges. The registry is rebuilt from these files on session
  start, which makes `/subagents` work after `/reload` and resume. Old v1 meta files (agentType only) still load.

Agent tool

- Unchanged input and result shape. `execute` goes through the registry (queue, stop). `run_in_background` stays
  ignored with a warning.

Codemode-only

- `pipipi.childCodemode`: `"only"` (default) or `"inherit"`; any other value is a config error naming the key.
- An agent file may set `codemode: false` (boolean; a wrong type skips the file, like other fields).
- When codemode-only applies, the child also loads a small pi-pipipi extension that registers the `codemode` tool via
  pi's exported codemode factory with mode `only`. pi replaces a built-in extension when another extension registers
  the same tool, so this works whatever the user's `codemode.mode` is. To verify in the first ticket: the built-in is
  replaced, its warning does not break the stream, and nested calls obey the allowlist.
- Tools: with a `tools` list, `--tools codemode,<mapped tools>`; without one, the user's defaults plus `codemode`.
  `disallowedTools` keep mapping to `--exclude-tools`.
- The child system prompt ends with one line: use the `codemode` tool and put independent calls in one script.
- With `"inherit"` or `codemode: false`, v1 flags are used.

MCP

- A `tools` list with no `mcp__` entry adds `--exclude-tools mcp__*` (merged with other excludes).

TUI

- Panel: a widget below the editor, built from the registry, redrawn on registry changes; hidden when empty.
  Finished rows drop out 30 s after they end.
- Focus: an editor key hook: ↓ on an empty editor focuses the panel; ↑/↓ move; Enter opens; `x` stops a running row;
  Esc or ↑ above the first row returns focus. While the panel has focus its keys are consumed; otherwise none are.
- `/subagents`: a picker of every subagent in the registry (newest first); choosing one opens its screen.
- Subagent screen: a full-screen custom component that takes over the TUI until left. Header with the
  `main › type(description)` path and main's state; the transcript drawn from the child session file with pi's
  exported message components (rebuilt from the file, then extended from the live event stream while it runs); an
  editor at the bottom. Commands handled inside: `/main` (leave), `/model` (pick a model, rpc `set_model` if running,
  stored for later exchanges), `/stop`. Other slash commands print "not available on a subagent screen".
- Opening a screen never calls pi's `switchSession` (it would abort main's turn).
- Note to main: after each user exchange settles, a custom message (`customType` pi-pipipi, displayed) with the
  user's text and the subagent's reply (truncated). Main running: delivered as steer. Main idle: stored, no turn.
- In-memory parent: panel and `/subagents` show the "cannot view" notice; the Agent tool works as in v1.

## Testing Decisions

- Good tests check behaviour a user or a script can see: the `Agent` result, files and sessions on disk, what the
  TUI shows, what main receives. Not internal calls.
- Main suite: real pi (the repo's pinned pi 1.5.0) and real Claude Haiku 5.5, no fake model. Each test runs in a temp
  repo with a temp pi agent dir (auth linked from the user's, no installed packages, known settings), so results do
  not depend on the user's setup. Prompts are written so the right answer is unambiguous (secret tokens in files,
  explicit commands); assertions use structure and side effects, never wording.
- Seam 1, the tool: the extension loaded in-process against a stub ExtensionAPI (as v1 tests and `evals/` do), its
  `Agent` tool called directly, children real. Covers rpc runs, queueing, steer, stop, resume, maxTurns, codemode-only
  flags and behaviour (a read-only agent cannot write from a script), MCP exclusion, long prompts, meta files and
  registry rebuild.
- Seam 2, the TUI: real interactive pi in a pseudo-terminal (node-pty + a headless xterm, as pi-roost uses), parent
  on haiku with this checkout loaded. The test types and presses keys and reads the screen. Covers the panel, ↓/Enter,
  the subagent screen while main runs, steering by typing, `x`, `/model`, `/main`, the note in main.
- Fake pi stays only for faults real pi will not produce on demand: malformed JSON line, missing session header,
  crash with stderr, a process that never settles or never exits. These tests run without a model.
- `npm test` runs the real suite (costs money, needs Anthropic credentials; expected cost per run is reported in the
  README); a separate script runs only the fake-pi fault tests. AGENTS.md is updated: real haiku is allowed in
  `npm test`; tests still never run test commands.
- Prior art: `test/*.test.ts` (tool seam, fake pi), `evals/harness.ts` (in-process tool with real children, real
  parent pi), pi-roost's pty harness.
- `npm run eval` and `npm run stress` are rerun on rpc children; the eval gains a codemode-only vs direct comparison
  and a steer case. Their numbers go in the README.

## Out of Scope

- Using pi's `switchSession` to enter a subagent, and pi's own slash commands on a subagent screen (beyond `/main`,
  `/model`, `/stop`).
- Subagents of other parent sessions (resume that parent first).
- Nesting deeper than one level; nested trees in the panel.
- `run_in_background`, worktree isolation, `mcpServers`, `autoCompactWindow` (still v2+ candidates).
- Viewing subagents of an in-memory parent.

## Further Notes

- The ticket that introduces rpc children must first confirm: rpc mode accepts the v1 flags, emits the session header
  and the json-mode events, and `steer`/`abort`/`set_model` behave as the docs say.
- The pty tests are the slowest and most timing-sensitive part; they wait for screen text with timeouts rather than
  fixed sleeps.
- A one-off human check of the look of the panel and screen stays as a `ready-for-human` ticket.
