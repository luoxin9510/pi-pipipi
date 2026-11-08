# 01: Worktree isolation tracer bullet

**What to build:** `isolation: "worktree"` on an `Agent` call (and in the agent file) runs a real child in a new git worktree on its own branch. When the exchange ends, an unchanged worktree and branch are gone; a changed one is kept and the result gives its path, branch, changed files and commits.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec Resolved questions apply (answered 2026-11-08).

- [ ] First verified on real git and recorded in Comments: `worktree add` from a linked worktree; a repo with no commits; `info/exclude` path via `git rev-parse --git-path`
- [ ] A worktree module (create, changed detection, remove) using `git` only; unit-style tests on temp repos with no model: create at `<repo>/.pi/worktrees/<agentId>` on `pipipi/<agentId>`, `/.pi/worktrees/` added to `info/exclude` once, changed = uncommitted file, untracked file, new commit (each separately), unchanged removes worktree and branch, not-a-repo and no-commit errors name the cause
- [ ] `isolation` is a real `Agent` parameter (`worktree`; other values are a caller error naming the value); the agent file field is parsed into `AgentDefinition` and dropped from the inert list; the call wins over the file (definition tests)
- [ ] The child's cwd and the prompt's "Working directory:" are the worktree; the base commit and path go into the meta file
- [ ] Dirty main checkout adds a warning to the result; `.worktreeinclude` files are copied (rules per the owner's answer)
- [ ] Output gains `worktree`; the background end message shows it for kept worktrees; concurrent creates in one repo are serialised
- [ ] Real haiku tests (in-process seam): an isolated agent writes a file, worktree kept with the right fields and the main checkout untouched; an isolated read-only agent leaves nothing behind; a stopped run follows the same rule
- [ ] Fault test on fake pi: `git` failing at creation makes the call throw and leaves no child process
