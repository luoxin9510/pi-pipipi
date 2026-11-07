// Ticket 02: load Claude Code agent files.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { agentFile, flag, happyLines, loadTool, sandbox } from "./helpers.ts";

const def = (name: string, desc: string, body = `Prompt of ${name} (${desc}).`) => agentFile(`name: ${name}\ndescription: ${desc}`, body);

test("precedence across the five sources, closest project dir first, recursive scan", async () => {
  const s = sandbox();
  const sub = join(s.repo, "pkg", "app");
  mkdirSync(sub, { recursive: true });
  s.write(join(sub, ".pi/agents/a.md"), def("a", "sub-pi"));
  s.write(join(s.repo, ".pi/agents/a.md"), def("a", "root-pi"));
  s.write(join(sub, ".claude/agents/a.md"), def("a", "sub-claude"));
  s.write(join(s.home, ".pi/agent/agents/a.md"), def("a", "home-pi"));
  s.write(join(s.home, ".claude/agents/a.md"), def("a", "home-claude"));
  s.write(join(s.repo, ".claude/agents/nested/deep/b.md"), def("b", "root-claude"));
  s.write(join(s.home, ".pi/agent/agents/b.md"), def("b", "home-pi"));
  s.write(join(s.home, ".pi/agent/agents/c.md"), def("c", "home-pi"));
  s.write(join(s.home, ".claude/agents/c.md"), def("c", "home-claude"));
  s.write(join(s.home, ".claude/agents/d.md"), def("d", "home-claude"));
  s.write(join(s.home, ".claude/agents/Explore.md"), def("Explore", "mine"));
  s.write(join(s.root, ".pi/agents/outside.md"), def("outside", "beyond the repo root"));
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: sub });

  const ranWith = async (name: string) => {
    await t.run({ subagent_type: name });
    return s.record().systemPrompt!.split("\n")[0];
  };
  assert.equal(await ranWith("a"), "Prompt of a (sub-pi).");
  assert.equal(await ranWith("b"), "Prompt of b (root-claude).");
  assert.equal(await ranWith("c"), "Prompt of c (home-pi).");
  assert.equal(await ranWith("d"), "Prompt of d (home-claude).");
  assert.equal(await ranWith("Explore"), "Prompt of Explore (mine).", "a user file overrides a built-in");
  assert.match(await ranWith("Plan"), /software architect/, "built-in Plan");
  await assert.rejects(t.run({ subagent_type: "outside" }), /unknown subagent_type "outside"\. Available: .*general-purpose/);

  assert.match(t.tool.description, /- a: sub-pi\n/);
  assert.match(t.tool.description, /- Plan: Read-only software architect/);
});

test("without a repo only cwd is scanned", async () => {
  const s = sandbox();
  const dir = join(s.root, "plain", "child");
  mkdirSync(dir, { recursive: true });
  s.write(join(s.root, "plain/.claude/agents/up.md"), def("up", "parent dir"));
  s.write(join(dir, ".claude/agents/here.md"), def("here", "cwd"));
  const t = await loadTool({}, { cwd: dir });
  assert.match(t.tool.description, /- here: cwd/);
  assert.doesNotMatch(t.tool.description, /- up:/);
});

test("definitions are re-read on every call", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  s.write(join(s.repo, ".pi/agents/late.md"), def("late", "added after session start", "Version 1."));
  await t.run({ subagent_type: "late" });
  assert.match(s.record().systemPrompt!, /^Version 1\./);
  s.write(join(s.repo, ".pi/agents/late.md"), def("late", "edited", "Version 2."));
  await t.run({ subagent_type: "late" });
  assert.match(s.record().systemPrompt!, /^Version 2\./);
});

test("every skip reason is reported at session start, naming the file", async () => {
  const s = sandbox();
  const bad: [string, string, RegExp][] = [
    ["nofm", "no frontmatter\n---\nname: x\n---", /does not start with --- frontmatter/],
    ["unclosed", "---\nname: x\ndescription: d\n", /frontmatter is not closed/],
    ["yaml", "---\nname: [x\ndescription: d\n---\n", /invalid YAML/],
    ["noname", "---\ndescription: d\n---\n", /missing "name"/],
    ["numname", "---\nname: 5\ndescription: d\n---\n", /"name" must be a string/],
    ["longname", `---\nname: ${"a".repeat(257)}\ndescription: d\n---\n`, /1-256 characters/],
    ["colon", '---\nname: "a:b"\ndescription: d\n---\n', /must not contain ":"/],
    ["dash", '---\nname: "-a"\ndescription: d\n---\n', /must not start with "-"/],
    ["nodesc", "---\nname: a\n---\n", /missing "description"/],
    ["turns", "---\nname: a\ndescription: d\nmaxTurns: ten\n---\n", /"maxTurns" must be a positive integer/],
    ["effort", "---\nname: a\ndescription: d\neffort: huge\n---\n", /"effort" must be low/],
    ["tools", "---\nname: a\ndescription: d\ntools: 3\n---\n", /"tools" must be/],
    ["omit", "---\nname: a\ndescription: d\nomitClaudeMd: maybe\n---\n", /"omitClaudeMd" must be true or false/],
    ["model", "---\nname: a\ndescription: d\nmodel: 7\n---\n", /"model" must be a string/],
    ["skills", "---\nname: a\ndescription: d\nskills: {x: 1}\n---\n", /"skills" must be/],
  ];
  for (const [file, text] of bad) s.write(join(s.repo, `.pi/agents/${file}.md`), text);
  const t = await loadTool({}, { cwd: s.repo });
  for (const [file, , reason] of bad) {
    const note = t.notes.find((n) => n.includes(`${file}.md:`));
    assert.ok(note, `no warning for ${file}`);
    assert.match(note, /^pi-pipipi: skipped agent file /);
    assert.match(note, reason, file);
  }
  assert.doesNotMatch(t.tool.description, /- a:/);
});

test("unsupported Claude Code fields warn; unknown keys are ignored; same-folder duplicates warn", async () => {
  const s = sandbox();
  s.write(join(s.repo, ".pi/agents/inert.md"), agentFile("name: inert\ndescription: d\ncolor: blue\nhooks: {}\nwhatever: 1"));
  s.write(join(s.home, ".claude/agents/x1.md"), def("dup", "first"));
  s.write(join(s.home, ".claude/agents/x2.md"), def("dup", "second"));
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  assert.ok(t.notes.includes('pi-pipipi: inert: field "color" has no effect in pi-pipipi'));
  assert.ok(t.notes.includes('pi-pipipi: inert: field "hooks" has no effect in pi-pipipi'));
  assert.ok(!t.notes.some((n) => n.includes("whatever")));
  assert.ok(t.notes.some((n) => /dup" is defined twice: .*x1\.md wins over .*x2\.md/.test(n)));
  assert.match(t.tool.description, /- dup: first/);
  const r = (await t.run({ subagent_type: "inert" })).structuredContent;
  assert.deepEqual(r.warnings, ['field "color" has no effect in pi-pipipi', 'field "hooks" has no effect in pi-pipipi']);
});

test("every supported field of a Claude Code file reaches the child; comma and list tools both work", async () => {
  const s = sandbox();
  s.write(
    join(s.repo, ".claude/agents/full.md"),
    agentFile(
      ["name: full", "description: All fields", "tools: Read, Grep,Glob", "disallowedTools:", "  - Write", "model: sonnet", "effort: high", "omitClaudeMd: true"].join("\n"),
      "\nBody line 1\nBody line 2\n",
    ),
  );
  s.write(join(s.repo, ".claude/agents/listed.md"), agentFile("name: listed\ndescription: d\ntools:\n  - Read\n  - Bash"));
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  await t.run({ subagent_type: "full" });
  const rec = s.record();
  assert.equal(flag(rec.argv, "--tools"), "read,grep,find");
  assert.equal(flag(rec.argv, "--exclude-tools"), "write");
  assert.equal(flag(rec.argv, "--model"), "anthropic/claude-sonnet-5-5");
  assert.equal(flag(rec.argv, "--thinking"), "high");
  assert.ok(rec.argv.includes("--no-context-files"));
  assert.match(rec.systemPrompt!, /^Body line 1\nBody line 2\n\n# Environment/);
  await t.run({ subagent_type: "listed" });
  assert.equal(flag(s.record().argv, "--tools"), "read,bash");
});

test("the code-reviewer example from the Claude Code docs loads unchanged", async () => {
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
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  assert.deepEqual(t.notes, []);
  const r = (await t.run({ subagent_type: "code-reviewer" })).structuredContent;
  assert.equal(r.status, "completed");
  assert.deepEqual(r.warnings, []);
  const rec = s.record();
  assert.equal(flag(rec.argv, "--tools"), "read,grep,find,bash");
  assert.match(rec.systemPrompt!, /^You are a senior code reviewer/);
});
