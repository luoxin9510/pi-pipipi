import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { discoverAgents } from "../src/discovery.ts";
import { agentFile, sandbox } from "./helpers.ts";

const def = (name: string, desc: string) => agentFile(`name: ${name}\ndescription: ${desc}`);

test("4: precedence across sources, closest project dir wins, same-source duplicate warns", () => {
  const s = sandbox();
  const sub = join(s.repo, "pkg", "app");
  mkdirSync(sub, { recursive: true });
  // "a" in every source: the closest .pi wins.
  s.write(join(sub, ".pi/agents/a.md"), def("a", "sub-pi"));
  s.write(join(s.repo, ".pi/agents/a.md"), def("a", "root-pi"));
  s.write(join(sub, ".claude/agents/a.md"), def("a", "sub-claude"));
  s.write(join(s.home, ".pi/agent/agents/a.md"), def("a", "home-pi"));
  s.write(join(s.home, ".claude/agents/a.md"), def("a", "home-claude"));
  // "b": project .claude beats both user dirs; recursive scan finds nested files.
  s.write(join(s.repo, ".claude/agents/nested/deep/b.md"), def("b", "root-claude"));
  s.write(join(s.home, ".pi/agent/agents/b.md"), def("b", "home-pi"));
  // "c": user .pi beats user .claude.
  s.write(join(s.home, ".pi/agent/agents/c.md"), def("c", "home-pi"));
  s.write(join(s.home, ".claude/agents/c.md"), def("c", "home-claude"));
  // A user agent overrides a built-in of the same name.
  s.write(join(s.home, ".claude/agents/Explore.md"), def("Explore", "mine"));
  // Same name twice in one source: first in sorted path order wins, with a warning.
  s.write(join(s.home, ".claude/agents/x1.md"), def("dup", "first"));
  s.write(join(s.home, ".claude/agents/x2.md"), def("dup", "second"));
  // A broken file is skipped with a warning; inert fields warn.
  s.write(join(s.repo, ".pi/agents/broken.md"), "---\nname: nope\n---\n");
  s.write(join(s.repo, ".pi/agents/inert.md"), agentFile("name: inert\ndescription: d\nmemory: user"));
  // Outside the repo root: never scanned.
  s.write(join(s.root, ".pi/agents/outside.md"), def("outside", "no"));

  const { agents, warnings } = discoverAgents(sub);
  const desc = (n: string) => agents.get(n)?.description;
  assert.equal(desc("a"), "sub-pi");
  assert.equal(desc("b"), "root-claude");
  assert.equal(desc("c"), "home-pi");
  assert.equal(desc("Explore"), "mine");
  assert.equal(desc("dup"), "first");
  assert.equal(agents.get("Plan")?.source, "builtin:Plan");
  assert.ok(agents.has("general-purpose"));
  assert.equal(agents.has("outside"), false);
  assert.equal(agents.has("nope"), false);
  assert.ok(warnings.some((w) => /dup.*defined twice.*x1\.md wins over .*x2\.md/.test(w)), warnings.join("\n"));
  assert.ok(warnings.some((w) => /skipped agent file .*broken\.md: missing "description"/.test(w)));
  assert.ok(warnings.includes('inert: field "memory" has no effect in pi-pipipi'));
});

test("4b: without a repo only cwd is scanned", () => {
  const s = sandbox();
  const dir = join(s.root, "plain", "child");
  mkdirSync(dir, { recursive: true });
  s.write(join(s.root, "plain/.claude/agents/up.md"), def("up", "parent"));
  s.write(join(dir, ".claude/agents/here.md"), def("here", "cwd"));
  const { agents } = discoverAgents(dir);
  assert.ok(agents.has("here"));
  assert.equal(agents.has("up"), false);
});

test("5: the code-reviewer example from the Claude Code docs loads unchanged", () => {
  const s = sandbox();
  s.write(
    join(s.repo, ".claude/agents/code-reviewer.md"),
    `---
name: code-reviewer
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code.
tools: Read, Grep, Glob, Bash
model: inherit
---

You are a senior code reviewer ensuring high standards of code quality and security.

When invoked:
1. Run git diff to see recent changes
2. Focus on modified files
3. Begin review immediately
`,
  );
  const { agents, warnings } = discoverAgents(s.repo);
  const a = agents.get("code-reviewer");
  assert.ok(a);
  assert.deepEqual(a.tools, ["Read", "Grep", "Glob", "Bash"]);
  assert.equal(a.model, "inherit");
  assert.match(a.prompt, /^You are a senior code reviewer/);
  assert.deepEqual(warnings, []);
});
