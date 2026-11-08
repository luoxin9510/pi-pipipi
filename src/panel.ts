// The subagent panel (v2 spec, "TUI"): a widget below the editor with one row per subagent of the session, drawn from
// the registry and redrawn on its changes. ↓ on an empty editor moves focus into it; while it has focus it consumes
// its keys, otherwise none.

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { registry, type SubagentRecord } from "./registry.ts";
import { openSubagentScreen } from "./subagent-screen.ts";

// Finished rows drop out this long after they ended. PIPIPI_PANEL_LINGER_MS shortens it; it exists for the pty tests.
export const LINGER_MS = 30_000;
export const lingerMs = () => (process.env.PIPIPI_PANEL_LINGER_MS === undefined ? LINGER_MS : Number(process.env.PIPIPI_PANEL_LINGER_MS));

const ICONS: Record<string, string> = { running: "●", completed: "✓", partial: "◐", failed: "✗", stopped: "■" };
const COLORS: Record<string, "accent" | "success" | "warning" | "error"> = { running: "accent", completed: "success", partial: "warning", failed: "error", stopped: "warning" };

function describe(r: SubagentRecord): string {
  return r.description ? `${r.type}(${r.description})` : r.type;
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

  constructor(sessionId: string, theme: Theme, requestRender: () => void, open: (r: SubagentRecord) => void) {
    this.sessionId = sessionId;
    this.theme = theme;
    this.requestRender = requestRender;
    this.open = open;
    this.unsubscribe = registry.subscribe(() => {
      this.sync();
      this.requestRender();
    });
    this.sync();
  }

  // Records shown now: running ones, and finished ones until they have lingered. Oldest first, so rows do not jump.
  rows(): SubagentRecord[] {
    const now = Date.now();
    const linger = lingerMs();
    // registry.list is newest first and keeps insertion order among equal start times (calls in one tick)
    return registry
      .list(this.sessionId)
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.endedAt === undefined || now - r.endedAt < linger)
      .sort((a, b) => a.r.startedAt - b.r.startedAt || a.i - b.i)
      .map(({ r }) => r);
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
    const linger = lingerMs();
    const ends = rows.filter((r) => r.endedAt !== undefined).map((r) => r.endedAt! + linger);
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
    this.requestRender();
    return true; // while focused the panel swallows every key, so nothing reaches the editor
  }

  render(width: number): string[] {
    const rows = this.rows();
    if (rows.length === 0) return [];
    const t = this.theme;
    const lines = [t.fg("muted", `Subagents (${rows.length})`)];
    rows.forEach((r, i) => {
      const status = t.fg(COLORS[r.status] ?? "muted", `${ICONS[r.status] ?? "?"} ${r.status}`);
      const parts = [status, describe(r), t.fg("muted", `${r.turns} turns`)];
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

// Wire the panel into a session: the widget, and the key hook that feeds it.
const KEY = "pipipi-panel";
let removeHook: (() => void) | undefined;

export function installPanel(ctx: ExtensionContext): void {
  removeHook?.();
  const sessionId = ctx.sessionManager.getSessionId();
  let panel: Panel | undefined;
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
      panel = new Panel(sessionId, theme, () => tui.requestRender(), (r) => {
        if (!ctx.sessionManager.getSessionFile()) ctx.ui.notify("pi-pipipi: subagents of an in-memory session cannot be viewed (the session is not saved)", "info");
        else void openSubagentScreen(ctx, r);
      });
      return panel;
    },
    { placement: "belowEditor" },
  );
  removeHook = ctx.ui.onTerminalInput((data) => {
    if (!panel || !focusedIsEditor()) return undefined;
    return panel.handleKey(data, ctx.ui.getEditorText() === "") ? { consume: true } : undefined;
  });
}
