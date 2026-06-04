const REF_HINT_LIMIT = 24;

export interface ModelSafeRef {
  token: string;
  kind: "actor" | "location" | "item" | "faction" | "knowledge" | "event" | "tool" | "scene" | "other";
  aliases: string[];
  provenance?: string;
  sourceTool?: string;
  consumableBy?: string[];
  modelVisible: boolean;
}

export function normalizeModelRef(value: string): string {
  return value.trim().toLowerCase();
}

export function uniqueModelRefs(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeModelRef(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(trimmed);
  }
  return refs;
}

export function canonicalKnowledgeRef(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("knowledge:") ? trimmed : `knowledge:${trimmed}`;
}

export function canonicalEventRef(id: string): string {
  const trimmed = id.trim();
  return /^event[:_-]/iu.test(trimmed) ? trimmed : `event:${trimmed}`;
}

export function canonicalAuthorityRef(id: string): string {
  const trimmed = id.trim();
  return /^authority[:_-]/iu.test(trimmed) ? trimmed : `authority:${trimmed}`;
}

function refKind(ref: string): ModelSafeRef["kind"] {
  const normalized = normalizeModelRef(ref);
  if (normalized.startsWith("actor:") || normalized.startsWith("npc:") || normalized.startsWith("player:")) return "actor";
  if (normalized.startsWith("location:") || normalized === "current_location" || normalized === "current_scene") return "location";
  if (normalized.startsWith("item:")) return "item";
  if (normalized.startsWith("faction:")) return "faction";
  if (normalized.startsWith("knowledge:")) return "knowledge";
  if (normalized.startsWith("event:")) return "event";
  if (normalized.startsWith("tool-") || normalized.startsWith("tool:")) return "tool";
  if (normalized.startsWith("visible_fact:") || normalized.startsWith("current_location:") || normalized.startsWith("current_scene:")) return "scene";
  return "other";
}

export function toModelSafeRefs(input: {
  refs: readonly unknown[];
  provenance?: string;
  sourceTool?: string;
  consumableBy?: string[];
}): ModelSafeRef[] {
  return uniqueModelRefs(input.refs)
    .slice(0, REF_HINT_LIMIT)
    .map((token) => ({
      token,
      kind: refKind(token),
      aliases: [token],
      provenance: input.provenance,
      sourceTool: input.sourceTool,
      consumableBy: input.consumableBy,
      modelVisible: true,
    }));
}

export function modelSafeRefTokens(refs: readonly ModelSafeRef[]): string[] {
  return uniqueModelRefs(refs.flatMap((ref) => [ref.token, ...ref.aliases]));
}
