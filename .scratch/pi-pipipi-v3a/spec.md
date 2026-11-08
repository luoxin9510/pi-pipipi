# pi-pipipi v3a: background scripts — subagents work while main keeps going

Status: ready-for-agent

Decisions behind this spec: `../pi-pipipi/decisions.md`, "Grill 4" (2026-11-08), items 1-9. v2 spec:
`../pi-pipipi-v2/spec.md`. Shared pi facts: `~/Developer/pi-pipipi-notes/pi-1.5.0-facts.md`.

## Problem Statement

When main delegates work, it writes a codemode script that awaits `tools.Agent(...)`. The codemode call does not return
until the script ends, so main's turn is stuck for as long as the slowest subagent runs. I can't talk to main or let it
do anything else meanwhile. In Claude Code, delegated work runs in the background by default: main keeps going and is
told when the work is done.

## Solution

When a codemode script starts a subagent, the whole script moves to the background: the codemode call returns to main
at once with a short "moved to the background (id S1)" result, main's turn can end, and I can keep talking to main. The
script keeps running and keeps orchestrating: it still awaits its agents' results and filters or combines them. When
it ends, main gets a message with its return value (and the agents it ran), which starts a new turn if main is idle.

A script that must finish before main goes on passes `run_in_background: false` to an `Agent` call. An agent that
should not hold up even its own script passes `run_in_background: true`. A slow script without agents can be moved to
the background with ctrl+b. The panel shows background scripts with their agents, and `x` stops one.

## User Stories

1. As a pi user, I want delegation to not block main by default, so that I can keep talking to main while subagents work.
2. As a pi user, I want a script that starts a subagent to move to the background as soon as it does, so that main's turn ends without waiting for the agent.
3. As a codemode script author, I want `await tools.Agent(...)` inside a background script to still return the full result, so that the script can filter and combine results as before.
4. As main (the model), I want the codemode call to return a clear result when its script moves to the background (its id, that the result will arrive as a message, that I should not wait), so that I end my turn or do other work instead of polling.
5. As main, I want a message when a background script ends, with its return value, so that I can act on it.
6. As main, I want that message to list the agents the script ran (agent id, type, status, cost), so that I can resume one if needed.
7. As main, I want a script's error (a throw, or every agent failing) in that message, so that failures are not silent.
8. As a pi user, I want a long return value truncated in the message (over 8 KB) with the full text in a file whose path is given, so that main's context is not flooded.
9. As a pi user, I want the message to start a turn when main is idle, so that results are handled without me prompting.
10. As a pi user, I want the message delivered as a steer when main is running, so that main sees it at its next step.
11. As a script author, I want `run_in_background: false` on an `Agent` call to keep the script in the foreground, so that main can use the result in the same turn.
12. As a script author, I want `run_in_background: true` on an `Agent` call to return `status: "running"` with its `agentId` at once, so that the script does not wait for that agent.
13. As main, I want a message when such a detached agent ends (output, status, cost), so that its result is not lost.
14. As a pi user, I want ctrl+b to move a running foreground script to the background when the editor is empty, so that I can free main from any slow script.
15. As a pi user, I want ctrl+b to keep moving the cursor left whenever the editor has text or no script runs, so that editing is not affected.
16. As a pi user, I want background scripts in the panel, each a row (id, state, agents running, elapsed, cost) with its agents indented below, so that I see what runs where.
17. As a pi user, I want `x` on a script row to stop the script and all its agents, so that I can cancel delegated work at once.
18. As a pi user, I want `x` on an agent row inside a script to stop only that agent (its call returns `failed` / "stopped by user"), so that the script can carry on, as in v2.
19. As a pi user, I want finished script rows to linger like agent rows, so that I see what just ended.
20. As a pi user, I want several background scripts at once, sharing the `maxConcurrent` limit for their agents, so that I can delegate again while earlier work runs.
21. As a pi user, I want everything in the background stopped when the session ends or reloads (agents marked stopped and resumable), so that nothing runs unseen.
22. As a pi user, I want my codemode settings (`codemode.mode`, `inlineBudget`) to keep working, so that the wrapper changes nothing else.
23. As a pi user, I want `pipipi.backgroundScripts: false` to turn background scripts off (v2 behaviour, pi's own codemode), so that I can opt out.
24. As a pi user, I want Esc (aborting main's turn) to stop a script that is still in the foreground, as today, and to leave background scripts running, so that background work survives an interrupted turn.
25. As a script author, I want the Agent tool's description to explain the background rules, so that the model writes scripts that use them well.
26. As someone porting pi-pipipi, I want the porting guide to describe the codemode wrapper and what it relies on, so that I know what my agent must support.

## Implementation Decisions

Codemode wrapper (parent only)

- On load in a parent (not a child) with `backgroundScripts` on, pi-pipipi builds pi's codemode tool with the exported
  `createCodemodeExtension()` (default options, so it reads the user's codemode settings) against a proxy that captures
  the tool definition, and registers a tool `codemode` that wraps it. pi then skips its built-in codemode (an
  extension registering the same tool replaces a built-in one). The prototype in Grill 4 showed this works.
- The wrapper's `execute` runs the original with its own abort controller, linked to main's signal only while the
  script is in the foreground. It races the script against "moved to the background"; if the script ends first, its
  own result is returned unchanged.
- Moving to the background returns a short tool result (id, that the result arrives as a message, not to wait) and
  leaves the script running.

Background script registry

- A process-wide record per script: id (short, S1, S2, …), the codemode tool call id, state (foreground, background,
  completed, failed, stopped), start/end, its agents, the main session it belongs to. Lives next to the subagent
  registry and uses the same subscribe mechanism for the panel.
- An `Agent` call belongs to the script whose codemode call id prefixes its tool call id (nested ids are
  `<codemode id>/<n>`); this must be verified in the first ticket.
- Rule: an `Agent` call that starts without `run_in_background` moves its script to the background, unless an earlier
  call in that script passed `run_in_background: false` (the script is then pinned to the foreground).
  `run_in_background: true`: the call returns a `running` result at once and the agent finishes on its own.
- Ending: the script's tool result (returned value text) becomes the message. Over 8 KB: the first 8 KB plus the path
  of a file holding all of it, in the parent session's `subagents/<parent session id>/` dir (a temp dir for an
  in-memory session). The message lists the script's agents (id, type, status, cost) and carries its error if it
  threw. Detached (`true`) agents send their own message (output, status, cost).
- Delivery: `pi.sendMessage({ customType: "pi-pipipi", content, display: true }, …)` with `triggerTurn: true` when
  main is idle, `deliverAs: "steer"` when it runs, using the latest context.
- Stop: `x` on a script row aborts the script's controller; its pending `Agent` calls stop their children (failed /
  "stopped by user"); the script ends as stopped and main gets the message.
- Session end / reload: every background script and detached agent is stopped.

ctrl+b

- An editor key hook (the panel's): ctrl+b with an empty editor while at least one foreground script runs moves those
  scripts to the background and is consumed; otherwise it passes through (cursor-left). Key releases are ignored.

Agent tool

- `run_in_background` is now a real parameter (boolean): its description explains the three cases. The tool
  description explains that scripts move to the background when they start an agent and how results arrive.

Config and docs

- `pipipi.backgroundScripts` (boolean, default true); wrong type is a config error naming the key.
- README: a "Background work" section. Porting guide: the codemode wrapper (layer 4), `sendMessage` with
  `triggerTurn`, nested tool call ids.

## Testing Decisions

- Real pi and real Claude Haiku 5.5, as in v2; fake pi only for faults.
- New seam (needed because the wrapper lives in pi's codemode tool): a real parent `pi --mode rpc` with this checkout
  loaded (`--no-extensions -e builtin:codemode -e src/index.ts`, temp agent dir, haiku), driven by the test: send a
  prompt that runs an explicit script, read events. Covers: the codemode call returning early, main's turn ending
  while agents run, the result message starting a new turn, `run_in_background: false/true`, script errors, long
  return values (file), several scripts at once, stop via the registry, session shutdown.
- Existing seams: the in-process tool seam for the registry and Agent-level rules where no codemode is needed; the
  pty seam for the panel's script rows, `x` on a script, and ctrl+b (with text in the editor: cursor moves; empty:
  backgrounds).
- Prior art: the Grill 4 prototype (`createCodemodeExtension` captured via a proxy), `test/real/helpers.ts`,
  `test/tui/harness.ts`, `evals/harness.ts` (`runParent`).
- Evals gain a background case; README numbers updated.

## Out of Scope

- `AgentWait` or any polling tool.
- Background for scripts in children (children have no Agent tool).
- Worktrees, memory, panel polish (v3b).
- Keeping background work alive across a reload or a restart.

## Further Notes

- The first ticket must verify: nested tool call ids carry the codemode call id as prefix; a background script's tool
  calls keep working while main runs another turn (concurrent tool execution); pi's built-in codemode is replaced
  without a diagnostic that breaks anything; the wrapper keeps `renderCall`/`renderResult` and codemode's store entries.
