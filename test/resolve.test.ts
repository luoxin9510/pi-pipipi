import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readConfig } from "../src/config.ts";
import type { AgentDefinition } from "../src/definition.ts";
import { type ParentContext, resolveChild } from "../src/resolve.ts";
import { sandbox } from "./helpers.ts";

const config = (extra: Record<string, unknown> = {}) =>
  readConfig({ models: { haiku: "anthropic/claude-haiku-5-5", opus: "anthropic/claude-opus-5-5" }, ...extra });
const def = (extra: Partial<AgentDefinition> = {}): AgentDefinition => ({
  name: "a", description: "d", prompt: "PROMPT", source: "/a.md", inert: [], ...extra,
});
const parent = (extra: Partial<ParentContext> = {}): ParentContext => ({
  model: "openai/gpt-x", thinking: "medium", cwd: process.cwd(), trusted: true, sessionId: "p1", ...extra,
});
const input = (extra = {}) => ({ description: "t", prompt: "go", ...extra });
const flag = (args: string[], name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

test("6: model order, aliases, inherit, missing alias throws", () => {
  const m = (d: Partial<AgentDefinition>, i = {}, c = config(), p = parent()) => resolveChild(def(d), input(i), c, p).model;
  assert.equal(m({}), "openai/gpt-x", "nothing set -> parent");
  assert.equal(m({}, {}, config({ defaultModel: "haiku" })), "anthropic/claude-haiku-5-5", "settings default");
  assert.equal(m({ model: "opus" }, {}, config({ defaultModel: "haiku" })), "anthropic/claude-opus-5-5", "definition beats default");
  assert.equal(m({ model: "opus" }, { model: "haiku" }), "anthropic/claude-haiku-5-5", "call beats definition");
  assert.equal(m({ model: "inherit" }, {}, config({ defaultModel: "haiku" })), "openai/gpt-x", "inherit -> parent");
  assert.equal(m({ model: "google/gemini-9" }), "google/gemini-9", "full id passes through");
  assert.throws(() => m({ model: "sonnet" }), /pipipi\.models\.sonnet is not configured/);
  assert.throws(() => m({}, {}, config(), parent({ model: undefined })), /no model to inherit/);

  const t = (d: Partial<AgentDefinition>, i = {}) => flag(resolveChild(def(d), input(i), config(), parent()).args, "--thinking");
  assert.equal(t({}), "medium");
  assert.equal(t({ effort: "low" }), "low");
  assert.equal(t({ effort: "low" }, { effort: "max" }), "max");
});

test("7: tool mapping, deny first, Bash(...) removes bash, mcp passes, unmapped warns, empty throws", () => {
  const r = resolveChild(
    def({
      tools: ["Read", "Grep", "Glob", "LS", "Bash", "WebFetch", "mcp__gh__search", "Agent", "Edit", "custom_tool"],
      disallowedTools: ["Bash(git push *)", "Edit"],
    }),
    input(),
    config(),
    parent(),
  );
  assert.equal(flag(r.args, "--tools"), "read,grep,find,ls,mcp__gh__search,custom_tool");
  assert.equal(flag(r.args, "--exclude-tools"), "bash,edit");
  assert.deepEqual(r.warnings, ['tool "WebFetch" has no pi equivalent']);

  const mapped = resolveChild(def({ tools: ["WebFetch"] }), input(), config({ toolMap: { WebFetch: "mcp__fetch__fetch" } }), parent());
  assert.equal(flag(mapped.args, "--tools"), "mcp__fetch__fetch");

  const inherit = resolveChild(def({ disallowedTools: ["Write"] }), input(), config(), parent());
  assert.equal(inherit.args.includes("--tools"), false, "no tools field -> pi defaults");
  assert.equal(flag(inherit.args, "--exclude-tools"), "write");

  assert.throws(() => resolveChild(def({ tools: ["Bash"], disallowedTools: ["Bash"] }), input(), config(), parent()), /has no usable tools/);
  assert.throws(() => resolveChild(def({ tools: ["WebFetch"] }), input(), config(), parent()), /has no usable tools/);
});

test("8: skills are preloaded into the system prompt; a missing skill warns", () => {
  const s = sandbox();
  s.write(join(s.repo, ".claude/skills/tdd/SKILL.md"), "---\nname: tdd\ndescription: x\n---\nRed green refactor.\n");
  s.write(join(s.home, ".pi/agent/skills/folder-name/SKILL.md"), "---\nname: review\ndescription: y\n---\nReview carefully.\n");
  s.write(join(s.home, ".claude/skills/tdd/SKILL.md"), "---\nname: tdd\n---\nLOWER PRIORITY\n");
  const r = resolveChild(def({ skills: ["tdd", "review", "ghost"] }), input(), config(), parent({ cwd: s.repo }), new Date("2026-11-07T12:00:00Z"));
  assert.match(r.systemPrompt, /^PROMPT\n\n# Skill: tdd\n\n---\nname: tdd[\s\S]*Red green refactor\./);
  assert.match(r.systemPrompt, /# Skill: review\n\n[\s\S]*Review carefully\./);
  assert.doesNotMatch(r.systemPrompt, /LOWER PRIORITY/);
  assert.match(r.systemPrompt, /# Environment\nWorking directory: .*repo\nPlatform: \w+\nDate: 2026-11-07$/);
  assert.deepEqual(r.warnings, ['skill "ghost" not found']);
});

test("9: omitClaudeMd, trust flag, session flags, PIPIPI_DEPTH", () => {
  const plain = resolveChild(def(), input(), config(), parent({ trusted: false }));
  assert.deepEqual(plain.args.slice(0, 3), ["--mode", "json", "-p"]);
  assert.equal(plain.args.includes("--no-context-files"), false);
  assert.ok(plain.args.includes("--no-approve"));
  assert.ok(plain.args.includes("--no-session"), "in-memory parent -> no child session");
  assert.equal(plain.env.PIPIPI_DEPTH, "1");
  assert.match(plain.agentId, /^[a-z0-9]{12}$/);

  const r = resolveChild(def({ omitClaudeMd: true }), input(), config(), parent({ sessionFile: "/s/2026_p1.jsonl" }));
  assert.ok(r.args.includes("--no-context-files"));
  assert.ok(r.args.includes("--approve"));
  assert.equal(flag(r.args, "--session-dir"), "/s/subagents/p1");
  assert.equal(flag(r.args, "--session-id"), r.agentId);
});
