# AGENTS.md

pi-pipipi is a pi extension: one `Agent` tool (codemode exposure) that runs Claude Code-compatible subagents as `pi`
subprocesses. Design: `.scratch/pi-pipipi/decisions.md` and `spec.md` (v1), `.scratch/pi-pipipi-v2/spec.md` (v2: panel, subagent
screen, rpc and codemode-only children). Tickets: `.scratch/pi-pipipi/issues/`, `.scratch/pi-pipipi-v2/issues/`.

## Code style

- Write the simplest code that works. No abstractions until a second caller needs them.
- Fail fast. Throw with a message that names the bad value.
- Validate only at boundaries: the `pipipi` settings block, agent `.md` files, tool call input, the child's JSONL
  stream and exit status. Trust values inside the package.
- No defensive guards for states that cannot happen. No retries.
- Warnings (skipped files, inert fields, unmapped tools, missing skills) are Claude Code compatibility behaviour, not
  error handling. Keep them.

## Layout

- `src/` TypeScript loaded directly by pi (no build). Import local files with the `.ts` extension.
- Main `src/` files: `index.ts` (entry, `/subagents`, session start), `agent-tool.ts` (the `Agent` tool), `exchange.ts`
  (the one path for a run: per-subagent queue, concurrency slot, registry updates, note to main; it also holds the
  process-wide concurrency limit, the user's steers and the host binding of config and note), `runner.ts` (rpc child
  process and its event stream), `resolve.ts` (agent definition to child args), `registry.ts` (subagents of the session,
  meta files, stop, set model, status icons/colours/label, the running child's events and in-progress message),
  `live.ts` (rebuilds the message being written from rpc deltas), `panel.ts` (panel below the editor),
  `subagent-screen.ts` (full-screen view), `talk.ts` (what the user types on the screen: steer or continue, a thin
  layer over `exchange`), `subagents-command.ts`, `child-codemode.ts` (codemode-only extension loaded by children).
- `src/builtin/*.md` built-in agents in Claude Code format.
- `test/real/*.test.ts` node:test against real pi and real haiku; `test/faults/*.test.ts` scripted faults on fake pi.
  `npm test` runs these and the two below (Node >= 22.18 strips types).
- `test/panel/*.test.ts` panel rows, focus rules and screen rendering against the registry (no pi, no model). `test/tui/*.test.ts` drive real
  interactive pi in a pty (`test/tui/harness.ts`: node-pty + headless xterm); real haiku, few and time-bounded.
- Two helper files: `test/helpers.ts` is the fake-pi harness (fault suite: scripted streams, `loadTool` against `test/fake-pi.mjs`);
  `test/real/helpers.ts` is the real-pi harness (temp repo/HOME/agent dir, pinned pi on haiku, the screen/`say` stubs).
- `test/fake-pi.mjs` stands in for the `pi` binary in the fault suite (and `npm run stress -- --fake`).
- `evals/` real-model evals, `stress/` concurrency test. Dev scripts, not shipped.

- `docs/porting.md` lists every pi contract the code relies on. A change that adds, drops or changes one (a CLI flag,
  an rpc command or event, an extension or TUI API) updates it in the same commit.

## Tests

- Test through the highest seam: the registered tool's `execute`, children real. `npm test` uses real haiku (about $0.01
  per run, needs credentials in `~/.pi/agent/auth.json`); that is allowed.
- Real tests use `test/real/helpers.ts`: temp repo, temp HOME, temp `PI_CODING_AGENT_DIR`. Assert on structure and side
  effects (result fields, files, the child's session file), never on model wording. Write prompts with one clear answer.
- Fake pi (`test/faults/`) only for faults real pi will not produce on demand. No model there.
- Never run `npm test` (or any test command) from inside a test. A past test that did so fork-bombed the machine.
- Larger real-model checks: `npm run eval` (`evals/`, haiku only) and `npm run stress` (`stress/`). They cost more:
  run them on request, never from `npm test`.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/` (spec.md + issues/NN-slug.md). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, written as a `Status:` line in each ticket. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
