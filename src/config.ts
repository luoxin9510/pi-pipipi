// The `pipipi` settings block (spec 3). This is a boundary: wrong types throw, naming the key.

export interface Config {
  models: Record<string, string>;
  defaultModel?: string;
  toolMap: Record<string, string>;
  maxConcurrent: number;
  piCommand: string;
}

function stringMap(value: unknown, key: string): Record<string, string> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`pipipi.${key} must be an object of strings`);
  }
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") throw new Error(`pipipi.${key}.${k} must be a string`);
  }
  return value as Record<string, string>;
}

function optionalString(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "") throw new Error(`pipipi.${key} must be a non-empty string`);
  return value;
}

export function readConfig(raw: unknown): Config {
  if (raw === undefined) raw = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("pipipi settings must be an object");
  const r = raw as Record<string, unknown>;

  const maxConcurrent = r.maxConcurrent ?? 20;
  if (!Number.isInteger(maxConcurrent) || (maxConcurrent as number) < 1) {
    throw new Error("pipipi.maxConcurrent must be a positive integer");
  }

  return {
    models: stringMap(r.models, "models"),
    defaultModel: optionalString(r.defaultModel, "defaultModel"),
    toolMap: stringMap(r.toolMap, "toolMap"),
    maxConcurrent: maxConcurrent as number,
    piCommand: optionalString(r.piCommand, "piCommand") ?? "pi",
  };
}
