// Background scripts (v3a): a codemode script that starts a subagent moves to the background. pi-pipipi registers a
// `codemode` tool that wraps pi's own; the wrapper returns to main as soon as the script starts an `Agent`, lets the
// script run on, and hands main the script's return value as a message when it ends.

import { createCodemodeExtension, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registry } from "./registry.ts";
import { capText } from "./sessions.ts";

export type ScriptState = "foreground" | "background" | "completed" | "failed" | "stopped";

export interface ScriptRecord {
  id: string; // S1, S2, ...
  callId: string; // the codemode tool call id; the script's Agent calls have ids "<callId>/<n>"
  sessionId: string; // the main session the script belongs to
  state: ScriptState;
  stopRequested: boolean; // stopped through the registry (the panel x, or the session ending)
  pinned: boolean; // an Agent call said run_in_background: false: the script stays in the foreground
  agents: string[]; // agentIds in start order
  startedAt: number;
  endedAt?: number;
}

class ScriptRegistry {
  private scripts = new Map<string, ScriptRecord>();
  private movers = new Map<string, () => void>(); // callId -> move this foreground script to the background
  private stoppers = new Map<string, () => Promise<void>>(); // callId -> stop this running script
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

  start(callId: string, sessionId: string, move: () => void, stop: () => Promise<void>): ScriptRecord {
    const script: ScriptRecord = { id: `S${++this.counter}`, callId, sessionId, state: "foreground", stopRequested: false, pinned: false, agents: [], startedAt: Date.now() };
    this.scripts.set(script.id, script);
    this.movers.set(callId, move);
    this.stoppers.set(callId, stop);
    this.changed();
    return script;
  }

  // An Agent call is about to start. `false` pins its foreground script (later calls do not move it); `true` leaves the
  // script alone (only that agent runs in the background); otherwise the first call moves a foreground script.
  agentStarting(toolCallId: string, runInBackground?: boolean): void {
    const script = this.owner(toolCallId);
    if (!script) return;
    if (runInBackground === false) script.pinned = true;
    else if (runInBackground === undefined && script.state === "foreground" && !script.pinned) this.movers.get(script.callId)!();
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
      this.stoppers.delete(script.callId);
    }
    this.changed();
  }

  // Move a foreground script to the background (ctrl+b): the wrapper's race resolves and the codemode call returns.
  background(id: string): boolean {
    const script = this.scripts.get(id);
    if (!script || script.state !== "foreground") return false;
    this.movers.get(script.callId)!();
    return true;
  }

  // Move every foreground script of the session; true when there was one.
  backgroundAll(sessionId: string): boolean {
    return this.list(sessionId).filter((s) => this.background(s.id)).length > 0;
  }

  // Stop a running script (the panel's `x` calls this): its running agents stop (failed / "stopped by user"), then the
  // script is aborted and ends `stopped`; main gets the usual end message. False when the script is not running.
  async stop(id: string): Promise<boolean> {
    const script = this.scripts.get(id);
    const stopper = script && this.stoppers.get(script.callId);
    if (!stopper) return false;
    await stopper();
    return true;
  }

  // Stop every running script of the session (session end, reload).
  async stopAll(sessionId: string): Promise<void> {
    await Promise.all(this.list(sessionId).map((s) => this.stop(s.id)));
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

export function endMessage(script: ScriptRecord, state: ScriptState, text: string, parent: { sessionFile: string | undefined; sessionId: string }): string {
  text = capText(text, parent, `script-${script.id}`);
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
// With `enabled()` false (pipipi.backgroundScripts: false) the wrapper passes every call straight to pi's codemode.
export function installBackground(
  pi: ExtensionAPI,
  deliver: (content: string) => void,
  enabled: () => boolean,
  codemode: (pi: ExtensionAPI) => void = createCodemodeExtension(), // tests pass a stand-in
): void {
  let def: any;
  const capture = new Proxy(pi, { get: (t, k) => (k === "registerTool" ? (d: any) => (def = d) : (t as any)[k]) });
  codemode(capture);

  pi.registerTool({
    ...def,
    async execute(id: string, params: unknown, signal: AbortSignal | undefined, onUpdate: any, ctx: ExtensionContext) {
      if (!enabled()) return def.execute(id, params, signal, onUpdate, ctx);
      const own = new AbortController(); // not tied to main's turn once the script is in the background
      let moved!: () => void;
      const background = new Promise<"background">((r) => (moved = () => r("background")));
      const abort = () => own.abort();
      const parent = { sessionFile: ctx.sessionManager.getSessionFile(), sessionId: ctx.sessionManager.getSessionId() };
      const script = scripts.start(
        id,
        parent.sessionId,
        () => {
          scripts.setState(script, "background");
          signal?.removeEventListener("abort", abort);
          moved();
        },
        async () => {
          script.stopRequested = true;
          await registry.stopAll(script.agents); // each running agent ends failed / "stopped by user"
          own.abort(); // the script itself, and any agent still waiting for a slot
        },
      );
      const endState = (result?: { isError?: boolean }): ScriptState => (script.stopRequested || own.signal.aborted ? "stopped" : result?.isError ? "failed" : "completed");
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });

      const run = def.execute(id, params, own.signal, (u: unknown) => script.state === "foreground" && onUpdate?.(u), ctx);
      const first = await Promise.race([run.then(() => "done" as const, () => "done" as const), background]);
      if (first === "done") {
        signal?.removeEventListener("abort", abort);
        try {
          const result = await run;
          scripts.setState(script, endState());
          return result;
        } catch (err) {
          scripts.setState(script, own.signal.aborted ? "stopped" : "failed");
          throw err;
        }
      }
      run.then(
        (result: any) => {
          const state = endState(result);
          scripts.setState(script, state);
          deliver(endMessage(script, state, textOf(result), parent));
        },
        (err: Error) => {
          const state = endState({ isError: true });
          scripts.setState(script, state);
          deliver(endMessage(script, state, err.message, parent));
        },
      );
      return { content: [{ type: "text", text: BACKGROUND_TEXT(script.id) }] };
    },
  });
}
