// Ticket 03: model selection.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { agentFile, flag, happyLines, loadTool, sandbox } from "./helpers.ts";

async function setup(settings: Record<string, unknown> = {}, parentModel: { provider: string; id: string } | null = { provider: "openai", id: "gpt-x" }) {
  const s = sandbox();
  for (const m of ["opus", "fable", "inherit", "google/gemini-9"]) {
    s.write(join(s.repo, `.pi/agents/${m.replace("/", "-")}.md`), agentFile(`name: m-${m.replace("/", "-")}\ndescription: d\nmodel: ${m}`));
  }
  s.write(join(s.repo, ".pi/agents/effort.md"), agentFile("name: effortful\ndescription: d\neffort: low"));
  s.scenario({ lines: happyLines() });
  const t = await loadTool(settings, { cwd: s.repo, model: parentModel ?? undefined, thinkingLevel: "medium" });
  const run = async (params: Record<string, unknown>) => {
    const r = (await t.run(params)).structuredContent;
    const argv = s.record().argv;
    assert.equal(flag(argv, "--model"), r.model, "result.model is what the child got");
    return { model: r.model, thinking: flag(argv, "--thinking") };
  };
  return { run };
}

test("nothing set: haiku, never the parent model; built-ins too", async () => {
  const { run } = await setup();
  for (const type of ["general-purpose", "Explore", "Plan"]) {
    assert.equal((await run({ subagent_type: type })).model, "anthropic/claude-haiku-5-5", type);
  }
});

test("order: call > definition > defaultModel; aliases map to same-name Anthropic models", async () => {
  const { run } = await setup({ defaultModel: "sonnet" });
  assert.equal((await run({})).model, "anthropic/claude-sonnet-5-5", "settings default");
  assert.equal((await run({ subagent_type: "m-opus" })).model, "anthropic/claude-opus-5-5", "definition beats default");
  assert.equal((await run({ subagent_type: "m-fable" })).model, "anthropic/claude-fable-5-1");
  assert.equal((await run({ subagent_type: "m-opus", model: "haiku" })).model, "anthropic/claude-haiku-5-5", "call beats definition");
  assert.equal((await run({ subagent_type: "m-google-gemini-9" })).model, "google/gemini-9", "full ids pass through");
});

test("a settings override changes only that alias", async () => {
  const { run } = await setup({ models: { haiku: "deepseek/flash" } });
  assert.equal((await run({})).model, "deepseek/flash");
  assert.equal((await run({ model: "opus" })).model, "anthropic/claude-opus-5-5");
});

test("inherit in the call, the definition or defaultModel uses the parent model", async () => {
  assert.equal((await (await setup()).run({ model: "inherit" })).model, "openai/gpt-x");
  assert.equal((await (await setup()).run({ subagent_type: "m-inherit" })).model, "openai/gpt-x");
  assert.equal((await (await setup({ defaultModel: "inherit" })).run({})).model, "openai/gpt-x");
});

test("inherit without a parent model throws", async () => {
  const { run } = await setup({}, null);
  await assert.rejects(run({ model: "inherit" }), /no model to inherit/);
  assert.equal((await run({})).model, "anthropic/claude-haiku-5-5", "the default does not need a parent model");
});

test("thinking: call effort > definition effort > parent thinking level", async () => {
  const { run } = await setup();
  assert.equal((await run({})).thinking, "medium");
  assert.equal((await run({ subagent_type: "effortful" })).thinking, "low");
  assert.equal((await run({ subagent_type: "effortful", effort: "max" })).thinking, "max");
});
