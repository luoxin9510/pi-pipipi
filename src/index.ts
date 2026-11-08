// pi-pipipi extension entry: register the `Agent` tool for codemode scripts.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { agentTool, describeAgents, limitConcurrency, parentContext } from "./agent-tool.ts";
import { type Config, readConfig } from "./config.ts";
import { discoverAgents } from "./discovery.ts";
import { installPanel } from "./panel.ts";
import { registry } from "./registry.ts";
import { subagentsCommand } from "./subagents-command.ts";

export default function pipipi(pi: ExtensionAPI) {
  // Children run with PIPIPI_DEPTH=1. Nesting is fixed at one level, so they get no Agent tool.
  if (process.env.PIPIPI_DEPTH) return;

  let config: Config | undefined;

  pi.registerCommand("subagents", { description: "List this session's subagents", handler: (_args, ctx) => subagentsCommand(ctx) });

  pi.on("session_start", async (_event, ctx) => {
    try {
      config = readConfig((pi.getSettings() as { pipipi?: unknown }).pipipi);
    } catch (err) {
      if (ctx.hasUI) ctx.ui.notify(`pi-pipipi: ${(err as Error).message}`, "error");
      throw err;
    }
    limitConcurrency(config.maxConcurrent);
    registry.rebuild(parentContext(ctx));
    const discovery = discoverAgents(ctx.cwd);
    pi.registerTool(agentTool(() => config!, describeAgents(discovery)));
    if (ctx.hasUI) {
      installPanel(ctx);
      for (const warning of discovery.warnings) ctx.ui.notify(`pi-pipipi: ${warning}`, "warning");
    }
  });
}
