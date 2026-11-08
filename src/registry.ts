// The subagent registry (v2 spec, "Subagent registry"): every subagent this pi process knows, live from runs and
// rebuilt from the agent meta files on session start. The panel, the subagent screen and `/subagents` read it and
// subscribe to changes; stop, steer and set_model reach a running child through its handle.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ParentContext } from "./resolve.ts";
import { addUsage, type ChildHandle, emptyUsage, type Progress, type RunResult, type Status, type Usage } from "./runner.ts";
import { subagentSessionDir } from "./sessions.ts";

export type SubagentStatus = Status | "running" | "stopped";

export interface SubagentRecord {
  id: string; // the agentId
  parentSessionId: string;
  type: string;
  description: string;
  status: SubagentStatus;
  turns: number; // all exchanges together
  lastTool?: string;
  usage: Usage; // all exchanges together
  startedAt: number; // first start, ms since epoch
  endedAt?: number; // end of the latest exchange; unset while running
  model: string; // as resolved for the latest exchange ("" for v1 meta files)
  thinking: string;
  sessionDir?: string; // where the child session and meta file live; unset for an in-memory parent
}

export interface SubagentStart {
  id: string;
  type: string;
  description: string;
  model: string;
  thinking: string;
}

// The file keeps v1's `agentType` key so older versions still read it.
type MetaFile = { agentType: string } & Partial<Omit<SubagentRecord, "id" | "parentSessionId" | "type" | "sessionDir">>;

class Registry {
  private records = new Map<string, SubagentRecord>();
  private handles = new Map<string, ChildHandle>();
  private prior = new Map<string, { turns: number; usage: Usage }>(); // totals before the exchange in progress
  private tails = new Map<string, Promise<void>>(); // per subagent: resolves when the last queued turn has ended
  private listeners =new Set<() => void>();

  // The parent session's subagents, newest first.
  list(parentSessionId: string): SubagentRecord[] {
    return [...this.records.values()].filter((r) => r.parentSessionId === parentSessionId).sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): SubagentRecord | undefined {
    return this.records.get(id);
  }

  // The live child of a running subagent; undefined when it is not running.
  handle(id: string): ChildHandle | undefined {
    return this.handles.get(id);
  }

  // Run `fn` when every earlier turn of this subagent has ended: one process per subagent, in arrival order. A caller
  // that aborts while waiting leaves the queue without running.
  async turn<T>(id: string, signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(id) ?? Promise.resolve();
    let release!: () => void;
    const tail = prev.then(() => new Promise<void>((resolve) => (release = resolve)));
    this.tails.set(id, tail);
    void tail.then(() => this.tails.get(id) === tail && this.tails.delete(id));
    try {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new Error("aborted"));
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        void prev.then(resolve);
      });
      return await fn();
    } finally {
      // `release` is set once prev has resolved; an abort while waiting must still free the place in line
      void prev.then(() => release());
    }
  }

  // True while a turn runs or waits for this subagent.
  busy(id: string): boolean {
    return this.tails.has(id);
  }

  // Resolves when every turn queued so far has ended.
  async drained(id: string): Promise<void> {
    await this.tails.get(id);
  }

  // Called after any record changes. Returns the unsubscribe function.
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Load the parent session's meta files. Ids already known (live, or loaded before) are kept as they are.
  rebuild(parent: ParentContext): void {
    if (!parent.sessionFile) return;
    const dir = subagentSessionDir(parent);
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const id = file.slice(0, -".json".length);
      if (this.records.has(id)) continue;
      const path = join(dir, file);
      let meta: MetaFile;
      try {
        meta = JSON.parse(readFileSync(path, "utf8"));
      } catch (err) {
        throw new Error(`bad subagent meta file ${path}: ${(err as Error).message}`);
      }
      if (typeof meta.agentType !== "string") throw new Error(`bad subagent meta file ${path}: no agentType`);
      const mtime = statSync(path).mtimeMs;
      this.records.set(id, {
        id,
        parentSessionId: parent.sessionId,
        type: meta.agentType,
        description: meta.description ?? "",
        // A v1 file has no status: its run finished. A "running" status with no live child is a run that died.
        status: meta.status === undefined ? "completed" : meta.status === "running" ? "stopped" : meta.status,
        turns: meta.turns ?? 0,
        lastTool: meta.lastTool,
        usage: meta.usage ?? emptyUsage(),
        startedAt: meta.startedAt ?? mtime,
        endedAt: meta.status === undefined ? mtime : meta.endedAt,
        model: meta.model ?? "",
        thinking: meta.thinking ?? "",
        sessionDir: dir,
      });
    }
    this.emit();
  }

  // An exchange starts: a new subagent, or a resumed one (known from the meta files or from earlier runs).
  begin(parent: ParentContext, start: SubagentStart): void {
    this.rebuild(parent);
    const old = this.records.get(start.id);
    this.prior.set(start.id, { turns: old?.turns ?? 0, usage: old?.usage ?? emptyUsage() });
    const record: SubagentRecord = {
      ...old,
      ...start,
      parentSessionId: parent.sessionId,
      status: "running",
      turns: old?.turns ?? 0,
      usage: old?.usage ?? emptyUsage(),
      startedAt: old?.startedAt ?? Date.now(),
      endedAt: undefined,
      sessionDir: parent.sessionFile ? subagentSessionDir(parent) : undefined,
    };
    this.records.set(start.id, record);
    this.writeMeta(record);
    this.emit();
  }

  attach(id: string, handle: ChildHandle): void {
    this.handles.set(id, handle);
    this.emit();
  }

  progress(id: string, p: Progress): void {
    this.update(id, { turns: this.prior.get(id)!.turns + p.turns, lastTool: p.lastTool });
  }

  // The exchange ended. `run` is absent when it ended without a result (the caller aborted).
  finish(id: string, status: SubagentStatus, run?: RunResult): void {
    const prior = this.prior.get(id)!;
    const usage = structuredClone(prior.usage);
    if (run) addUsage(usage, run.usage);
    this.prior.delete(id);
    this.handles.delete(id);
    const record = this.update(id, { status, endedAt: Date.now(), ...(run ? { turns: prior.turns + run.turns, usage } : {}) });
    this.writeMeta(record);
  }

  // For tests that simulate a fresh pi process (/reload).
  clear(): void {
    this.records.clear();
    this.handles.clear();
    this.prior.clear();
    this.emit();
  }

  private update(id: string, patch: Partial<SubagentRecord>): SubagentRecord {
    const record = { ...this.records.get(id)!, ...patch };
    this.records.set(id, record);
    this.emit();
    return record;
  }

  private writeMeta(r: SubagentRecord): void {
    if (!r.sessionDir) return;
    const { id, parentSessionId: _parent, type, sessionDir, ...rest } = r;
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, `${id}.json`), JSON.stringify({ agentType: type, ...rest }));
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const registry = new Registry();
