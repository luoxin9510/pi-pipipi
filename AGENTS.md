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
- `test/*.test.ts` node:test, run with `npm test` (Node >= 22.18 strips types).
- `test/fake-pi.mjs` stands in for the `pi` binary. Tests point `piCommand` at it.

## Tests

- Test through the highest seam: the registered tool's `execute`, with fake pi.
- Never run `npm test` (or any test command) from inside a test.
- Real-model smoke tests are run by the owner (see README).

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/` (spec.md + issues/NN-slug.md). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, written as a `Status:` line in each ticket. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
