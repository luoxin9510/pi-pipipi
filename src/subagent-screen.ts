// The subagent screen (v2 spec, "TUI: Subagent screen"): a full-terminal overlay that shows one subagent's session with
// pi's own message components. It is a view only: it never touches the main session (no switchSession), so main keeps
// running underneath. The transcript is re-read from the child's session file while the subagent runs.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AssistantMessageComponent,
  buildSessionContext,
  type ExtensionContext,
  getMarkdownTheme,
  parseSessionEntries,
  type SessionEntry,
  type Theme,
  type ToolRenderers,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { type Component, type Focusable, Input, matchesKey, Text, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import { registry, type SubagentRecord } from "./registry.ts";

export const POLL_MS = 300;
const PAD = 1;

// The child's session file: `<ts>_<agentId>.jsonl` in the record's session dir.
export function sessionFileOf(r: SubagentRecord): string | undefined {
  if (!r.sessionDir || !existsSync(r.sessionDir)) return undefined;
  const name = readdirSync(r.sessionDir).find((f) => f.endsWith(`_${r.id}.jsonl`));
  return name && join(r.sessionDir, name);
}

// A call is drawn as its name and its arguments. A codemode script is shown alone as code, line by line; other strings
// are shown as they are (a multi-line one starts on its own line). Pi's default prints the script as one JSON line, and
// its own renderers for the registered tools are not reachable from an extension.
const callRenderers = (name: string): ToolRenderers => ({
  renderCall: (args: unknown, theme: Theme) => {
    const a = (args ?? {}) as Record<string, unknown>;
    const fields =
      name === "codemode" && typeof a.code === "string"
        ? [a.code]
        : Object.entries(a).map(([k, v]) => {
            const text = typeof v === "string" ? v : JSON.stringify(v, null, 2);
            return text.includes("\n") ? `${k}:\n${text}` : `${k}: ${text}`;
          });
    return new Text([theme.fg("toolTitle", theme.bold(name)), ...fields.map((f) => theme.fg("muted", f))].join("\n"), 0, 0);
  },
});

// The transcript as pi draws a session: user and assistant messages, one tool row per call with its result.
export function transcriptParts(file: string, tui: TUI, cwd: string): Component[] {
  const entries = parseSessionEntries(readFileSync(file, "utf8")).filter((e) => e.type !== "session") as SessionEntry[];
  const md = getMarkdownTheme();
  const parts: Component[] = [];
  const pending = new Map<string, ToolExecutionComponent>();
  for (const m of buildSessionContext(entries).messages as any[]) {
    if (m.role === "user") {
      const text = typeof m.content === "string" ? m.content : m.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
      if (text) parts.push(new UserMessageComponent(text, md, PAD));
    } else if (m.role === "assistant") {
      parts.push(new AssistantMessageComponent(m, false, md, undefined, PAD));
      for (const c of m.content) {
        if (c.type !== "toolCall") continue;
        const row = new ToolExecutionComponent(c.name, c.id, c.arguments, { outputPad: PAD }, callRenderers(c.name), tui, cwd);
        row.setExpanded(true); // the point of this screen is to read scripts and outputs in full
        row.markExecutionStarted();
        pending.set(c.id, row);
        parts.push(row);
      }
    } else if (m.role === "toolResult") {
      pending.get(m.toolCallId)?.updateResult(m);
    }
  }
  return parts;
}

const ICONS: Record<string, string> = { running: "●", completed: "✓", partial: "◐", failed: "✗", stopped: "■" };

export class SubagentScreen implements Component, Focusable {
  private input = new Input();
  private parts: Component[] = [];
  private signature = "";
  private offset = 0; // lines scrolled up from the bottom; 0 follows the live end
  private notice = "";
  private lines: string[] = [];
  private linesWidth = -1;
  private timer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;

  private tui: TUI;
  private theme: Theme;
  private id: string;
  private mainIdle: () => boolean;
  private cwd: string;
  private done: () => void;

  constructor(tui: TUI, theme: Theme, id: string, mainIdle: () => boolean, cwd: string, done: () => void) {
    this.tui = tui;
    this.theme = theme;
    this.id = id;
    this.mainIdle = mainIdle;
    this.cwd = cwd;
    this.done = done;
    this.unsubscribe = registry.subscribe(() => this.tui.requestRender());
    this.timer = setInterval(() => this.tui.requestRender(), POLL_MS);
    this.timer.unref();
    this.input.onSubmit = (text) => this.submit(text.trim());
  }

  get focused(): boolean {
    return this.input.focused;
  }
  set focused(value: boolean) {
    this.input.focused = value;
  }

  private submit(text: string): void {
    this.input.setValue("");
    if (text === "/main") return this.done();
    if (text.startsWith("/")) this.notice = `${text.split(/\s/)[0]} is not available on a subagent screen (/main goes back)`;
    else if (text) this.notice = "talking to a subagent is not available yet";
  }

  handleInput(data: string): void {
    const page = Math.max(1, this.tui.terminal.rows - 6);
    this.notice = "";
    if (matchesKey(data, "escape")) return this.done();
    if (matchesKey(data, "pageUp")) this.offset += page;
    else if (matchesKey(data, "pageDown")) this.offset = Math.max(0, this.offset - page);
    else if (matchesKey(data, "up")) this.offset += 1;
    else if (matchesKey(data, "down")) this.offset = Math.max(0, this.offset - 1);
    else if (matchesKey(data, "home")) this.offset = Number.MAX_SAFE_INTEGER;
    else if (matchesKey(data, "end")) this.offset = 0;
    else this.input.handleInput(data);
    this.tui.requestRender();
  }

  // Re-read the session file when it changed (appends are whole lines; a torn last line is skipped by the parser).
  private refresh(r: SubagentRecord): void {
    const file = sessionFileOf(r);
    if (!file) return;
    const st = statSync(file);
    const signature = `${file}:${st.size}:${st.mtimeMs}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.parts = transcriptParts(file, this.tui, this.cwd);
    this.linesWidth = -1;
  }

  render(width: number): string[] {
    const t = this.theme;
    const rows = this.tui.terminal.rows;
    const r = registry.get(this.id)!;
    this.refresh(r);
    if (this.linesWidth !== width) {
      this.lines = this.parts.flatMap((p) => ["", ...p.render(width)]);
      this.linesWidth = width;
    }
    const what = r.description ? `${r.type}(${r.description})` : r.type;
    const main = this.mainIdle() ? t.fg("muted", "main: idle") : t.fg("accent", "main: running");
    const sub = `${ICONS[r.status] ?? "?"} ${r.status} · ${r.turns} turns`;
    const head = truncateToWidth(` ${t.fg("accent", "‹ main")} ${t.fg("dim", "(esc or /main)")} ${t.fg("muted", "·  main ›")} ${t.bold(what)}   ${main} · ${t.fg("muted", sub)}`, width);
    const rule = t.fg("dim", "─".repeat(width));

    const height = Math.max(1, rows - 5);
    this.offset = Math.min(this.offset, Math.max(0, this.lines.length - height));
    const end = this.lines.length - this.offset;
    const body = this.lines.slice(Math.max(0, end - height), end).map((l) => truncateToWidth(l, width));
    while (body.length < height) body.push("");
    const scrolled = this.offset > 0 ? ` · ${this.offset} lines above the end` : "";
    const hint = this.notice || `↑↓ pgup/pgdn scroll${scrolled} · esc or /main back to main`;
    return [head, rule, ...body, rule, ...this.input.render(width), t.fg("dim", truncateToWidth(` ${hint}`, width))].slice(0, rows);
  }

  invalidate(): void {
    this.linesWidth = -1;
  }

  dispose(): void {
    clearInterval(this.timer);
    this.unsubscribe();
  }
}

let current: Promise<void> | undefined;

// Show the subagent's screen over the terminal. Resolves when the user leaves. One screen at a time.
export function openSubagentScreen(ctx: ExtensionContext, r: SubagentRecord): Promise<void> {
  if (current) return current;
  current = ctx.ui
    .custom<void>((tui, theme, _kb, done) => new SubagentScreen(tui, theme, r.id, () => ctx.isIdle(), ctx.cwd, () => done()), {
      overlay: true,
      overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left" },
    })
    .finally(() => (current = undefined));
  return current;
}
