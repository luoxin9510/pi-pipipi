# pi-pipipi: handoff

Status as of 2026-11-07. Branch: `claude/exciting-tesla-w5876m`.

## Done

- `decisions.md`: all v1 decisions agreed with the owner.
- `spec.md`: modules, contracts, error policy, 18 test cases.

## Waiting on the owner

1. Confirm the 7 spec choices made beyond decisions.md:
   system prompt replaces pi's default (+ skills + env block); child sessions stored under
   `<parent session dir>/subagents/<parent id>/` via `--session-id <agentId>`; child trust mirrors parent
   (`--approve`/`--no-approve`); child failure returns `status: "failed"` (not a throw); built-in agent
   prompts written by us; `run_in_background`/`isolation`/`name` accepted but ignored with a warning;
   result shape `{ status, agentId, agentType, output, model, usage, turns, durationMs, warnings, error? }`.
2. Rename the GitHub repo `pi-mp-all-in-one` -> `pi-pipipi` (owner does this in GitHub settings).

## Next steps

1. Split spec.md into tickets: `.scratch/pi-pipipi/issues/NN-slug.md`, tracer-bullet vertical slices,
   blockers always have lower numbers. Get owner approval before coding.
2. Implement tickets in order. Write `AGENTS.md` first (code style rules from the brief: simplest working
   code, fail fast, validate only at boundaries, no defensive guards, no extra retries).

## Open [verify] items (resolve in the ticket that needs them)

- `pi.getSettings()` keeps the unknown `pipipi` key; else read `.pi/pipipi.json`.
- Whether an extension can read pi's loaded skill list; else scan the skill dirs in spec 5.3.
- Long prompts as a CLI argument; else pass `@file`.

## Reference material

pi docs and types are not in the repo. Install them in a scratch dir:
`npm i @earendil-works/pi-coding-agent@1.5.0 --ignore-scripts`, then read `node_modules/@earendil-works/pi-coding-agent/docs/`
(extensions.md, codemode.md, cli.md, json.md, packages.md, skills.md) and `examples/extensions/subagent/` (prior art: subprocess subagent).
Claude Code subagent format: https://code.claude.com/docs/en/sub-agents and https://code.claude.com/docs/en/agent-sdk/subagents.

The environment has no `pi` binary and no model API keys: tests use `test/fake-pi.mjs`; real-model smoke tests run locally by the owner.
