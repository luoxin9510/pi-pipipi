// Ticket 05: preload skills.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { agentFile, happyLines, loadTool, sandbox } from "./helpers.ts";

const skill = (name: string | undefined, body: string) => (name ? `---\nname: ${name}\ndescription: x\n---\n${body}\n` : `${body}\n`);

test("skills are found in order, recursively, through symlinks, and preloaded after the body", async () => {
  const s = sandbox();
  const sub = join(s.repo, "app");
  mkdirSync(sub, { recursive: true });
  s.write(join(s.repo, ".claude/skills/tdd/SKILL.md"), skill("tdd", "Red green refactor."));
  s.write(join(s.home, ".claude/skills/tdd/SKILL.md"), skill("tdd", "LOWER PRIORITY"));
  s.write(join(sub, ".pi/skills/notes/SKILL.md"), skill("notes", "Closest project dir."));
  s.write(join(s.home, ".pi/agent/skills/group/deep/folder-name/SKILL.md"), skill("review", "Review carefully."));
  s.write(join(s.home, ".agents/skills/nested/SKILL.md"), skill("outer", "Outer skill.") );
  s.write(join(s.home, ".agents/skills/nested/inner/SKILL.md"), skill("inner", "Inside another skill: not a skill."));
  s.write(join(s.root, "elsewhere/linked/SKILL.md"), skill(undefined, "Linked skill, matched by folder name."));
  mkdirSync(join(s.repo, ".agents/skills"), { recursive: true });
  symlinkSync(join(s.root, "elsewhere/linked"), join(s.repo, ".agents/skills/linked"));
  s.write(join(sub, ".pi/agents/x.md"), agentFile("name: x\ndescription: d\nskills: tdd, notes, review, linked, outer, inner, ghost", "AGENT BODY"));
  s.scenario({ lines: happyLines() });

  const t = await loadTool({}, { cwd: sub });
  const r = (await t.run({ subagent_type: "x" })).structuredContent;
  const prompt = s.record().systemPrompt!;

  const order = ["AGENT BODY", "# Skill: tdd", "# Skill: notes", "# Skill: review", "# Skill: linked", "# Skill: outer", "# Environment"];
  const at = order.map((h) => prompt.indexOf(h));
  assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1]!)), `sections out of order: ${at}`);
  assert.ok(prompt.startsWith("AGENT BODY\n\n# Skill: tdd\n\n---\nname: tdd"), "full SKILL.md text, frontmatter included");
  assert.match(prompt, /Red green refactor\./);
  assert.doesNotMatch(prompt, /LOWER PRIORITY/);
  assert.match(prompt, /Closest project dir\./);
  assert.match(prompt, /Review carefully\./);
  assert.match(prompt, /Linked skill, matched by folder name\./);
  assert.doesNotMatch(prompt, /Inside another skill/);
  assert.match(prompt, /\n# Environment\nWorking directory: .*app\nPlatform: \w+\nDate: \d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(r.warnings, ['skill "inner" not found', 'skill "ghost" not found']);
  assert.equal(r.status, "completed", "missing skills do not stop the run");
});

test("the system prompt replaces pi's default", async () => {
  const s = sandbox();
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  await t.run({});
  const argv = s.record().argv;
  assert.ok(argv.includes("--system-prompt"));
  assert.equal(argv.includes("--append-system-prompt"), false);
});

test("an unreadable skills directory counts as empty: the skill is reported not found", async () => {
  const s = sandbox();
  s.write(join(s.repo, ".pi/skills/locked/SKILL.md"), skill("hidden", "Secret."));
  s.write(join(s.repo, ".pi/agents/x.md"), agentFile("name: x\ndescription: d\nskills: hidden"));
  s.scenario({ lines: happyLines() });
  const t = await loadTool({}, { cwd: s.repo });
  chmodSync(join(s.repo, ".pi/skills/locked"), 0o000);
  try {
    const r = (await t.run({ subagent_type: "x" })).structuredContent;
    assert.deepEqual(r.warnings, ['skill "hidden" not found']);
    assert.equal(r.status, "completed");
  } finally {
    chmodSync(join(s.repo, ".pi/skills/locked"), 0o755);
  }
});
