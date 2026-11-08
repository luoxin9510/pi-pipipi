// The `Agent` tool (spec 7): discovery -> resolve -> concurrency slot -> run.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type JsonValue, StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import type { Config } from "./config.ts";
import { EFFORTS, inertNotice } from "./definition.ts";
import { type Discovery, discoverAgents } from "./discovery.ts";
import { type CallInput, type ParentContext, resolveChild } from "./resolve.ts";
import { exchange } from "./exchange.ts";
import { storedAgentType } from "./sessions.ts";
import { type Status, STATUSES, usageSchema } from "./runner.ts";

const DEFAULT_AGENT = "general-purpose";

const parameters = Type.Object({
  description: Type.String({ description: "Short (3-5 word) label for the task, shown in progress" }),
  prompt: Type.String({ description: "The full task for the agent. It sees nothing else from this session." }),
  subagent_type: Type.Optional(Type.String({ description: `Agent to run. Default "${DEFAULT_AGENT}".` })),
  model: Type.Optional(Type.String({ description: 'Model override: "opus", "sonnet", "haiku", "fable", "inherit" (the parent\'s model) or a pi model pattern. Default: the agent\'s model, else haiku.' })),
  effort: Type.Optional(StringEnum(EFFORTS, { description: "Thinking level override" })),
  resume: Type.Optional(Type.String({ description: "agentId from an earlier result, to continue that agent's session. subagent_type may be omitted." })),
  run_in_background: Type.Optional(Type.Boolean({ description: "Not supported; ignored" })),
  isolation: Type.Optional(Type.String({ description: "Not supported; ignored" })),
  name: Type.Optional(Type.String({ description: "Not supported; ignored" })),
});
export type AgentInput = Static<typeof parameters>;

export const outputSchema = Type.Object({
  status: StringEnum(STATUSES),
  agentId: Type.String({ description: "Pass as `resume` to continue this agent" }),
  agentType: Type.String(),
  output: Type.String({ description: "Text of the agent's last message" }),
  model: Type.String(),
  usage: usageSchema,
  turns: Type.Number(),
  durationMs: Type.Number(),
  warnings: Type.Array(Type.String()),
  error: Type.Optional(Type.String()),
});
export type AgentResult = Omit<Static<typeof outputSchema>, "status"> & { status: Status };

export function describeAgents({ agents }: Discovery): string {
  const list = [...agents.values()].map((a) => `- ${a.name}: ${a.description}`).join("\n");
  return [
    "Run a subagent: a separate pi session with its own system prompt, tools and model. It sees only `prompt`, so",
    "write a complete task. The result's `output` is the agent's final message; filter it before returning it.",
    "Run independent agents in parallel with Promise.all.",
    "",
    "Available agents (subagent_type):",
    list,
  ].join("\n");
}

export function parentContext(ctx: ExtensionContext): ParentContext {
  return {
    model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
    thinking: ctx.thinkingLevel ?? "off",
    cwd: ctx.cwd,
    trusted: ctx.isProjectTrusted(),
    sessionFile: ctx.sessionManager.getSessionFile(),
    sessionId: ctx.sessionManager.getSessionId(),
  };
}

function summary(r: AgentResult): string {
  const head = `${r.agentType} ${r.status} (agentId ${r.agentId}, ${r.turns} turns, ${(r.durationMs / 1000).toFixed(1)}s)`;
  const lines = [head, ...r.warnings.map((w) => `warning: ${w}`)];
  if (r.error) lines.push(`error: ${r.error}`);
  return [...lines, "", r.output].join("\n");
}

async function executeAgent(
  input: AgentInput,
  signal: AbortSignal | undefined,
  onUpdate: ((text: string) => void) | undefined,
  config: Config,
  parent: ParentContext,
): Promise<AgentResult> {
  let agentType = input.subagent_type;
  if (input.resume !== undefined) {
    const stored = storedAgentType(parent, input.resume);
    if (agentType !== undefined && agentType !== stored) {
      throw new Error(`agent "${input.resume}" is a "${stored}" agent; resume it with that subagent_type or none`);
    }
    agentType = stored;
  }
  agentType ??= DEFAULT_AGENT;
  const { agents } = discoverAgents(parent.cwd);
  const def = agents.get(agentType);
  if (!def) throw new Error(`unknown subagent_type "${agentType}". Available: ${[...agents.keys()].join(", ")}`);

  const spec = resolveChild(def, input as CallInput, config, parent);
  for (const field of ["run_in_background", "isolation", "name"] as const) {
    if (input[field] !== undefined) spec.warnings.push(`"${field}" is not supported and was ignored`);
  }
  for (const field of def.inert) spec.warnings.push(inertNotice(field));

  let last = "";
  const run = await exchange(parent, spec, { type: agentType, description: input.description }, signal, (p) => {
    const text = `${input.description}: turn ${p.turns}${p.lastTool ? `, ${p.lastTool}` : ""}`;
    if (text !== last) onUpdate?.(text); // a turn's end repeats the update from its last tool start
    last = text;
  });

  return { agentId: spec.agentId, agentType, model: spec.model, warnings: spec.warnings, ...run };
}

export function agentTool(getConfig: () => Config, description: string) {
  return {
    name: "Agent",
    label: "Agent",
    exposure: "codemode" as const,
    description,
    parameters,
    outputSchema,
    async execute(
      _toolCallId: string,
      params: AgentInput,
      signal: AbortSignal | undefined,
      onUpdate: ((r: { content: { type: "text"; text: string }[]; details: AgentResult | undefined }) => void) | undefined,
      ctx: ExtensionContext,
    ) {
      const result = await executeAgent(
        params,
        signal,
        (text) => onUpdate?.({ content: [{ type: "text", text }], details: undefined }),
        getConfig(),
        parentContext(ctx),
      );
      return {
        content: [{ type: "text" as const, text: summary(result) }],
        details: result as AgentResult | undefined,
        structuredContent: result as unknown as JsonValue,
        usage: result.usage,
        isError: result.status === "failed",
      };
    },
  };
}
