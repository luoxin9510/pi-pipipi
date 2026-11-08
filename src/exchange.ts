// One exchange with a subagent: wait for its turn in the registry queue, take a concurrency slot, run the child, record
// it in the registry, and tell main about what the user said to it. Main's `Agent` calls and the user typing on a
// subagent screen both come through here, so a subagent never has two processes.

import type { Config } from "./config.ts";
import type { ParentContext, ChildSpec } from "./resolve.ts";
import { registry } from "./registry.ts";
import { type Progress, runChild, type RunResult } from "./runner.ts";

// Process-wide: every session in this pi process shares the limit, which the first session's config fixes.
class Semaphore {
  limit: number | undefined;
  private running = 0;
  private waiting: (() => void)[] = [];

  async acquire(signal: AbortSignal | undefined): Promise<void> {
    if (this.running < this.limit!) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const go = () => {
        signal?.removeEventListener("abort", cancel);
        this.running++;
        resolve();
      };
      const cancel = () => {
        this.waiting = this.waiting.filter((w) => w !== go);
        reject(new Error("aborted"));
      };
      if (signal?.aborted) return reject(new Error("aborted"));
      signal?.addEventListener("abort", cancel, { once: true });
      this.waiting.push(go);
    });
  }

  release(): void {
    this.running--;
    const next = this.waiting.shift();
    if (next) next();
  }
}

const slots = new Semaphore();

// Only the first call in the process sets the limit; later sessions' maxConcurrent is ignored.
export function limitConcurrency(max: number): void {
  slots.limit ??= max;
}

// What the extension entry gives us: the live config, and how to hand main a note (src/index.ts).
let bound: { config: () => Config; note: (content: string) => void } | undefined;

export function bindTalk(b: { config: () => Config; note: (content: string) => void }): void {
  bound = b;
}

export const talkConfig = (): Config => bound!.config();

// The user's steer texts for the exchange now running, per subagent; the note goes out when that exchange settles.
const steers = new Map<string, string[]>();

export function recordSteer(id: string, text: string): void {
  steers.set(id, [...(steers.get(id) ?? []), text]);
}

export const REPLY_LIMIT = 2000;

export function noteText(type: string, id: string, said: string[], run: RunResult): string {
  const reply = run.status === "failed" ? `(failed: ${run.error})` : run.output;
  const cut = reply.length > REPLY_LIMIT ? `${reply.slice(0, REPLY_LIMIT)}... (cut, ${reply.length} chars)` : reply;
  return [...said.map((s) => `User said to ${type}(${id}): ${s}`), `It replied: ${cut}`].join("\n");
}

export interface ExchangeInfo {
  type: string;
  description: string;
  said?: string; // the user's message that started this exchange
}

export async function exchange(
  parent: ParentContext,
  spec: ChildSpec,
  info: ExchangeInfo,
  signal: AbortSignal | undefined,
  onProgress: (p: Progress) => void,
): Promise<RunResult> {
  const id = spec.agentId;
  return registry.turn(id, signal, async () => {
    await slots.acquire(signal);
    try {
      registry.begin(parent, { id, type: info.type, description: info.description, model: spec.model, thinking: spec.thinking });
      let run: RunResult;
      try {
        run = await runChild(
          spec,
          signal,
          (p) => {
            registry.progress(id, p);
            onProgress(p);
          },
          (handle) => registry.attach(id, handle),
        );
      } catch (err) {
        registry.finish(id, "stopped"); // the caller aborted
        steers.delete(id);
        throw err;
      }
      registry.finish(id, run.status, run);
      const said = [...(info.said === undefined ? [] : [info.said]), ...(steers.get(id) ?? [])];
      steers.delete(id);
      if (said.length > 0) bound!.note(noteText(info.type, id, said, run));
      return run;
    } finally {
      slots.release();
    }
  });
}
