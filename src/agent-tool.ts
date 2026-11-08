// The `Agent` tool (spec 7): discovery -> resolve -> concurrency slot -> run.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type JsonValue, StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { scripts } from "./background.ts";
import type { Config } from "./config.ts";
import { EFFORTS, inertNotice } from "./definition.ts";
import { type Discovery, discoverAgents } from "./discovery.ts";
import { type CallInput, type ChildSpec, type ParentContext, resolveChild } from "./resolve.ts";
import { exchange } from "./exchange.ts";
import { capText, storedAgentType } from "./sessions.ts";
import { emptyUsage, type Status, STATUSES, usageSchema } from "./runner.ts";

const DEFAULT_AGENT = "general-purpose";

const parameters = Type.Object({
  description: Type.String({ description: "Short (3-5 word) label for the task, shown in progress" }),
  prompt: Type.String({ description: "The full task for the agent. It sees nothing else from this session." }),
  subagent_type: Type.Optional(Type.String({ description: `Agent to run. Default "${DEFAULT_AGENT}".` })),
  model: Type.Optional(Type.String({ description: 'Model override: "opus", "sonnet", "haiku", "fable", "inherit" (the parent\'s model) or a pi model pattern. Default: the agent\'s model, else haiku.' })),
  effort: Type.Optional(StringEnum(EFFORTS, { description: "Thinking level override" })),
  resume: Type.Optional(Type.String({ description: "agentId from an earlier result, to continue that agent's session. subagent_type may be omitted." })),
  run_in_background: Type.Optional(Type.Boolean({ description: "true: return at once with status \"running\"; the agent's result arrives later as a message. false: wait for the agent and keep this script in the foreground. Omitted: wait for the agent, and the script moves to the background." })),
  isolation: Type.Optional(Type.String({ description: "Not supported; ignored" })),
  name: Type.Optional(Type.String({ description: "Not supported; ignored" })),
});
export type AgentInput = Static<typeof parameters>;

export const outputSchema = Type.Object({
  status: StringEnum([...STATUSES, "running"] as const),
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
export type AgentResult = Omit<Static<typeof outputSchema>, "status"> & { status: Status | "running" };

const BACKGROUND_RULES = [
  "Background rules. By default the first Agent call in a codemode script moves the whole script to the background: the",
  "codemode call returns to you at once, the script keeps running, and its return value arrives later as a message (do",
  "not wait or poll; end your turn or do other work). `run_in_background: false` keeps the script in the foreground:",
  "you wait and the codemode call returns the script's own result. `run_in_background: true` makes this call return",
  "at once with status \"running\" and the agentId (output is empty); the agent finishes on its own and you get its",
  "output, status and cost as a message. It does not move the script to the background.",
];

// pipipi.backgroundScripts: false: scripts always wait; only an explicit `true` detaches an agent.
const DETACHED_RULES = [
  "Scripts wait for their agents. `run_in_background: true` makes a call return at once with status \"running\" and the",
  "agentId (output is empty); the agent finishes on its own and you get its output, status and cost as a message.",
];

// Print mode (no UI): pi exits when the turn ends, so nothing runs in the background and the model is not told of it.
const PRINT_RULES = ["Every call waits for its agent and returns its result."];

export function describeAgents({ agents }: Discovery, backgroundScripts: boolean, hasUI: boolean): string {
  const list = [...agents.values()].map((a) => `- ${a.name}: ${a.description}`).join("\n");
  return [
    "Run a subagent: a separate pi session with its own system prompt, tools and model. It sees only `prompt`, so",
    "write a complete task. The result's `output` is the agent's final message; filter it before returning it.",
    "Run independent agents in parallel with Promise.all.",
    "",
    ...(!hasUI ? PRINT_RULES : backgroundScripts ? BACKGROUND_RULES : DETACHED_RULES),
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
  toolCallId: string,
  started?: (spec: ChildSpec) => void, // called synchronously, before the first await, once the spec is resolved
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
  scripts.addAgent(toolCallId, spec.agentId);
  for (const field of ["isolation", "name"] as const) {
    if (input[field] !== undefined) spec.warnings.push(`"${field}" is not supported and was ignored`);
  }
  for (const field of def.inert) spec.warnings.push(inertNotice(field));
  started?.(spec);

  let last = "";
  const { aborted: _aborted, ...run } = await exchange(parent, spec, { type: agentType, description: input.description }, signal, (p) => {
    const text = `${input.description}: turn ${p.turns}${p.lastTool ? `, ${p.lastTool}` : ""}`;
    if (text !== last) onUpdate?.(text); // a turn's end repeats the update from its last tool start
    last = text;
  });

  return { agentId: spec.agentId, agentType, model: spec.model, warnings: spec.warnings, ...run };
}

// What main gets when a `run_in_background: true` agent ends.
export function agentEndMessage(parent: ParentContext, agentId: string, agentType: string, r?: AgentResult, error?: string): string {
  const cut = capText(r?.output ?? "", parent, `${agentId}-output`);
  const err = r?.error ?? error;
  return [
    `Background agent ${agentId} ${agentType} ${r?.status ?? "stopped"} ($${(r?.usage.cost.total ?? 0).toFixed(4)}).`,
    ...(err ? [`Error: ${err}`] : []),
    `Output:\n${cut}`,
  ].join("\n");
}

export function agentTool(getConfig: () => Config, description: string, deliver: (content: string) => void) {
  return {
    name: "Agent",
    label: "Agent",
    exposure: "codemode" as const,
    description,
    parameters,
    outputSchema,
    async execute(
      toolCallId: string,
      params: AgentInput,
      signal: AbortSignal | undefined,
      onUpdate: ((r: { content: { type: "text"; text: string }[]; details: AgentResult | undefined }) => void) | undefined,
      ctx: ExtensionContext,
    ) {
      scripts.agentStarting(toolCallId, params.run_in_background); // the first plain Agent call moves its script to the background
      const parent = parentContext(ctx);
      if (params.run_in_background === true && ctx.hasUI) {
        // The agent runs on its own, not tied to this call's signal; main hears of its end by message.
        let spec: ChildSpec | undefined;
        const run = executeAgent(params, new AbortController().signal, undefined, getConfig(), parent, toolCallId, (s) => (spec = s));
        if (!spec) await run; // it failed before starting (unknown agent, bad resume...): throws here
        const { agentId, model, warnings } = spec!;
        const agentType = params.subagent_type ?? DEFAULT_AGENT;
        run.then(
          (r) => deliver(agentEndMessage(parent, agentId, r.agentType, r)),
          (e: Error) => deliver(agentEndMessage(parent, agentId, agentType, undefined, e.message)),
        );
        const result: AgentResult = { status: "running", agentId, agentType, model, output: "", usage: emptyUsage(), turns: 0, durationMs: 0, warnings };
        return {
          content: [{ type: "text" as const, text: summary(result) }],
          details: result as AgentResult | undefined,
          structuredContent: result as unknown as JsonValue,
          usage: result.usage,
          isError: false,
        };
      }
      const result = await executeAgent(
        params,
        signal,
        (text) => onUpdate?.({ content: [{ type: "text", text }], details: undefined }),
        getConfig(),
        parent,
        toolCallId,
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
