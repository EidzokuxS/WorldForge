import type { RuntimeToolName } from "./tool-schemas.js";

export interface DynamicCreationBudgetRequest {
  toolName: RuntimeToolName;
  input: Record<string, unknown>;
}

function normalizeBudgetPart(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (Array.isArray(value)) {
    return value.map(normalizeBudgetPart).filter(Boolean).sort().join(",");
  }
  return "";
}

export function dynamicCreationBudgetKey(
  request: DynamicCreationBudgetRequest | null,
): string | null {
  if (!request) return null;
  if (request.toolName === "spawn_npc") {
    const locationRef =
      normalizeBudgetPart(request.input.locationRef) ||
      normalizeBudgetPart(request.input.locationId) ||
      normalizeBudgetPart(request.input.locationName) ||
      "unspecified";
    const roleOrName =
      normalizeBudgetPart(request.input.name) ||
      normalizeBudgetPart(request.input.tags) ||
      "support-npc";
    return [
      request.toolName,
      locationRef,
      roleOrName,
      normalizeBudgetPart(request.input.tags),
      "temporary",
    ].join("|");
  }
  if (request.toolName === "create_scene_extra") {
    const locationRef =
      normalizeBudgetPart(request.input.locationRef) ||
      "current_scene";
    const roleOrName =
      normalizeBudgetPart(request.input.role) ||
      normalizeBudgetPart(request.input.name) ||
      normalizeBudgetPart(request.input.tags) ||
      "scene-extra";
    return [
      request.toolName,
      locationRef,
      roleOrName,
      normalizeBudgetPart(request.input.tags),
      "temporary",
    ].join("|");
  }
  if (request.toolName === "reveal_location") {
    const anchorRef = normalizeBudgetPart(request.input.connectedToName) || "unspecified";
    const sceneKind =
      normalizeBudgetPart(request.input.name) ||
      normalizeBudgetPart(request.input.tags) ||
      "ephemeral-scene";
    return [
      request.toolName,
      anchorRef,
      sceneKind,
      normalizeBudgetPart(request.input.tags),
      "ephemeral",
    ].join("|");
  }
  if (request.toolName === "create_minor_poi") {
    const anchorRef = normalizeBudgetPart(request.input.areaRef) || "current_location";
    const poiIdentity =
      normalizeBudgetPart(request.input.poiType) ||
      normalizeBudgetPart(request.input.name) ||
      normalizeBudgetPart(request.input.tags) ||
      "minor-poi";
    return [
      request.toolName,
      anchorRef,
      poiIdentity,
      normalizeBudgetPart(request.input.tags),
      "low-impact",
    ].join("|");
  }
  if (request.toolName === "spawn_item") {
    const ownerRef = [
      normalizeBudgetPart(request.input.ownerType) || "owner",
      normalizeBudgetPart(request.input.ownerName) || "unspecified",
    ].join(":");
    const itemIdentity =
      normalizeBudgetPart(request.input.name) ||
      normalizeBudgetPart(request.input.tags) ||
      "item";
    return [
      request.toolName,
      ownerRef,
      itemIdentity,
      normalizeBudgetPart(request.input.tags),
    ].join("|");
  }
  return null;
}

export function dynamicCreationBudgetExceededError(): string {
  return "semantic_budget_exceeded: Repeated equivalent dynamic creation is blocked for this turn; reuse the existing local affordance/support NPC instead.";
}
