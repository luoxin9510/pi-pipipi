// `/subagents`: pick one of the session's subagents, newest first. Opening one shows the subagent screen.

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { label, modelInfo, registry, type SubagentRecord } from "./registry.ts";
import { stopEverything } from "./stop-all.ts";
import { openSubagentScreen } from "./subagent-screen.ts";

const line = (r: SubagentRecord) => `${r.status.padEnd(9)} ${label(r)} · ${modelInfo(r) ? `${modelInfo(r)} · ` : ""}${r.turns} turns · ${r.id}`;

export async function subagentsCommand(ctx: ExtensionCommandContext, args = ""): Promise<void> {
  if (args.trim() === "stop") {
    const { agents, scripts } = await stopEverything(ctx.sessionManager.getSessionId());
    return ctx.ui.notify(
      agents + scripts === 0 ? "pi-pipipi: nothing is running" : `pi-pipipi: stopped ${agents} subagent${agents === 1 ? "" : "s"} and ${scripts} script${scripts === 1 ? "" : "s"}`,
      "info",
    );
  }
  if (!ctx.sessionManager.getSessionFile()) {
    return ctx.ui.notify("pi-pipipi: subagents of an in-memory session cannot be viewed (the session is not saved)", "info");
  }
  const rows = registry.list(ctx.sessionManager.getSessionId());
  if (rows.length === 0) return ctx.ui.notify("pi-pipipi: this session has no subagents yet", "info");
  const labels = rows.map(line);
  const choice = await ctx.ui.select("Subagents", labels);
  if (choice === undefined) return;
  const picked = rows[labels.indexOf(choice)]!;
  void openSubagentScreen(() => ctx, picked); // not awaited: the command ends, the screen stays until the user leaves
}
