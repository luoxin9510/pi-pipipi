// The panel's rows and focus rules against the real registry, no pi and no model: what the widget would draw, and what
// the key hook would consume. The real terminal is covered in test/tui/.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Panel } from "../../src/panel.ts";
import { registry } from "../../src/registry.ts";

const theme: any = { fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => `[sel]${s}` };
const parent = (sessionId: string) => ({ thinking: "off", cwd: "/tmp", trusted: true, sessionId });
const start = (sessionId: string, id: string, description: string) => {
  registry.begin(parent(sessionId), { id, type: "Explore", description, model: "m", thinking: "off" });
};
const KEY = { down: "\x1b[B", up: "\x1b[A", esc: "\x1b", enter: "\r" };

function setup(sessionId: string) {
  const opened: string[] = [];
  let renders = 0;
  const panel = new Panel(sessionId, theme, () => renders++, (r) => opened.push(r.id));
  return { panel, opened, renders: () => renders };
}

test("hidden when empty; a running row shows type, description, status, turns, last tool and cost", () => {
  const { panel } = setup("p1");
  assert.deepEqual(panel.render(100), []);
  start("p1", "a1", "find it");
  registry.progress("a1", { turns: 3, lastTool: "grep" });
  const text = panel.render(100).join("\n");
  for (const part of ["Explore(find it)", "running", "3 turns", "grep", "$0.0000"]) assert.ok(text.includes(part), `${part} in:\n${text}`);
  panel.dispose();
});

test("failed and stopped rows are marked; finished rows drop after the linger, and the panel hides again", async () => {
  process.env.PIPIPI_PANEL_LINGER_MS = "150";
  try {
    const { panel, renders } = setup("p2");
    start("p2", "b1", "one");
    start("p2", "b2", "two");
    start("p2", "b3", "three");
    registry.finish("b1", "failed");
    registry.finish("b2", "stopped");
    const text = panel.render(100).join("\n");
    assert.match(text, /✗ failed · Explore\(one\)/);
    assert.match(text, /■ stopped · Explore\(two\)/);
    assert.match(text, /● running · Explore\(three\)/);
    const before = renders();
    await new Promise((r) => setTimeout(r, 300));
    const later = panel.render(100).join("\n");
    assert.ok(!later.includes("one") && !later.includes("two"), later);
    assert.ok(later.includes("three"), "running rows stay");
    assert.ok(renders() > before, "the panel asked for a redraw when the rows expired");
    registry.finish("b3", "completed");
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(panel.render(100), []);
    panel.dispose();
  } finally {
    delete process.env.PIPIPI_PANEL_LINGER_MS;
  }
});

test("focus: only ↓ on an empty editor enters; keys are consumed only while focused; Esc and ↑ above the first row leave", () => {
  const { panel, opened } = setup("p3");
  assert.equal(panel.handleKey(KEY.down, true), false, "no rows, nothing to focus");
  start("p3", "c1", "one");
  start("p3", "c2", "two");
  assert.equal(panel.handleKey(KEY.down, false), false, "editor has text");
  assert.equal(panel.handleKey("x", true), false, "other keys are not ours");
  assert.equal(panel.hasFocus(), false);

  assert.equal(panel.handleKey(KEY.down, true), true);
  assert.equal(panel.hasFocus(), true);
  assert.ok(panel.render(100).some((l) => l.startsWith("[sel]▸")), "the selected row is highlighted");
  assert.equal(panel.handleKey("x", true), true, "while focused every key is swallowed");

  panel.handleKey(KEY.down, true);
  panel.handleKey(KEY.down, true); // stays on the last row
  assert.ok(panel.render(100).some((l) => l.startsWith("[sel]▸") && l.includes("Explore(two)")));
  panel.handleKey(KEY.enter, true);
  assert.deepEqual(opened, ["c2"], "Enter opens the selected row");

  panel.handleKey(KEY.up, true);
  assert.equal(panel.hasFocus(), true, "↑ from the second row only moves");
  panel.handleKey(KEY.up, true);
  assert.equal(panel.hasFocus(), false, "↑ above the first row leaves");
  assert.equal(panel.handleKey(KEY.up, true), false);

  panel.handleKey(KEY.down, true);
  assert.equal(panel.handleKey(KEY.esc, true), true);
  assert.equal(panel.hasFocus(), false, "Esc leaves");
  panel.dispose();
});
