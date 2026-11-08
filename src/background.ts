// Background scripts (v3a): a codemode script that starts a subagent moves to the background. pi-pipipi registers a
// `codemode` tool that wraps pi's own; the wrapper returns to main as soon as the script starts an `Agent`, lets the
// script run on, and hands main the script's return value as a message when it ends.

import { createCodemodeExtension, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registry } from "./registry.ts";

export type ScriptState = "foreground" | "background" | "completed" | "failed" | "stopped";

export interface ScriptRecord {
  id: string; // S1, S2, ...
  callId: string; // the codemode tool call id; the script's Agent calls have ids "<callId>/<n>"
  sessionId: string; // the main session the script belongs to
  state: ScriptState;
  agents: string[]; // agentIds in start order
  startedAt: number;
  endedAt?: number;
}

class ScriptRegistry {
  private scripts = new Map<string, ScriptRecord>();
  private movers = new Map<string, () => void>(); // callId -> move this foreground script to the background
  private listeners = new Set<() => void>();
  private counter = 0;

  list(sessionId: string): ScriptRecord[] {
    return [...this.scripts.values()].filter((s) => s.sessionId === sessionId);
  }

  get(id: string): ScriptRecord | undefined {
    return this.scripts.get(id);
  }

  // The script whose codemode call id prefixes this tool call id (nested ids are "<codemode id>/<n>").
  owner(toolCallId: string): ScriptRecord | undefined {
    return [...this.scripts.values()].find((s) => toolCallId.startsWith(`${s.callId}/`));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(callId: string, sessionId: string, move: () => void): ScriptRecord {
    const script: ScriptRecord = { id: `S${++this.counter}`, callId, sessionId, state: "foreground", agents: [], startedAt: Date.now() };
    this.scripts.set(script.id, script);
    this.movers.set(callId, move);
    this.changed();
    return script;
  }

  // An Agent call is about to start: the first one in a foreground script moves it to the background.
  agentStarting(toolCallId: string): void {
    const script = this.owner(toolCallId);
    if (script?.state === "foreground") this.movers.get(script.callId)!();
  }

  addAgent(toolCallId: string, agentId: string): void {
    const script = this.owner(toolCallId);
    if (!script) return;
    script.agents.push(agentId);
    this.changed();
  }

  setState(script: ScriptRecord, state: ScriptState): void {
    script.state = state;
    if (state !== "foreground" && state !== "background") {
      script.endedAt = Date.now();
      this.movers.delete(script.callId);
    }
    this.changed();
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }
}

export const scripts = new ScriptRegistry();

const BACKGROUND_TEXT = (id: string) =>
  `Script moved to the background (id ${id}): it started a subagent and keeps running. Its result arrives as a message when it ends. Do not wait or poll; end your turn or do other work.`;

const textOf = (result: { content?: { type: string; text?: string }[] } | undefined) =>
  (result?.content ?? []).map((c) => c.text ?? "").join("");

export function endMessage(script: ScriptRecord, state: ScriptState, text: string): string {
  const agents = script.agents.map((id) => {
    const r = registry.get(id);
    return r ? `- ${id} ${r.type} ${r.status} $${r.usage.cost.total.toFixed(4)}` : `- ${id}`;
  });
  return [
    `Background script ${script.id} ${state}.`,
    state === "failed" ? `Error: ${text}` : `Return value:\n${text}`,
    agents.length > 0 ? `Agents:\n${agents.join("\n")}` : "Agents: none",
  ].join("\n");
}

// Register the wrapper. `deliver` hands main a message (the extension entry decides triggerTurn or steer).
export function installBackground(pi: ExtensionAPI, deliver: (content: string) => void): void {
  let def: any;
  const capture = new Proxy(pi, { get: (t, k) => (k === "registerTool" ? (d: any) => (def = d) : (t as any)[k]) });
  createCodemodeExtension()(capture);

  pi.registerTool({
    ...def,
    async execute(id: string, params: unknown, signal: AbortSignal | undefined, onUpdate: any, ctx: ExtensionContext) {
      const own = new AbortController(); // not tied to main's turn once the script is in the background
      let moved!: () => void;
      const background = new Promise<"background">((r) => (moved = () => r("background")));
      const abort = () => own.abort();
      const script = scripts.start(id, ctx.sessionManager.getSessionId(), () => {
        scripts.setState(script, "background");
        signal?.removeEventListener("abort", abort);
        moved();
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });

      const run = def.execute(id, params, own.signal, (u: unknown) => script.state === "foreground" && onUpdate?.(u), ctx);
      const first = await Promise.race([run.then(() => "done" as const, () => "done" as const), background]);
      if (first === "done") {
        signal?.removeEventListener("abort", abort);
        try {
          const result = await run;
          scripts.setState(script, "completed");
          return result;
        } catch (err) {
          scripts.setState(script, "failed");
          throw err;
        }
      }
      run.then(
        (result: any) => {
          const state = result?.isError ? "failed" : own.signal.aborted ? "stopped" : "completed";
          scripts.setState(script, state);
          deliver(endMessage(script, state, textOf(result)));
        },
        (err: Error) => {
          const state = own.signal.aborted ? "stopped" : "failed";
          scripts.setState(script, state);
          deliver(endMessage(script, state, err.message));
        },
      );
      return { content: [{ type: "text", text: BACKGROUND_TEXT(script.id) }] };
    },
  });
}
