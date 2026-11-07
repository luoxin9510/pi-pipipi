// pi-pipipi extension entry: register the `Agent` tool for codemode scripts.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { agentTool, describeAgents } from "./agent-tool.ts";
import { type Config, readConfig } from "./config.ts";
import { discoverAgents } from "./discovery.ts";

export default function pipipi(pi: ExtensionAPI) {
  // Children run with PIPIPI_DEPTH=1. Nesting is fixed at one level, so they get no Agent tool.
  if (process.env.PIPIPI_DEPTH) return;

  let config: Config | undefined;

  pi.on("session_start", async (_event, ctx) => {
    config = readConfig((pi.getSettings() as { pipipi?: unknown }).pipipi);
    const discovery = discoverAgents(ctx.cwd);
    pi.registerTool(agentTool(() => config!, describeAgents(discovery)));
    if (ctx.hasUI) {
      for (const warning of discovery.warnings) ctx.ui.notify(`pi-pipipi: ${warning}`, "warning");
    }
  });
}
