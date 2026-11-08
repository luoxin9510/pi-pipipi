# 04: Script rows in the panel, `x` on a script, ctrl+b

**What to build:** the panel shows each background script as a row (id, state, agents running, elapsed, cost) with its agents indented below; finished script rows linger like agent rows; `x` on a script row stops the script and its agents, on an agent row only that agent. ctrl+b with an empty editor while a foreground script runs moves it to the background; otherwise ctrl+b stays cursor-left.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Script rows and indented agent rows; linger; markers
- [ ] `x` on a script row vs an agent row
- [ ] ctrl+b: empty editor + foreground script → background (consumed); text in the editor or no script → passes through; key releases ignored
- [ ] Panel unit tests and pty tests; full `npm test` green
