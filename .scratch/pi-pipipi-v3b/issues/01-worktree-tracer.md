# 01: Worktree isolation tracer bullet

**What to build:** `isolation: "worktree"` on an `Agent` call (and in the agent file) runs a real child in a new git worktree on its own branch. When the exchange ends, an unchanged worktree and branch are gone; a changed one is kept and the result gives its path, branch, changed files and commits.

**Blocked by:** None (can start immediately)

**Status:** closed (done 2026-11-08)

Spec Resolved questions apply (answered 2026-11-08).

- [x] First verified on real git and recorded in Comments: `worktree add` from a linked worktree; a repo with no commits; `info/exclude` path via `git rev-parse --git-path`
- [x] A worktree module (create, changed detection, remove) using `git` only; unit-style tests on temp repos with no model: create at `<repo>/.pi/worktrees/<agentId>` on `pipipi/<agentId>`, `/.pi/worktrees/` added to `info/exclude` once, changed = uncommitted file, untracked file, new commit (each separately), unchanged removes worktree and branch, not-a-repo and no-commit errors name the cause
- [x] `isolation` is a real `Agent` parameter (`worktree`; other values are a caller error naming the value); the agent file field is parsed into `AgentDefinition` and dropped from the inert list; the call wins over the file (definition tests)
- [x] The child's cwd and the prompt's "Working directory:" are the worktree; the base commit and path go into the meta file
- [x] Dirty main checkout adds a warning to the result; `.worktreeinclude` files are copied (rules per the owner's answer)
- [x] Output gains `worktree`; the background end message shows it for kept worktrees; concurrent creates in one repo are serialised
- [x] Real haiku tests (in-process seam): an isolated agent writes a file, worktree kept with the right fields and the main checkout untouched; an isolated read-only agent leaves nothing behind; a stopped run follows the same rule
- [x] Fault test on fake pi: `git` failing at creation makes the call throw and leaves no child process

## Comments

Verified on git 2.54.0 (2026-11-08):

- `worktree add -b pipipi/w2 <path> HEAD` works when run from inside a linked worktree. There `rev-parse --show-toplevel` is the linked worktree, so new worktrees go under that checkout's `.pi/worktrees/`.
- A repo with no commits: `rev-parse --verify HEAD` fails ("Needed a single revision") and `worktree add ... HEAD` fails ("invalid reference: HEAD"). The tracer checks first and throws naming the repository.
- `rev-parse --git-path info/exclude` is relative to the cwd in a main checkout (`.git/info/exclude`) and the shared absolute main `.git/info/exclude` from a linked worktree; it is resolved against the root.
- Without the exclude line the main checkout shows `?? .pi/`; with it, clean.
- `worktree remove` refuses modified or untracked files without `--force`; the branch survives a removal and needs `branch -D`. `worktree prune` clears the registration of a worktree directory deleted by hand.
- `.worktreeinclude`: `ls-files --others --ignored --exclude-from=.worktreeinclude -z` lists untracked files matching the patterns (directories expand to files); `check-ignore -z --stdin` then keeps the gitignored ones. A catch-all pattern would also list the other worktrees under `.pi/worktrees/`; those are filtered out.
- Submodules not exercised (ignored, as the spec says).

Decisions: the plan (repo check, path) runs in `executeAgent`; the worktree is created in `exchange` (after the concurrency slot, before the registry record), and `exchange` returns `RunResult` plus `worktree`. Meta file `worktree: { root, path, branch, base }` (root added for resume and removal). Resume: path missing and branch present throws naming the path; both gone recreates from current HEAD. A git failure while settling is a warning and the worktree is reported as kept. The background branch of the `Agent` tool now waits for the spec through a promise (planning is async). `talk.ts` passes the record's worktree, so typing on a screen continues in it. When the call's own signal aborts, the worktree is settled but cannot be reported (the call throws). Tests: `test/worktree/` (module, tool on fake pi, definition) and `test/real/13-worktree.test.ts` (haiku); fake pi gained `writeFile`.
