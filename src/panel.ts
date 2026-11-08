// The subagent panel (v2 spec, "TUI"): a widget below the editor with one row per subagent of the session, drawn from
// the registry and redrawn on its changes. ↓ on an empty editor moves focus into it; while it has focus it consumes
// the keys it uses (↑ ↓ enter x esc) and lets every other key through to pi.

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { Config } from "./config.ts";
import { COLORS, ICONS, label, registry, type SubagentRecord } from "./registry.ts";
import { openSubagentScreen } from "./subagent-screen.ts";

export interface PanelOptions {
  lingerMs: number; // finished rows drop out this long after they ended
  viewable: boolean; // false for an in-memory session: subagents cannot be viewed, so no rows, only a notice
}

export class Panel {
  private focused = false;
  private selected = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;
  private sessionId: string;
  private theme: Theme;
  private requestRender: () => void;
  private open: (r: SubagentRecord) => void;
  private options: PanelOptions;

  constructor(sessionId: string, theme: Theme, requestRender: () => void, open: (r: SubagentRecord) => void, options: PanelOptions) {
    this.sessionId = sessionId;
    this.theme = theme;
    this.requestRender = requestRender;
    this.open = open;
    this.options = options;
    this.unsubscribe = registry.subscribe(() => {
      this.sync();
      this.requestRender();
    });
    this.sync();
  }

  private rows(): SubagentRecord[] {
    return this.options.viewable ? registry.visible(this.sessionId, this.options.lingerMs) : [];
  }

  hasFocus(): boolean {
    return this.focused;
  }

  // Keep the selection valid, give focus back when nothing is left, and wake up when the next finished row expires.
  private sync(): void {
    const rows = this.rows();
    if (rows.length === 0) this.focused = false;
    this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
    clearTimeout(this.timer);
    const ends = rows.filter((r) => r.endedAt !== undefined).map((r) => r.endedAt! + this.options.lingerMs);
    if (ends.length > 0) {
      this.timer = setTimeout(() => {
        this.sync();
        this.requestRender();
      }, Math.max(0, Math.min(...ends) - Date.now()) + 5);
      this.timer.unref();
    }
  }

  // Returns true when the key was consumed.
  handleKey(data: string, editorEmpty: boolean): boolean {
    const rows = this.rows();
    if (!this.focused) {
      if (rows.length > 0 && editorEmpty && matchesKey(data, "down")) {
        this.focused = true;
        this.selected = 0;
        this.requestRender();
        return true;
      }
      return false;
    }
    if (matchesKey(data, "escape") || (matchesKey(data, "up") && this.selected === 0)) this.focused = false;
    else if (matchesKey(data, "up")) this.selected--;
    else if (matchesKey(data, "down")) this.selected = Math.min(this.selected + 1, rows.length - 1);
    else if (matchesKey(data, "enter")) this.open(rows[this.selected]!);
    else if (data === "x") registry.stop(rows[this.selected]!.id); // a row that is not running: nothing to stop
    else {
      this.focused = false; // any other key (ctrl+c, ctrl+d, text) belongs to pi: the editor has the keyboard again
      this.requestRender();
      return false;
    }
    this.requestRender();
    return true;
  }

  render(width: number): string[] {
    const t = this.theme;
    if (!this.options.viewable) {
      const n = registry.list(this.sessionId).length;
      return n === 0 ? [] : [t.fg("muted", `Subagents (${n}) cannot be viewed: the session is not saved (in-memory)`)];
    }
    const rows = this.rows();
    if (rows.length === 0) return [];
    const lines = [t.fg("muted", `Subagents (${rows.length})`)];
    rows.forEach((r, i) => {
      const status = t.fg(COLORS[r.status], `${ICONS[r.status]} ${r.status}`);
      const parts = [status, label(r), t.fg("muted", `${r.turns} turns`)];
      if (r.lastTool) parts.push(t.fg("muted", r.lastTool));
      parts.push(t.fg("muted", `$${r.usage.cost.total.toFixed(4)}`));
      const selected = this.focused && i === this.selected;
      const line = truncateToWidth(`${selected ? "▸" : " "} ${parts.join(" · ")}`, width);
      lines.push(selected ? t.bg("selectedBg", line) : line);
    });
    if (this.focused) lines.push(t.fg("dim", "↑↓ select · enter open · x stop · esc back to editor"));
    return lines;
  }

  invalidate(): void {}

  dispose(): void {
    clearTimeout(this.timer);
    this.unsubscribe();
  }
}

// Wire the panel into a session: the widget, and the key hook that feeds it. Installing again (a new session in the
// same pi process) takes the old panel down first.
const KEY = "pipipi-panel";
let installed: { panel?: Panel; removeHook: () => void } | undefined;

export function installPanel(current: () => ExtensionContext, config: Config): void {
  const ctx = current();
  if (installed) {
    installed.removeHook();
    installed.panel?.dispose();
    ctx.ui.setWidget(KEY, undefined);
  }
  const sessionId = ctx.sessionManager.getSessionId();
  const viewable = ctx.sessionManager.getSessionFile() !== undefined;
  const state: NonNullable<typeof installed> = { removeHook: () => {} };
  installed = state;
  let focusedIsEditor: () => boolean = () => true;
  ctx.ui.setWidget(
    KEY,
    (tui, theme) => {
      // Pi does not say whether the editor has the keyboard (a picker such as /subagents takes it): the editor is the
      // focused component with a getText method.
      focusedIsEditor = () => {
        const f = (tui as unknown as { focusedComponent?: { getText?: unknown } }).focusedComponent;
        return f === undefined || typeof f.getText === "function";
      };
      state.panel = new Panel(sessionId, theme, () => tui.requestRender(), (r) => void openSubagentScreen(current, r), {
        lingerMs: config.panelLingerMs,
        viewable,
      });
      return state.panel;
    },
    { placement: "belowEditor" },
  );
  state.removeHook = ctx.ui.onTerminalInput((data) => {
    if (!state.panel || !focusedIsEditor()) return undefined;
    return state.panel.handleKey(data, ctx.ui.getEditorText() === "") ? { consume: true } : undefined;
  });
}
