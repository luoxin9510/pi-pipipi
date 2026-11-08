// `/subagents`: pick one of the session's subagents, newest first. Opening one shows the subagent screen.

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registry, type SubagentRecord } from "./registry.ts";
import { openSubagentScreen } from "./subagent-screen.ts";

function label(r: SubagentRecord): string {
  const what = r.description ? `${r.type}(${r.description})` : r.type;
  return `${r.status.padEnd(9)} ${what} · ${r.turns} turns · ${r.id}`;
}

export async function subagentsCommand(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.sessionManager.getSessionFile()) {
    return ctx.ui.notify("pi-pipipi: subagents of an in-memory session cannot be viewed (the session is not saved)", "info");
  }
  const rows = registry.list(ctx.sessionManager.getSessionId());
  if (rows.length === 0) return ctx.ui.notify("pi-pipipi: this session has no subagents yet", "info");
  const labels = rows.map(label);
  const choice = await ctx.ui.select("Subagents", labels);
  if (choice === undefined) return;
  const picked = rows[labels.indexOf(choice)]!;
  void openSubagentScreen(ctx, picked); // not awaited: the command ends, the screen stays until the user leaves
}
