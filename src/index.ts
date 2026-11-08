// pi-pipipi extension entry: register the `Agent` tool for codemode scripts.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { agentTool, describeAgents, parentContext } from "./agent-tool.ts";
import { type Config, readConfig } from "./config.ts";
import { discoverAgents } from "./discovery.ts";
import { bindHost, limitConcurrency } from "./exchange.ts";
import { installPanel } from "./panel.ts";
import { registry } from "./registry.ts";
import { subagentsCommand } from "./subagents-command.ts";

export default function pipipi(pi: ExtensionAPI) {
  // Children run with PIPIPI_DEPTH=1. Nesting is fixed at one level, so they get no Agent tool.
  if (process.env.PIPIPI_DEPTH) return;

  let config: Config | undefined;
  // The context of the latest event: a session start (also after /new or a resume) or an agent run. Note delivery and
  // the screens read main's state through it, never through an older context.
  let current: ExtensionContext | undefined;
  const track = (_event: unknown, ctx: ExtensionContext) => {
    current = ctx;
  };

  pi.registerCommand("subagents", { description: "List this session's subagents", handler: (_args, ctx) => subagentsCommand(ctx) });
  pi.on("agent_start", track);
  pi.on("agent_end", track);

  pi.on("session_start", async (_event, ctx) => {
    track(_event, ctx);
    try {
      config = readConfig((pi.getSettings() as { pipipi?: unknown }).pipipi);
    } catch (err) {
      if (ctx.hasUI) ctx.ui.notify(`pi-pipipi: ${(err as Error).message}`, "error");
      throw err;
    }
    limitConcurrency(config.maxConcurrent);
    bindHost({
      config: () => config!,
      // Main running: the note steers it (no new turn). Main idle: it is stored, and no turn starts.
      note: (content) => pi.sendMessage({ customType: "pi-pipipi", content, display: true }, current!.isIdle() ? undefined : { deliverAs: "steer" }),
    });
    const warnings = registry.rebuild(parentContext(ctx));
    const discovery = discoverAgents(ctx.cwd);
    pi.registerTool(agentTool(() => config!, describeAgents(discovery)));
    if (ctx.hasUI) {
      installPanel(() => current!, config);
      for (const warning of [...warnings, ...discovery.warnings]) ctx.ui.notify(`pi-pipipi: ${warning}`, "warning");
    }
  });
}
