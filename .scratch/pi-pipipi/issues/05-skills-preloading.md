# 05: Preload skills

**What to build:** an agent's `skills` are found and their full SKILL.md text is added to the child's system prompt, after the agent body and before the environment block.

**Blocked by:** 02

**Status:** closed (done 2026-11-07)

- [x] Lookup order: `.pi/skills`, `.agents/skills`, `.claude/skills` from cwd to the repo root, then the three user folders
- [x] Folders are searched recursively; symlinked skill folders are followed; a skill matches by frontmatter name, else folder name
- [x] A missing skill produces a warning and the run continues
- [x] The system prompt replaces pi's default and ends with working directory, platform and date
