import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDefinition } from "../src/definition.ts";
import { agentFile } from "./helpers.ts";

const parse = (text: string) => parseDefinition("/a.md", text);

test("1: valid file with every tier A field parses; comma and list tools both work", () => {
  const r = parse(
    agentFile(
      [
        "name: reviewer",
        "description: Reviews code",
        "tools: Read, Grep,Glob",
        "disallowedTools:",
        "  - Write",
        "  - Bash(git push *)",
        "model: sonnet",
        "effort: high",
        "maxTurns: 7",
        "skills: [tdd, review]",
        "omitClaudeMd: true",
      ].join("\n"),
      "\nBody line 1\nBody line 2\n",
    ),
  );
  assert.ok(r.ok);
  assert.deepEqual(r.def, {
    name: "reviewer",
    description: "Reviews code",
    prompt: "Body line 1\nBody line 2",
    tools: ["Read", "Grep", "Glob"],
    disallowedTools: ["Write", "Bash(git push *)"],
    model: "sonnet",
    effort: "high",
    maxTurns: 7,
    skills: ["tdd", "review"],
    omitClaudeMd: true,
    source: "/a.md",
    inert: [],
  });
});

test("2: each skip reason yields a matching reason", () => {
  const cases: [string, RegExp][] = [
    ["no frontmatter\n---\nname: x\n---", /does not start/],
    ["---\nname: x\ndescription: d\n", /not closed/],
    ["---\nname: [x\ndescription: d\n---\n", /invalid YAML/],
    ["---\ndescription: d\n---\n", /missing "name"/],
    ["---\nname: 5\ndescription: d\n---\n", /must be a string/],
    [`---\nname: ${"a".repeat(257)}\ndescription: d\n---\n`, /1-256/],
    ['---\nname: "a:b"\ndescription: d\n---\n', /":"/],
    ['---\nname: "-a"\ndescription: d\n---\n', /start with "-"/],
    ["---\nname: a\n---\n", /missing "description"/],
    ["---\nname: a\ndescription: d\nmaxTurns: ten\n---\n", /maxTurns/],
    ["---\nname: a\ndescription: d\neffort: huge\n---\n", /effort/],
    ["---\nname: a\ndescription: d\ntools: 3\n---\n", /tools/],
    ["---\nname: a\ndescription: d\nomitClaudeMd: yes please\n---\n", /omitClaudeMd/],
  ];
  for (const [text, reason] of cases) {
    const r = parse(text);
    assert.equal(r.ok, false, text);
    if (!r.ok) assert.match(r.reason, reason, text);
  }
});

test("3: tier B/C fields land in inert; unknown keys are ignored", () => {
  const r = parse(agentFile("name: a\ndescription: d\ncolor: blue\nhooks: {}\npermissionMode: plan\nwhatever: 1"));
  assert.ok(r.ok);
  assert.deepEqual(r.def.inert, ["color", "permissionMode", "hooks"]);
  assert.equal("whatever" in r.def, false);
});
