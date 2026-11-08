// Child session directories, the agent meta file, and agent ids (spec 5, Sessions).

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ParentContext } from "./resolve.ts";

export function subagentSessionDir(parent: ParentContext): string {
  return join(dirname(parent.sessionFile!), "subagents", parent.sessionId);
}

// Written next to the child session by the registry (src/registry.ts), so a resume knows which agent it was.
function agentMetaFile(parent: ParentContext, agentId: string): string {
  return join(subagentSessionDir(parent), `${agentId}.json`);
}

// The agentType a resumable run was started with. Throws for anything that cannot be resumed.
export function storedAgentType(parent: ParentContext, resume: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(resume)) throw new Error(`invalid resume id "${resume}"`);
  if (!parent.sessionFile) throw new Error("resume needs a persisted parent session");
  const file = agentMetaFile(parent, resume);
  if (!existsSync(file)) throw new Error(`no subagent session "${resume}" to resume`);
  return (JSON.parse(readFileSync(file, "utf8")) as { agentType: string }).agentType;
}

export function newAgentId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join("");
}
