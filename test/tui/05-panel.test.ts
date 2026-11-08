// Ticket v2-05: the subagent panel in real interactive pi (pty + headless xterm), parent and subagents on real haiku.
import assert from "node:assert/strict";
import { test } from "node:test";
import { withPi } from "./harness.ts";

// Row text only the panel draws (the transcript shows the script with quotes around the descriptions).
const ONE = "general-purpose(sleepy one)";
const TWO = "general-purpose(sleepy two)";

const SCRIPT = `Use the codemode tool. Script:
const [x, y] = await Promise.all([
  tools.Agent({ description: "sleepy one", prompt: "Run the bash command 'sleep 9' using a tool, then reply OK.", subagent_type: "general-purpose" }),
  tools.Agent({ description: "sleepy two", prompt: "Run the bash command 'sleep 22' using a tool, then reply OK.", subagent_type: "general-purpose" }),
]);
return [x.status, y.status];`;

test("the panel lists both running subagents, updates them, takes focus, and drops finished rows after the linger", async () => {
  await withPi({ env: { PIPIPI_PANEL_LINGER_MS: "4000" } }, async (pi) => {
    await pi.waitFor("claude-haiku");
    pi.submit(SCRIPT);

    // both rows appear while the script runs
    const screen = await pi.waitFor((s) => s.includes(`● running · ${ONE}`) && s.includes(`● running · ${TWO}`), 90_000);
    assert.match(screen, /Subagents \(2\)/);

    // a row updates: turns and last tool
    await pi.waitFor((s) => /running · general-purpose\(sleepy one\) · [1-9]\d* turns · bash/.test(s), 60_000);

    // ↓ on the empty editor focuses the panel; the first row is selected and the hint shows
    pi.press("down");
    let v = await pi.waitFor("esc back to editor");
    assert.match(v, /▸ .*sleepy one/);
    pi.press("down");
    v = await pi.waitFor((s) => /▸ .*sleepy two/.test(s));
    pi.press("up", "up"); // second -> first -> above the first: back to the editor
    await pi.waitGone("esc back to editor");

    // while focused the keys do not reach the editor; after Esc they do
    pi.press("down");
    await pi.waitFor("esc back to editor");
    pi.type("q");
    pi.press("esc");
    await pi.waitGone("esc back to editor");
    assert.doesNotMatch(pi.viewport(), /^q\s*$/m, "the key typed while the panel had focus was swallowed");
    pi.type("z");
    await pi.waitFor((s) => /^z\s*$/m.test(s));
    pi.type("\x7f"); // erase it again

    // the short job finishes first: marked completed, then dropped after the linger while the other still runs
    await pi.waitFor(`✓ completed · ${ONE}`, 60_000);
    await pi.waitFor((s) => !s.includes(`completed · ${ONE}`) && s.includes(`● running · ${TWO}`) && /Subagents \(1\)/.test(s), 20_000);

    // the other one finishes, lingers, and the panel hides
    await pi.waitFor(`✓ completed · ${TWO}`, 60_000);
    await pi.waitGone("Subagents (", 20_000);
  });
});
