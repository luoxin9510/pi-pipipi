# 02: Worktree resume and `/subagents worktrees`

**What to build:** a resumed agent runs in its worktree again, and `/subagents worktrees` lists the kept worktrees and removes the ones the user picks.

**Blocked by:** 01

**Status:** ready-for-agent

Spec Resolved questions apply (answered 2026-11-08).

- [ ] Resume reads the stored worktree from the meta file and uses it as the child's cwd; the stored isolation wins over the call and the agent file
- [ ] Resume of an agent whose worktree is gone follows the owner's answer (recommended: recreate from current HEAD for an unchanged one, throw naming the path for a changed one removed by hand)
- [ ] `/subagents worktrees` lists kept worktrees from `git worktree list --porcelain` (agent id, branch, path, files changed, commits) and removes a picked one after a confirm that names the loss when it has changes; removal deletes the branch too
- [ ] Tests, real haiku (in-process): agent writes a file, resume in the same worktree reads it back and adds a second; unchanged-then-resume case per the owner's answer
- [ ] Tests on temp repos for the listing and removal functions (changed and unchanged, branch gone after removal), no model
- [ ] pty test: `/subagents worktrees` shows a kept worktree and removes it
