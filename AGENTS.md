# AGENTS.md

pi-pipipi is a pi extension: one `Agent` tool (codemode exposure) that runs Claude Code-compatible subagents as `pi`
subprocesses. Design: `.scratch/pi-pipipi/decisions.md` and `spec.md`. Tickets: `.scratch/pi-pipipi/issues/`.

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
- `src/builtin/*.md` built-in agents in Claude Code format.
- `test/real/*.test.ts` node:test against real pi and real haiku; `test/faults/*.test.ts` scripted faults on fake pi.
  `npm test` runs both (Node >= 22.18 strips types).
- `test/panel/*.test.ts` panel rows and focus rules against the registry (no pi, no model). `test/tui/*.test.ts` drive real
  interactive pi in a pty (`test/tui/harness.ts`: node-pty + headless xterm); real haiku, few and time-bounded.
- `test/fake-pi.mjs` stands in for the `pi` binary in the fault suite (and `npm run stress -- --fake`).
- `evals/` real-model evals, `stress/` concurrency test. Dev scripts, not shipped.

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
