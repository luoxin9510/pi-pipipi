# Porting pi-pipipi to a pi-based agent

pi-pipipi is written against upstream pi (`@earendil-works/pi-coding-agent` 1.5.0). Many teams run their own agent
built on pi: a fork, a rebranded build, or an app on pi's SDK with its own extensions. This guide lists every pi
contract pi-pipipi relies on, which file relies on it, and what still works if your agent differs. Work through it
top to bottom: each layer only needs the ones above it.

If your agent still loads pi extensions and still has pi's CLI, you may need no code changes at all: set
`pipipi.piCommand` to your binary and run the checks in [Verify](#verify).

## The layers

| Layer | Needed for | Files |
|---|---|---|
| 1. Child process (CLI + rpc) | everything: each subagent is a child process | `src/resolve.ts`, `src/runner.ts` |
| 2. Session files | resume, `/subagents` after reload, the transcript on the subagent screen | `src/sessions.ts`, `src/registry.ts`, `src/subagent-screen.ts` |
| 3. Extension API (parent) | the `Agent` tool, config, the note to main | `src/index.ts`, `src/agent-tool.ts`, `src/config.ts` |
| 4. Codemode | calling `Agent` from scripts; codemode-only children; background scripts | `src/agent-tool.ts`, `src/child-codemode.ts`, `src/resolve.ts`, `src/background.ts` |
| 5. TUI | the panel, the subagent screen, `/subagents`, `/model` picker | `src/panel.ts`, `src/subagent-screen.ts`, `src/subagents-command.ts`, `src/live.ts` |

Layers 1-4 are the `Agent` tool. Layer 5 is only the UI: without it (a headless or web front end) the tool works and
the UI parts can be left out (see [Without pi's TUI](#without-pis-tui)).

## 1. Child process

pi-pipipi starts every subagent as `<piCommand> --mode rpc ...` (`pipipi.piCommand`, default `pi`), with stdin, stdout
and stderr as pipes and the parent's cwd.

### Command-line flags (`src/resolve.ts`, `src/runner.ts`)

| Flag | Why |
|---|---|
| `--mode rpc` | JSONL commands on stdin, events on stdout |
| `--model <provider/id>` | the resolved model |
| `--thinking <level>` | `effort`, or the parent's level; must accept `off` |
| `--tools a,b` | the agent's `tools`, mapped (`Read→read`, `Glob→find`, ...). Without a list, `--tools +codemode`: the `+` prefix adds to the default tools and must be supported |
| `--exclude-tools a,b` | `disallowedTools`, and `mcp__*` when `tools` lists no MCP tool: entries are glob patterns |
| `--system-prompt <path>` | the agent body + skills + environment block, written to a temp file; pi reads a path as the prompt's contents. If your agent takes the value as literal text, every child gets the path as its prompt: change `runChild` in `src/runner.ts` |
| `--no-context-files` | `omitClaudeMd` |
| `--approve` / `--no-approve` | the child gets the parent's project trust |
| `--session-dir <dir> --session-id <id>` | a persisted child session (or `--no-session` for an in-memory parent) |
| `-e <file>` | `src/child-codemode.ts` for codemode-only children (layer 4). Loaded as TypeScript source, as pi loads every extension (pi-pipipi has no build step): your agent's extension loader must handle `.ts` |

The environment is the parent's plus `PIPIPI_DEPTH=1`. The extension does nothing when that variable is set, so
children get no `Agent` tool. If your agent drops unknown environment variables before loading extensions, nesting
protection breaks.

If a flag has another name in your agent, change it in `resolveChild` (`src/resolve.ts`). If one is missing:

- no `--system-prompt`: agent prompts cannot replace the default; prepend them to the prompt instead (behaviour changes).
- no `--tools` / `--exclude-tools`: tool restrictions cannot be enforced. Do not ship read-only agents.
- no `--session-dir` / `--session-id`: no resume and no transcripts; use `--no-session` everywhere.

### rpc protocol (`src/runner.ts`)

One JSON object per line, LF only (JSON strings may contain U+2028, so pi-pipipi splits on the byte `0x0a`).

Commands pi-pipipi sends:

| Command | When |
|---|---|
| `{"id":"pipipi-prompt","type":"prompt","message":...}` | start of every exchange |
| `{"type":"steer","message":...}` (no id; pi's `response` to it is ignored) | the user types to a running subagent |
| `{"type":"abort"}` (no id; response ignored) | maxTurns reached on a tool turn, the caller aborted, the user pressed `x` / `/stop` |
| `{"id":...,"type":"set_model","provider":...,"modelId":...}` | `/model` on a running subagent |

Then stdin is closed after `agent_settled`; the child must exit (pi-pipipi sends SIGTERM, then SIGKILL, if it does not).
Note that pi in rpc mode also exits when stdin closes *during* a run, so stdin must stay open until `agent_settled`.

What pi-pipipi reads:

| Record | Used for |
|---|---|
| `{"type":"response","id","success","error"}` | a failed `prompt` fails the run; `set_model` errors are shown |
| `message_start` / `message_update` (`assistantMessageEvent`: `text_*`, `thinking_*`, `toolcall_end`) | live streaming on the subagent screen (`src/live.ts`) |
| `message_end` with `message.role`, `content[]`, `usage`, `stopReason`, `errorMessage` | output, usage and cost, errors; `stopReason: "toolUse"` / `"error"` drive maxTurns and retries |
| `tool_execution_start` (`toolName`) | progress: last tool |
| `turn_end` | turn count, maxTurns |
| `agent_settled` (`aborted`) | end of the run |

`usage` must have `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens` and `cost.{input,output,cacheRead,cacheWrite,total}`.
pi's rpc mode sends no session header (json mode does); pi-pipipi does not need one.

If your agent has no rpc mode but has pi's json print mode (`--mode json -p <prompt>`), v1 of pi-pipipi (commit `9d3f5a6`,
`main` before v2) used that: everything works except steer, `/model` on a running
subagent and `x` / `/stop` (they need a live stdin).

## 2. Session files

- A child started with `--session-dir D --session-id I` writes `D/<timestamp>_I.jsonl` (`src/subagent-screen.ts`
  finds it by the `_I.jsonl` suffix). A resume starts a new child with the same flags and must append to that file.
- Child sessions live in `<parent session dir>/subagents/<parent session id>/`, next to a meta file `<agentId>.json`
  that pi-pipipi writes (agent type, description, model, status, usage, times). Your agent never reads these.
- The subagent screen reads the file with pi's `parseSessionEntries` and `buildSessionContext` and draws messages with
  role `user`, `assistant` (content parts `text`, `thinking`, `toolCall`) and `toolResult`. A different session format
  only affects `transcriptParts` in `src/subagent-screen.ts`.

## 3. Extension API (parent side)

| API | Where | If missing |
|---|---|---|
| `pi.registerTool({ name, parameters, outputSchema, exposure: "codemode", execute })`; `execute` returns `content`, `details`, `structuredContent`, `usage`, `isError` | `src/agent-tool.ts` | no tool: nothing works |
| `pi.on("session_start", (event, ctx))` | `src/index.ts` | config and discovery never run |
| `pi.on("session_shutdown", (event, ctx))` (emitted on quit, reload, /new, resume and fork, before the runtime is torn down; rpc SIGTERM emits it with reason "quit") | `src/index.ts` | background scripts and detached agents keep running past the session; with it they are stopped (agents `stopped`, resumable) and main is sent nothing |
| `pi.on("agent_start" / "agent_end", (event, ctx))` | `src/index.ts` | pi-pipipi keeps the latest `ctx` from these and `session_start`; without them the note to main and main's state on the screen use the context of session start, which a reload replaces |
| `pi.getSettings()` keeping the unknown `pipipi` key | `src/config.ts` | defaults only (replace with your own config source) |
| `pi.registerCommand(name, { handler(args, ctx: ExtensionCommandContext) })` | `/subagents` | no `/subagents` |
| `pi.sendMessage({ customType, content, display }, { deliverAs: "steer" })`; also `{ triggerTurn: true }` for a background script's result | the note to main, the background script message | main is not told about your exchanges |
| `ctx.cwd`, `ctx.model {provider,id}` (may be undefined: `inherit` then throws), `ctx.thinkingLevel`, `ctx.isProjectTrusted()`, `ctx.isIdle()` | `src/agent-tool.ts`, `src/index.ts` | `inherit`, thinking and trust mirroring, the note's delivery |
| `ctx.hasUI`, `ctx.ui.notify` | `src/index.ts` | gates the panel and discovery warnings; false = tool only, no UI |
| `ctx.sessionManager.getSessionFile()` / `getSessionId()` | sessions, registry | children run `--no-session`, no resume. The session dir must be writable: pi-pipipi writes `subagents/` there and rebuilds its list from it on every `session_start` (startup, reload, resume, new) |
| `ctx.modelRegistry.getAvailable()` | `/model` picker | type `/model provider/id` only |

Imports: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai` (only `StringEnum` and
types), plus `typebox` and `yaml`. pi provides its own packages to extensions at load time. If your fork publishes them
under other names, replace the import paths (`grep -rn "@earendil-works" src`), or alias them in your extension loader.

## 4. Codemode

- `Agent` is registered with `exposure: "codemode"`: the model reaches it only from codemode scripts
  (`tools.Agent(...)`). If your agent has no codemode, change it to a direct tool (`exposure` default) and drop the
  README's codemode examples. Everything else is unchanged.
- Codemode-only children (`pipipi.childCodemode: "only"`, the default) load `src/child-codemode.ts`, which registers
  `createCodemodeExtension({ mode: "only" })` from the package index. pi then skips its built-in codemode extension
  (an extension that registers the same tool replaces a built-in one). Without that export or that replacement rule,
  set `"childCodemode": "inherit"`: children get direct tools, as in v1.
- Background scripts (`src/background.ts`): in a parent, pi-pipipi builds pi's codemode tool with the exported
  `createCodemodeExtension()` against a proxy `pi` that captures `registerTool`, then registers `{ ...definition, execute }`
  under the same name (so `renderCall`/`renderResult`, `exposure`, `defaultActive` and the user's `codemode` settings are
  kept, and pi skips its built-in with a stderr warning). The wrapper runs the original `execute` with its own
  `AbortController`, and returns early with its own result when the script starts an `Agent`; the script goes on using
  the original `ctx` (`ctx.executeTool`) after the call and main's turn have ended. It relies on: nested tool call ids
  `<codemode call id>/<n>` (the owner of an `Agent` call is found by that prefix), `ctx.executeTool` working after the
  tool call returned, and `pi.sendMessage(msg, { triggerTurn: true })` starting a run when main is idle (`{ deliverAs: "steer" }`
  when it runs). `run_in_background: true` agents run detached from the call's signal and report with the same `sendMessage` delivery. Without them, no background scripts: set `pipipi.backgroundScripts: false` and pi's own codemode runs unwrapped (v2 behaviour).
  Also needed: `createCodemodeExtension` exported from the package index (the wrapper cannot be built without it) and
  `ctx.ui.onTerminalInput` for ctrl+b (see layer 5; without a TUI, scripts move to the background only by starting an `Agent`).
  Esc aborts main's signal: the wrapper links it to the script only while the script is in the foreground, so background
  scripts survive it. Session shutdown stops every script and detached agent.
- With codemode-only, an agent's `tools` list must also bind inside scripts. On pi 1.5.0 it does (a script calling a
  tool outside `--tools` gets "does not exist"). Check yours with `test/real/09-codemode-only.test.ts`.

## 5. TUI

Only needed for the panel and the subagent screen.

| API | Where | Notes |
|---|---|---|
| `ctx.ui.setWidget(key, (tui, theme) => Component, { placement: "belowEditor" })`; `tui.requestRender()` | the panel | components implement `render(width)` and `invalidate()` |
| `ctx.ui.onTerminalInput(handler)` returning `{ consume: true }` | ↓ into the panel, panel keys, ctrl+b (`scripts.backgroundAll`; passes through as cursor-left when the editor has text or no script runs) | the handler gets raw input including kitty key **releases**; pi-pipipi ignores them with pi-tui's `isKeyRelease`. If your terminal layer sends other event encodings, check `handleKey` in `src/panel.ts` |
| `tui.focusedComponent` (not public API) | the panel acts only while the editor (a component with `getText`) has focus | if your TUI renames it, the panel may steal keys from pickers: fix `focusedIsEditor` in `src/panel.ts` |
| `ctx.ui.getEditorText()` | ↓ only on an empty editor; ctrl+b moves foreground scripts to the background only when the editor is empty | |
| `ctx.ui.custom(factory, { overlay: true, overlayOptions })`, full width and height; `tui.terminal.rows` | the subagent screen (it draws exactly the terminal's rows; its commands: `/main`, `/model`, `/stop`) | must not stop main's run; pi's `switchSession` would, so it is not used. The screen is `Focusable` and gets keys through `handleInput` (pi filters key releases for components) |
| `ctx.ui.select`, `ctx.ui.notify` | `/subagents`, notices | |
| pi components `AssistantMessageComponent`, `UserMessageComponent`, `ToolExecutionComponent`, `getMarkdownTheme`; pi-tui `Input`, `Text`, the `TUI`, `Component` and `Focusable` types, `matchesKey`, `isKeyRelease`, `truncateToWidth` | the transcript, the screen, the panel | |
| `theme.fg/bg/bold`; colour names `accent`, `success`, `error`, `warning`, `muted`, `dim`, `toolTitle`, `selectedBg` | panel and screen | a theme must define them (pi's built-in themes do) |

### Without pi's TUI

Web or headless front ends: the `Agent` tool, resume, codemode-only and queueing all live below the UI. Leave out
`installPanel` and the `/subagents` registration in `src/index.ts`. The registry (`src/registry.ts`) exposes what a UI
needs: `list(parentSessionId)`, `get(id)`, `subscribe(fn)`, `watch(id, fn)` for live rpc events, `stop(id)`,
`setModel(id, model)`, and `talkTo` in `src/talk.ts` for steer / continue. A web panel can be built on those.

## Models and credentials

Aliases default to Anthropic models (`haiku` → `anthropic/claude-haiku-5-5`, the default for every subagent). If your
agent uses another provider or naming, remap them in settings; no code change:

```jsonc
"pipipi": {
  "models": { "haiku": "<provider>/<cheap-model>", "sonnet": "<provider>/<model>", "opus": "<provider>/<big-model>" },
  "piCommand": "<your agent's binary>"
}
```

## Verify

Run these from a checkout of pi-pipipi, with your agent's binary:

```bash
npm install
npm run typecheck
npm run test:faults                                   # runner logic against a scripted fake pi; no model, no binary
npm run test:panel                                    # panel and screen logic; no model, no binary
PIPIPI_TEST_PI=/path/to/your-agent npm run test:parent # the codemode wrapper and background scripts in a real parent (needs haiku)
PIPIPI_TEST_PI=/path/to/your-agent npm run test:real  # real children on your binary (needs Anthropic haiku)
PIPIPI_TEST_PI=/path/to/your-agent npm run test:tui   # your binary's interactive TUI in a pty
PIPIPI_TEST_PI=/path/to/your-agent npm run eval       # real-model evals (parent and children on your binary)
```

The real, tui and eval suites call Claude Haiku 5.5 and expect `~/.pi/agent/auth.json` (they copy it into a temp agent
dir). If your binary reads its config elsewhere (`PI_CODING_AGENT_DIR` is what the suites set), adapt `sandbox()` in
`test/real/helpers.ts` and the env in `test/tui/harness.ts`. The evals harness sets no agent dir: its parent and children use your normal config.

Read failures by layer:

| Layer | Tests |
|---|---|
| 1. Child process | `test/real/01-tracer-bullet`, `02-agent-files`, `03-model-selection`, `04-tools-and-flags` (flags such as `--tools`, `--exclude-tools`, `--no-context-files`), `05-skills`, `06-run-outcomes`, `08-concurrency-and-config`, `11-talk` (steer), `12-stop-and-model` (abort, set_model); `test/faults/` (stream handling) |
| 2. Session files | `test/real/07-sessions-and-resume`, `10-registry` |
| 4. Codemode | `test/real/09-codemode-only`; `test/parent/` (a real parent `pi --mode rpc` with the wrapper: `01-background-script` early return, new turn from the result message and nested ids; `02-run-in-background` `false`/`true`; `03-edges` errors, long results, steer delivery, stop, shutdown) |
| 5. TUI | `test/panel/` (no pi; `scripts.test.ts` for script rows and `x`), `test/tui/05-panel`, `06-screen`, `07-talk`, `08-stop-model`, `09-streaming`, `10-script-panel` (script rows, `x`, ctrl+b) |

Quick manual check that a binary speaks the rpc protocol (one haiku call):

```bash
{ printf '%s\n' '{"id":"p","type":"prompt","message":"Reply OK"}'; sleep 15; } \
  | /path/to/your-agent --mode rpc --no-session --model anthropic/claude-haiku-5-5 \
  | grep -oE '"type":"(response|message_end|agent_settled)"' | sort | uniq -c
```

Expect one `response` (for `p`, with `"success":true`), `message_end` records (user and assistant), and one
`agent_settled`; the process exits when stdin closes after the `sleep`. Without the `sleep`, stdin closes at once and
pi exits before answering.

## Keeping up with pi

This guide matches pi 1.5.0 and pi-pipipi `main` as of 2026-11-08. When pi or your fork changes, run the Verify
commands first; the facts the code relies on are also noted where they are used (comments in `src/runner.ts`,
`src/panel.ts`, `src/subagent-screen.ts`).
