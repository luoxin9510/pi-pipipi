# 02: Worktree resume and `/subagents worktrees`

**What to build:** a resumed agent runs in its worktree again, and `/subagents worktrees` lists the kept worktrees and removes the ones the user picks.

**Blocked by:** 01

**Status:** closed (done 2026-11-08)

Spec Resolved questions apply (answered 2026-11-08).

- [x] Resume reads the stored worktree from the meta file and uses it as the child's cwd; the stored isolation wins over the call and the agent file
- [x] Resume of an agent whose worktree is gone follows the owner's answer (recommended: recreate from current HEAD for an unchanged one, throw naming the path for a changed one removed by hand)
- [x] `/subagents worktrees` lists kept worktrees from `git worktree list --porcelain` (agent id, branch, path, files changed, commits) and removes a picked one after a confirm that names the loss when it has changes; removal deletes the branch too
- [x] Tests, real haiku (in-process): agent writes a file, resume in the same worktree reads it back and adds a second; unchanged-then-resume case per the owner's answer
- [x] Tests on temp repos for the listing and removal functions (changed and unchanged, branch gone after removal), no model
- [x] pty test: `/subagents worktrees` shows a kept worktree and removes it

## Comments

Ticket 01 already had resume re-entering the stored worktree (stored isolation wins, warning on the call's value), recreate-from-HEAD for an unchanged removed one, and the throw naming the path for a changed one removed by hand. Verified by test/worktree/isolation.test.ts; added a real haiku resume test in test/real/13-worktree.test.ts (file written, resume reads it back and adds a second in the same worktree; unchanged agent recreated at the same path, isolation warning).

Built: listWorktrees(cwd) in src/worktree.ts (git worktree list --porcelain; first entry is the main checkout so it also works from inside a worktree; only pipipi/* branches; change-summary base = merge-base of worktree HEAD and main HEAD). /subagents worktrees (worktreesCommand): ctx.ui.select, ctx.ui.confirm naming the changed files and commits that would be lost (and a still-running agent), removal with worktree remove --force + branch -D; the list returns after each pick or declined confirm until cancelled or empty. Unknown /subagents arguments warn. Tests: test/worktree/list.test.ts, test/worktree/command.test.ts (scripted ui), test/tui/11-worktrees.test.ts (pty, no model turn).
