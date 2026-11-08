# pi-pipipi v2: handoff

Status as of 2026-11-08. Branch `v2-10-docs` (on top of `v2-subagent-view`). v1 handoff: `.scratch/pi-pipipi/handoff.md`.

## Done

- Spec: `spec.md`. Tickets 01-09 closed (see their Comments for deviations from the spec), 10 waits for the owner.
- Children run as `pi --mode rpc` (prompt over stdin, any size; the v1 `@file` path is gone) and are codemode-only by
  default (`childCodemode: "only"`, `codemode: false` per agent, `"inherit"` for v1 behaviour).
- Registry of the session's subagents with meta files; `/subagents`; the panel below the editor (30 s linger,
  keys down/up/Esc/Enter/x); the full-screen subagent screen (overlay, main keeps running); typing = steer or continue;
  per-subagent queue; stop (`failed` / "stopped by user", resumable); `/model` (picker drawn on the screen).
- Docs: README and AGENTS.md describe all of it. Evals 13/13 over 3 runs, steer case 11/13, stress rerun, codemode-only
  vs direct comparison (numbers in README).

## Deviations to know

- No `main` row in the panel: the screen is an overlay that covers it. Back = header hint, `Esc`, `/main`.
- The model picker is drawn on the screen (a `ctx.ui.select` dialog hides under the overlay).
- Panel rows are oldest first.

## Open

- Ticket 10: the owner's look check (steps in its Comments). Close the ticket after it.
- Not published to npm. Merge to `main` is the owner's call.
- v2 candidates: tier B agent fields (mcpServers, worktree isolation), background runs, nesting > 1, usage of aborted
  runs.
