import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  actorKnowledgeRecords,
  authorityTraces,
  items,
  locations,
  npcs,
  players,
  turnClockLedger,
  worldClocks,
} from "../../db/schema.js";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
  projectNpcRecord,
  projectPlayerRecord,
} from "../../character/record-adapters.js";
import {
  listConnectedPaths,
  loadLocationGraph,
  resolveTravelPath,
} from "../location-graph.js";
import type { GameplayToolHandlerOutcomeV2, GameplayToolHandlerRegistryV2 } from "./runtime-executor.js";
import {
  resolveGameplayRefV2,
  type GameplayRefRegistryEntryV2,
  type GameplayRefRegistryV2,
} from "./ref-registry.js";
import type { GameplayRuntimeReceiptV2, GameplayToolRequestV2, ModelFacingTurnPacketV2 } from "./contracts.js";

type ActorResolution =
  | {
    status: "resolved";
    actorKind: "player";
    actorId: string;
    label: string;
    currentLocationId: string;
  }
  | {
    status: "resolved";
    actorKind: "npc";
    actorId: string;
    label: string;
    currentLocationId: string;
  }
  | {
    status: "failed";
    reason: string;
  };

type DestinationResolution =
  | {
    status: "resolved";
    entry: GameplayRefRegistryEntryV2;
    locationId: string;
    label: string;
    travelCost: number;
    connected: boolean;
  }
  | {
    status: "failed";
    reason: string;
  };

type CurrentSceneResolution =
  | {
    status: "resolved";
    entry: GameplayRefRegistryEntryV2;
    sceneLocationId: string;
    broadLocationId: string;
    label: string;
  }
  | {
    status: "failed";
    reason: string;
  };

type EntityTagScope = Extract<GameplayToolRequestV2, { toolId: "entity.tag.v2" }>["effectBinding"]["entityScope"];
type WorldFactRequestV2 = Extract<GameplayToolRequestV2, { toolId: "world_fact.record.v2" }>;
type ItemTransferRequestV2 = Extract<GameplayToolRequestV2, { toolId: "item.transfer.v2" }>;
type LocationRevealRequestV2 = Extract<GameplayToolRequestV2, { toolId: "location.reveal.v2" }>;
type ActorConditionRequestV2 = Extract<GameplayToolRequestV2, { toolId: "actor.condition_set.v2" }>;
type ItemTransferBindingV2 = ItemTransferRequestV2["effectBinding"];
type ItemRow = typeof items.$inferSelect;
type PlayerRow = typeof players.$inferSelect;
type NpcRow = typeof npcs.$inferSelect;

type EntityTagResolution =
  | {
    status: "resolved";
    scope: EntityTagScope;
    table: "players" | "npcs" | "items" | "locations";
    entityId: string;
    label: string;
    mutationAuthority: "actor" | "item" | "location" | "local_scene";
    stateDeltaRef: string;
    sourceEntityType: string;
  }
  | {
    status: "failed";
    reason: string;
  };

type ItemTransferResolution =
  | {
    status: "resolved";
    itemEntry: GameplayRefRegistryEntryV2;
    itemId: string;
    itemLabel: string;
    playerEntry: GameplayRefRegistryEntryV2;
    playerActorId: string;
    sourceLocationId: string | null;
    targetOwnerId: string | null;
    targetLocationId: string | null;
    targetLabel: string;
    targetEntityType: "player" | "npc" | "location";
    targetEntityId: string;
    nextEquipState: "carried" | "equipped";
    nextEquippedSlot: string | null;
    stateDeltaRefs: string[];
  }
  | {
    status: "failed";
    reason: string;
  };

export interface GameplayDbHandlerTestHooksV2 {
  afterActorRowUpdateBeforeAuthorityTrace?: () => void;
  afterActorConditionRowUpdateBeforeAuthorityTrace?: () => void;
  afterItemTransferRowUpdateBeforeAuthorityTrace?: () => void;
  afterLocationRevealInsertBeforeAuthorityTrace?: () => void;
  afterMinorPoiInsertBeforeAuthorityTrace?: () => void;
  afterSupportActorInsertBeforeAuthorityTrace?: () => void;
  afterEntityTagRowUpdateBeforeAuthorityTrace?: () => void;
  afterWorldFactKnowledgeInsertBeforeAuthorityTrace?: () => void;
}

export interface CreateDbBackedGameplayToolHandlersV2Options {
  testHooks?: GameplayDbHandlerTestHooksV2;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stringifyStringArray(values: readonly string[]): string {
  return JSON.stringify([...values]);
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function canonicalTag(raw: string): string | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/gu, "-");
  if (!normalized || normalized.length > 80) return null;
  if (!/^[a-z0-9][a-z0-9_-]*$/u.test(normalized)) return null;
  return normalized;
}

function canonicalSupportTag(raw: string): string | null {
  const normalized = canonicalTag(raw);
  if (!normalized || normalized.length > 40) return null;
  return normalized;
}

const HARM_CONDITION_LABELS = new Set([
  "bleeding",
  "burned",
  "injured",
  "poisoned",
  "sick",
  "starving",
  "wounded",
]);

function normalizeActorName(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ").toLowerCase();
}

function normalizePoiLabel(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ").toLowerCase();
}

function authoritySourceKey(input: {
  turnId: string;
  requestId: string;
}): string {
  return `gameplay-v2:${input.turnId}:${input.requestId}`;
}

function clockReceiptId(input: {
  campaignId: string;
  sourceReceiptRef: string;
  turnId: string;
  resultWorldVersion: number;
  deltaMinutes: number;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update(stableJson({
      ...input,
      reasonKind: "travel",
    }))
    .digest("hex")
    .slice(0, 32);
  return `clock_${digest}`;
}

function failedOutcome(
  packet: ModelFacingTurnPacketV2,
  reason: string,
  status: "rejected" | "failed" = "rejected",
): GameplayToolHandlerOutcomeV2 {
  return {
    status,
    mutationApplied: false,
    mutationAuthority: "none",
    resultWorldVersion: packet.baseWorldVersion,
    visibleSummary: "The gameplay runtime could not accept the requested v2 tool effect.",
    evidenceRefs: [],
    durableEventIds: [],
    failureReason: reason,
  };
}

function requireRegistry(
  packet: ModelFacingTurnPacketV2,
  registry: GameplayRefRegistryV2 | undefined,
): GameplayRefRegistryV2 | null {
  if (!registry) return null;
  if (
    registry.campaignId !== packet.campaignId
    || registry.turnId !== packet.turnId
    || registry.baseWorldVersion !== packet.baseWorldVersion
  ) {
    return null;
  }
  return registry;
}

function resolveActor(input: {
  packet: ModelFacingTurnPacketV2;
  registry: GameplayRefRegistryV2;
  actorRef: string;
}): ActorResolution {
  const resolution = resolveGameplayRefV2({
    registry: input.registry,
    ref: input.actorRef,
    allowedKinds: ["player_actor", "visible_actor"],
  });
  if (resolution.status !== "resolved") {
    return { status: "failed", reason: resolution.reason };
  }

  const entry = resolution.entry;
  if (entry.kind === "player_actor") {
    const actorId = entry.ids.playerActorId;
    const currentLocationId = entry.ids.currentLocationId;
    if (!actorId || !currentLocationId) {
      return { status: "failed", reason: `Player ref "${input.actorRef}" lacks backend actor/location ids.` };
    }
    return {
      status: "resolved",
      actorKind: "player",
      actorId,
      label: entry.label,
      currentLocationId,
    };
  }

  const actorId = entry.ids.actorId;
  const currentLocationId = entry.ids.broadLocationId ?? entry.ids.currentLocationId;
  if (!actorId || !currentLocationId) {
    return { status: "failed", reason: `Actor ref "${input.actorRef}" lacks backend actor/location ids.` };
  }
  if (entry.metadata.actorType !== "npc") {
    return { status: "failed", reason: `Visible actor ref "${input.actorRef}" is not an NPC actor.` };
  }
  return {
    status: "resolved",
    actorKind: "npc",
    actorId,
    label: entry.label,
    currentLocationId,
  };
}

function resolveDestination(input: {
  registry: GameplayRefRegistryV2;
  destinationRef: string;
}): DestinationResolution {
  const resolution = resolveGameplayRefV2({
    registry: input.registry,
    ref: input.destinationRef,
    allowedKinds: ["movement_option"],
  });
  if (resolution.status !== "resolved") {
    return { status: "failed", reason: resolution.reason };
  }
  const entry = resolution.entry;
  const locationId = entry.ids.locationId;
  if (!locationId) {
    return { status: "failed", reason: `Destination ref "${input.destinationRef}" lacks backend location id.` };
  }
  return {
    status: "resolved",
    entry,
    locationId,
    label: entry.label,
    travelCost: Math.max(0, entry.metadata.travelCost ?? 0),
    connected: entry.metadata.connected === true,
  };
}

function resolveCurrentScene(input: {
  registry: GameplayRefRegistryV2;
  anchorRef: string;
}): CurrentSceneResolution {
  const resolution = resolveGameplayRefV2({
    registry: input.registry,
    ref: input.anchorRef,
    allowedKinds: ["current_scene"],
  });
  if (resolution.status !== "resolved") {
    return { status: "failed", reason: resolution.reason };
  }
  const entry = resolution.entry;
  const sceneLocationId = entry.ids.sceneScopeId ?? entry.ids.locationId;
  const broadLocationId = entry.ids.currentLocationId ?? entry.ids.broadLocationId;
  if (!sceneLocationId) {
    return { status: "failed", reason: `Current scene ref "${input.anchorRef}" lacks a scene location id.` };
  }
  if (!broadLocationId) {
    return { status: "failed", reason: `Current scene ref "${input.anchorRef}" lacks a broad location id.` };
  }
  return {
    status: "resolved",
    entry,
    sceneLocationId,
    broadLocationId,
    label: entry.label,
  };
}

function resolveEntityTagTarget(input: {
  registry: GameplayRefRegistryV2;
  scope: EntityTagScope;
  entityRef: string;
}): EntityTagResolution {
  const allowedKindsByScope: Record<EntityTagScope, GameplayRefRegistryEntryV2["kind"][]> = {
    player_actor: ["player_actor"],
    visible_actor: ["visible_actor"],
    current_location: ["current_location"],
    current_scene: ["current_scene"],
    visible_item: ["visible_target"],
    visible_location: ["visible_target"],
    inventory_item: ["inventory_item"],
  };
  const resolution = resolveGameplayRefV2({
    registry: input.registry,
    ref: input.entityRef,
    allowedKinds: allowedKindsByScope[input.scope],
  });
  if (resolution.status !== "resolved") {
    return { status: "failed", reason: resolution.reason };
  }
  const entry = resolution.entry;

  switch (input.scope) {
    case "player_actor": {
      const entityId = entry.ids.playerActorId;
      if (!entityId) return { status: "failed", reason: `Player ref "${input.entityRef}" lacks a player id.` };
      return {
        status: "resolved",
        scope: input.scope,
        table: "players",
        entityId,
        label: entry.label,
        mutationAuthority: "actor",
        stateDeltaRef: `player:${entityId}:tags`,
        sourceEntityType: "player",
      };
    }
    case "visible_actor": {
      const entityId = entry.ids.actorId;
      if (!entityId) return { status: "failed", reason: `Visible actor ref "${input.entityRef}" lacks an actor id.` };
      if (entry.metadata.actorType !== "npc") {
        return { status: "failed", reason: `Visible actor ref "${input.entityRef}" is not an NPC actor.` };
      }
      return {
        status: "resolved",
        scope: input.scope,
        table: "npcs",
        entityId,
        label: entry.label,
        mutationAuthority: "actor",
        stateDeltaRef: `npc:${entityId}:tags`,
        sourceEntityType: "npc",
      };
    }
    case "current_location": {
      const entityId = entry.ids.locationId ?? entry.ids.currentLocationId;
      if (!entityId) return { status: "failed", reason: `Current location ref "${input.entityRef}" lacks a location id.` };
      return {
        status: "resolved",
        scope: input.scope,
        table: "locations",
        entityId,
        label: entry.label,
        mutationAuthority: "location",
        stateDeltaRef: `location:${entityId}:tags`,
        sourceEntityType: "location",
      };
    }
    case "current_scene": {
      const entityId = entry.ids.sceneScopeId ?? entry.ids.locationId;
      if (!entityId) return { status: "failed", reason: `Current scene ref "${input.entityRef}" lacks a scene location id.` };
      return {
        status: "resolved",
        scope: input.scope,
        table: "locations",
        entityId,
        label: entry.label,
        mutationAuthority: "local_scene",
        stateDeltaRef: `scene:${entityId}:tags`,
        sourceEntityType: "location",
      };
    }
    case "visible_item": {
      if (entry.metadata.targetKind !== "item") {
        return { status: "failed", reason: `Visible target ref "${input.entityRef}" is not an item target.` };
      }
      const entityId = entry.ids.itemId;
      if (!entityId) return { status: "failed", reason: `Visible item ref "${input.entityRef}" lacks an item id.` };
      return {
        status: "resolved",
        scope: input.scope,
        table: "items",
        entityId,
        label: entry.label,
        mutationAuthority: "item",
        stateDeltaRef: `item:${entityId}:tags`,
        sourceEntityType: "item",
      };
    }
    case "visible_location": {
      if (entry.metadata.targetKind !== "location") {
        return { status: "failed", reason: `Visible target ref "${input.entityRef}" is not a location target.` };
      }
      const entityId = entry.ids.locationId;
      if (!entityId) return { status: "failed", reason: `Visible location ref "${input.entityRef}" lacks a location id.` };
      return {
        status: "resolved",
        scope: input.scope,
        table: "locations",
        entityId,
        label: entry.label,
        mutationAuthority: "location",
        stateDeltaRef: `location:${entityId}:tags`,
        sourceEntityType: "location",
      };
    }
    case "inventory_item": {
      const entityId = entry.ids.itemId;
      if (!entityId) return { status: "failed", reason: `Inventory item ref "${input.entityRef}" lacks an item id.` };
      return {
        status: "resolved",
        scope: input.scope,
        table: "items",
        entityId,
        label: entry.label,
        mutationAuthority: "item",
        stateDeltaRef: `item:${entityId}:tags`,
        sourceEntityType: "item",
      };
    }
    default:
      return { status: "failed", reason: `Unsupported entity tag scope "${input.scope}".` };
  }
}

function resolvePlayerEntry(input: {
  registry: GameplayRefRegistryV2;
  playerRef: string;
}): {
  status: "resolved";
  entry: GameplayRefRegistryEntryV2;
  playerActorId: string;
} | {
  status: "failed";
  reason: string;
} {
  const resolution = resolveGameplayRefV2({
    registry: input.registry,
    ref: input.playerRef,
    allowedKinds: ["player_actor"],
  });
  if (resolution.status !== "resolved") return { status: "failed", reason: resolution.reason };
  const playerActorId = resolution.entry.ids.playerActorId;
  if (!playerActorId) return { status: "failed", reason: `Player ref "${input.playerRef}" lacks a player actor id.` };
  return {
    status: "resolved",
    entry: resolution.entry,
    playerActorId,
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function uniqueConditionLabels(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeKnowledgeStatement(statement: string): string {
  return statement.trim().replace(/\s+/gu, " ").toLowerCase();
}

function knowledgeRouteFor(input: {
  sourceKind: WorldFactRequestV2["effectBinding"]["source"]["sourceKind"];
  truthStatus: WorldFactRequestV2["effectBinding"]["truthStatus"];
}): "direct_observation" | "report_message" | "claim" | "belief" | "public_record" {
  if (input.sourceKind === "accepted_dialogue_receipt") return "report_message";
  switch (input.truthStatus) {
    case "observed":
      return "direct_observation";
    case "verified":
      return "public_record";
    case "claimed":
      return "claim";
    case "reported":
      return "report_message";
    case "disputed":
    default:
      return "belief";
  }
}

function knowledgeConfidence(truthStatus: WorldFactRequestV2["effectBinding"]["truthStatus"]): number {
  switch (truthStatus) {
    case "observed":
    case "verified":
      return 80;
    case "reported":
      return 65;
    case "claimed":
      return 55;
    case "disputed":
    default:
      return 35;
  }
}

function resolveWorldFactSource(input: {
  request: WorldFactRequestV2;
  priorReceipts: readonly GameplayRuntimeReceiptV2[];
}): {
  status: "resolved";
  receipts: GameplayRuntimeReceiptV2[];
} | {
  status: "failed";
  reason: string;
} {
  const source = input.request.effectBinding.source;
  const priorById = new Map(input.priorReceipts.map((receipt) => [receipt.receiptId, receipt]));
  const receipts: GameplayRuntimeReceiptV2[] = [];
  for (const receiptId of source.sourceReceiptIds) {
    const receipt = priorById.get(receiptId);
    if (!receipt) {
      return { status: "failed", reason: `Source receipt "${receiptId}" is not an accepted prior receipt in this turn.` };
    }
    if (receipt.status !== "accepted") {
      return { status: "failed", reason: `Source receipt "${receiptId}" is not accepted.` };
    }
    if (receipt.toolId === "world_fact.record.v2") {
      return { status: "failed", reason: "world_fact.record.v2 cannot source another world_fact.record.v2 receipt in the same turn." };
    }
    receipts.push(receipt);
  }

  if (source.sourceKind === "accepted_dialogue_receipt") {
    const dialogueReceipt = receipts.find((receipt) => receipt.toolId === "dialogue.record.v2");
    if (!dialogueReceipt) {
      return { status: "failed", reason: "Dialogue-sourced player-known knowledge requires an accepted dialogue.record.v2 source receipt." };
    }
    const quote = source.sourceQuote?.trim();
    if (!quote) {
      return { status: "failed", reason: "Dialogue-sourced player-known knowledge requires sourceQuote." };
    }
    if (!dialogueReceipt.visibleSummary.toLowerCase().includes(quote.toLowerCase())) {
      return { status: "failed", reason: "sourceQuote must match the accepted dialogue receipt visibleSummary." };
    }
  }

  return { status: "resolved", receipts };
}

function resolveLocationRevealSource(input: {
  packet: ModelFacingTurnPacketV2;
  request: LocationRevealRequestV2;
  priorReceipts: readonly GameplayRuntimeReceiptV2[];
}): {
  status: "resolved";
  receipts: GameplayRuntimeReceiptV2[];
} | {
  status: "failed";
  reason: string;
} {
  const source = input.request.effectBinding.sourceAuthority;
  if (source.kind === "current_scene_visible_evidence") {
    const citableRefs = new Set(input.packet.citableRefs.map((ref) => ref.trim().toLowerCase()));
    for (const ref of source.sourceRefs) {
      if (!citableRefs.has(ref.trim().toLowerCase())) {
        return { status: "failed", reason: `Location reveal source ref "${ref}" is not citable in the current scene packet.` };
      }
    }
    return { status: "resolved", receipts: [] };
  }

  const priorById = new Map(input.priorReceipts.map((receipt) => [receipt.receiptId, receipt]));
  const receipts: GameplayRuntimeReceiptV2[] = [];
  for (const receiptId of source.sourceReceiptIds) {
    const receipt = priorById.get(receiptId);
    if (!receipt) {
      return { status: "failed", reason: `Source receipt "${receiptId}" is not an accepted prior receipt in this turn.` };
    }
    if (receipt.status !== "accepted") {
      return { status: "failed", reason: `Source receipt "${receiptId}" is not accepted.` };
    }
    if (receipt.toolId === "location.reveal.v2") {
      return { status: "failed", reason: "location.reveal.v2 cannot source another location.reveal.v2 receipt in the same turn." };
    }
    receipts.push(receipt);
  }
  return { status: "resolved", receipts };
}

function resolveActorConditionSource(input: {
  packet: ModelFacingTurnPacketV2;
  request: ActorConditionRequestV2;
  priorReceipts: readonly GameplayRuntimeReceiptV2[];
}): {
  status: "resolved";
  receipts: GameplayRuntimeReceiptV2[];
} | {
  status: "failed";
  reason: string;
} {
  const source = input.request.effectBinding.sourceAuthority;
  const operation = input.request.effectBinding.operation;
  if (source.kind === "current_scene_visible_evidence") {
    const citableRefs = new Set(input.packet.citableRefs.map((ref) => ref.trim().toLowerCase()));
    for (const ref of source.sourceRefs) {
      if (!citableRefs.has(ref.trim().toLowerCase())) {
        return { status: "failed", reason: `Actor condition source ref "${ref}" is not citable in the current scene packet.` };
      }
    }
    if (operation.kind === "adjust_player_hp") {
      return { status: "failed", reason: "Player HP adjustment requires an accepted runtime receipt source in this slice." };
    }
    if (HARM_CONDITION_LABELS.has(operation.conditionLabel)) {
      return { status: "failed", reason: `Condition "${operation.conditionLabel}" requires an accepted runtime receipt source in this slice.` };
    }
    return { status: "resolved", receipts: [] };
  }

  const priorById = new Map(input.priorReceipts.map((receipt) => [receipt.receiptId, receipt]));
  const receipts: GameplayRuntimeReceiptV2[] = [];
  for (const receiptId of source.sourceReceiptIds) {
    const receipt = priorById.get(receiptId);
    if (!receipt) {
      return { status: "failed", reason: `Source receipt "${receiptId}" is not an accepted prior receipt in this turn.` };
    }
    if (receipt.status !== "accepted") {
      return { status: "failed", reason: `Source receipt "${receiptId}" is not accepted.` };
    }
    if (receipt.toolId === "actor.condition_set.v2") {
      return { status: "failed", reason: "actor.condition_set.v2 cannot source another actor.condition_set.v2 receipt in the same turn." };
    }
    receipts.push(receipt);
  }
  return { status: "resolved", receipts };
}

function sourceReceiptSummary(receipts: readonly GameplayRuntimeReceiptV2[]): string[] {
  return receipts.map((receipt) =>
    `${receipt.receiptId}:${receipt.toolId ?? "runtime"}:${receipt.visibleSummary}`);
}

function resolveItemTransferItem(input: {
  registry: GameplayRefRegistryV2;
  binding: ItemTransferBindingV2;
}): {
  status: "resolved";
  entry: GameplayRefRegistryEntryV2;
  itemId: string;
  label: string;
} | {
  status: "failed";
  reason: string;
} {
  const allowedKinds: GameplayRefRegistryEntryV2["kind"][] = input.binding.itemScope === "player_inventory_item"
    ? ["inventory_item"]
    : ["visible_target"];
  const resolution = resolveGameplayRefV2({
    registry: input.registry,
    ref: input.binding.itemRef,
    allowedKinds,
  });
  if (resolution.status !== "resolved") return { status: "failed", reason: resolution.reason };
  if (input.binding.itemScope === "visible_scene_item" && resolution.entry.metadata.targetKind !== "item") {
    return { status: "failed", reason: `Visible item ref "${input.binding.itemRef}" is not an item target.` };
  }
  const itemId = resolution.entry.ids.itemId;
  if (!itemId) return { status: "failed", reason: `Item ref "${input.binding.itemRef}" lacks an item id.` };
  return {
    status: "resolved",
    entry: resolution.entry,
    itemId,
    label: resolution.entry.label,
  };
}

function resolveItemTransferLocation(input: {
  registry: GameplayRefRegistryV2;
  ref: string;
  scope: "current_scene" | "visible_location";
}): {
  status: "resolved";
  entry: GameplayRefRegistryEntryV2;
  locationId: string;
  label: string;
} | {
  status: "failed";
  reason: string;
} {
  if (input.scope === "current_scene") {
    const scene = resolveCurrentScene({
      registry: input.registry,
      anchorRef: input.ref,
    });
    if (scene.status !== "resolved") return { status: "failed", reason: scene.reason };
    return {
      status: "resolved",
      entry: scene.entry,
      locationId: scene.sceneLocationId,
      label: scene.label,
    };
  }

  const resolution = resolveGameplayRefV2({
    registry: input.registry,
    ref: input.ref,
    allowedKinds: ["visible_target"],
  });
  if (resolution.status !== "resolved") return { status: "failed", reason: resolution.reason };
  if (resolution.entry.metadata.targetKind !== "location") {
    return { status: "failed", reason: `Visible target ref "${input.ref}" is not a location target.` };
  }
  const locationId = resolution.entry.ids.locationId;
  if (!locationId) return { status: "failed", reason: `Visible location ref "${input.ref}" lacks a location id.` };
  return {
    status: "resolved",
    entry: resolution.entry,
    locationId,
    label: resolution.entry.label,
  };
}

function locationIsCurrentSceneLocal(input: {
  locationId: string;
  packet: ModelFacingTurnPacketV2;
  registry: GameplayRefRegistryV2;
}): boolean {
  const sceneEntry = input.registry.entries.find((entry) => entry.kind === "current_scene");
  const sceneLocationId = sceneEntry?.ids.sceneScopeId ?? sceneEntry?.ids.locationId ?? null;
  const broadLocationId = sceneEntry?.ids.currentLocationId ?? sceneEntry?.ids.broadLocationId ?? null;
  if (input.locationId === sceneLocationId) return true;
  const row = getDb().select().from(locations).where(and(
    eq(locations.id, input.locationId),
    eq(locations.campaignId, input.packet.campaignId),
  )).get();
  if (!row) return false;
  return row.parentLocationId === sceneLocationId || row.anchorLocationId === broadLocationId;
}

function readItemRow(input: {
  packet: ModelFacingTurnPacketV2;
  itemId: string;
}): ItemRow | null {
  return getDb().select().from(items).where(and(
    eq(items.id, input.itemId),
    eq(items.campaignId, input.packet.campaignId),
  )).get() ?? null;
}

function validateItemTransferSource(input: {
  binding: ItemTransferBindingV2;
  item: ItemRow;
  playerActorId: string;
  sourceLocationId: string | null;
}): string | null {
  switch (input.binding.sourceScope) {
    case "player_inventory":
      if (input.item.ownerId !== input.playerActorId || input.item.locationId !== null) {
        return `${input.binding.itemRef} is not currently in player inventory.`;
      }
      return null;
    case "current_scene":
    case "visible_location":
      if (input.item.ownerId !== null) {
        return `${input.binding.itemRef} is actor-owned, not located in the scene.`;
      }
      if (!input.sourceLocationId || input.item.locationId !== input.sourceLocationId) {
        return `${input.binding.itemRef} is not located at the requested source.`;
      }
      return null;
    default:
      return "Unsupported item transfer source scope.";
  }
}

function resolveItemTransfer(input: {
  packet: ModelFacingTurnPacketV2;
  registry: GameplayRefRegistryV2;
  request: ItemTransferRequestV2;
}): ItemTransferResolution {
  const binding = input.request.effectBinding;
  const item = resolveItemTransferItem({
    registry: input.registry,
    binding,
  });
  if (item.status !== "resolved") return { status: "failed", reason: item.reason };

  const player = resolvePlayerEntry({
    registry: input.registry,
    playerRef: binding.action === "take_to_player_inventory" ? binding.targetRef : binding.sourceRef,
  });
  if (player.status !== "resolved") return { status: "failed", reason: player.reason };

  const sourceLocation = binding.sourceScope === "current_scene" || binding.sourceScope === "visible_location"
    ? resolveItemTransferLocation({
      registry: input.registry,
      ref: binding.sourceRef,
      scope: binding.sourceScope,
    })
    : null;
  if (sourceLocation?.status === "failed") return { status: "failed", reason: sourceLocation.reason };
  if (sourceLocation?.status === "resolved" && sourceLocation.entry.kind === "movement_option") {
    return { status: "failed", reason: "Item transfer source cannot be a movement destination." };
  }
  if (
    binding.sourceScope === "visible_location"
    && sourceLocation?.status === "resolved"
    && !locationIsCurrentSceneLocal({
      locationId: sourceLocation.locationId,
      packet: input.packet,
      registry: input.registry,
    })
  ) {
    return { status: "failed", reason: `Visible location ref "${binding.sourceRef}" is not a current-scene local item source.` };
  }

  let targetOwnerId: string | null = null;
  let targetLocationId: string | null = null;
  let targetLabel = player.entry.label;
  let targetEntityType: "player" | "npc" | "location" = "player";
  let targetEntityId = player.playerActorId;
  let nextEquipState: "carried" | "equipped" = "carried";
  let nextEquippedSlot: string | null = null;

  switch (binding.action) {
    case "give_to_visible_actor": {
      const actorResolution = resolveGameplayRefV2({
        registry: input.registry,
        ref: binding.targetRef,
        allowedKinds: ["visible_actor"],
      });
      if (actorResolution.status !== "resolved") return { status: "failed", reason: actorResolution.reason };
      const actorId = actorResolution.entry.ids.actorId;
      if (!actorId) return { status: "failed", reason: `Visible actor ref "${binding.targetRef}" lacks an actor id.` };
      if (actorResolution.entry.metadata.actorType !== "npc") {
        return { status: "failed", reason: `Visible actor ref "${binding.targetRef}" is not an NPC actor.` };
      }
      if (actorResolution.entry.ids.sceneScopeId !== player.entry.ids.sceneScopeId) {
        return { status: "failed", reason: `Visible actor ref "${binding.targetRef}" is not in the current scene.` };
      }
      targetOwnerId = actorId;
      targetLabel = actorResolution.entry.label;
      targetEntityType = "npc";
      targetEntityId = actorId;
      break;
    }
    case "drop_to_current_scene": {
      const target = resolveItemTransferLocation({
        registry: input.registry,
        ref: binding.targetRef,
        scope: "current_scene",
      });
      if (target.status !== "resolved") return { status: "failed", reason: target.reason };
      targetLocationId = target.locationId;
      targetLabel = target.label;
      targetEntityType = "location";
      targetEntityId = target.locationId;
      break;
    }
    case "place_at_visible_location": {
      const target = resolveItemTransferLocation({
        registry: input.registry,
        ref: binding.targetRef,
        scope: "visible_location",
      });
      if (target.status !== "resolved") return { status: "failed", reason: target.reason };
      if (!locationIsCurrentSceneLocal({
        locationId: target.locationId,
        packet: input.packet,
        registry: input.registry,
      })) {
        return { status: "failed", reason: `Visible location ref "${binding.targetRef}" is not a current-scene local placement target.` };
      }
      targetLocationId = target.locationId;
      targetLabel = target.label;
      targetEntityType = "location";
      targetEntityId = target.locationId;
      break;
    }
    case "take_to_player_inventory":
      targetOwnerId = player.playerActorId;
      targetEntityType = "player";
      targetEntityId = player.playerActorId;
      if (binding.equip.mode === "equipped") {
        nextEquipState = "equipped";
        nextEquippedSlot = binding.equip.slot;
      }
      break;
    case "equip_player_item":
      targetOwnerId = player.playerActorId;
      nextEquipState = "equipped";
      nextEquippedSlot = binding.equip.mode === "equipped" ? binding.equip.slot : null;
      break;
    case "unequip_player_item":
      targetOwnerId = player.playerActorId;
      break;
  }

  const stateDeltaRefs = [`item:${item.itemId}:custody`];
  if (binding.action === "equip_player_item" || binding.action === "unequip_player_item" || binding.equip.mode === "equipped") {
    stateDeltaRefs.push(`item:${item.itemId}:equip_state`);
  }

  return {
    status: "resolved",
    itemEntry: item.entry,
    itemId: item.itemId,
    itemLabel: item.label,
    playerEntry: player.entry,
    playerActorId: player.playerActorId,
    sourceLocationId: sourceLocation?.status === "resolved" ? sourceLocation.locationId : null,
    targetOwnerId,
    targetLocationId,
    targetLabel,
    targetEntityType,
    targetEntityId,
    nextEquipState,
    nextEquippedSlot,
    stateDeltaRefs,
  };
}

function locationNameById(campaignId: string): Map<string, string> {
  return new Map(
    getDb()
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all()
      .map((location) => [location.id, location.name]),
  );
}

function pathNames(campaignId: string, locationIds: readonly string[]): string[] {
  const names = locationNameById(campaignId);
  return locationIds
    .map((locationId) => names.get(locationId))
    .filter((name): name is string => Boolean(name));
}

function ensureClockAtBase(input: {
  campaignId: string;
  baseWorldVersion: number;
  currentTick: number;
}): typeof worldClocks.$inferSelect {
  const db = getDb();
  const existing = db
    .select()
    .from(worldClocks)
    .where(eq(worldClocks.campaignId, input.campaignId))
    .get();
  if (existing) return existing;
  if (input.baseWorldVersion !== 0) {
    throw new Error(`World clock is missing for campaign ${input.campaignId}.`);
  }
  const row = {
    campaignId: input.campaignId,
    worldVersion: 0,
    worldTimeMinutes: 0,
    currentTick: input.currentTick,
    updatedAt: Date.now(),
  } satisfies typeof worldClocks.$inferInsert;
  db.insert(worldClocks).values(row).run();
  return row;
}

function commitActorMoveV2(input: {
  packet: ModelFacingTurnPacketV2;
  request: Extract<GameplayToolRequestV2, { toolId: "actor.move.v2" }>;
  actor: Extract<ActorResolution, { status: "resolved" }>;
  destination: Extract<DestinationResolution, { status: "resolved" }>;
  path: {
    locationIds: string[];
    edgeIds: string[];
    totalTravelCost: number;
  };
  destinationName: string;
  testHooks?: GameplayDbHandlerTestHooksV2;
}): {
  resultWorldVersion: number;
  resultWorldTimeMinutes: number;
  elapsedWorldTimeMinutes: number;
  authorityTraceId: string;
} {
  const db = getDb();
  const timestamp = Date.now();
  const sourceKey = authoritySourceKey({
    turnId: input.packet.turnId,
    requestId: input.request.requestId,
  });
  const sourceReceiptRef = `authority:${sourceKey}`;
  const stateDeltaRefs = [
    `actor:${input.actor.actorId}:location`,
    `location:${input.destination.locationId}`,
  ];

  return db.transaction(() => {
    const clock = ensureClockAtBase({
      campaignId: input.packet.campaignId,
      baseWorldVersion: input.packet.baseWorldVersion,
      currentTick: input.packet.baseTick,
    });
    if (clock.worldVersion !== input.packet.baseWorldVersion) {
      throw new Error(
        `Stale world version for ${input.packet.campaignId}: expected ${clock.worldVersion}, got ${input.packet.baseWorldVersion}.`,
      );
    }

    if (input.actor.actorKind === "player") {
      const player = db
        .select()
        .from(players)
        .where(and(
          eq(players.id, input.actor.actorId),
          eq(players.campaignId, input.packet.campaignId),
        ))
        .get();
      if (!player) throw new Error(`Player actor not found: ${input.actor.actorId}.`);
      if (player.currentLocationId !== input.actor.currentLocationId) {
        throw new Error("Player location changed after the model-facing packet was built.");
      }
      const record = hydrateStoredPlayerRecord(player, {
        currentLocationName: input.destinationName,
      });
      const projection = projectPlayerRecord({
        ...record,
        socialContext: {
          ...record.socialContext,
          currentLocationId: input.destination.locationId,
          currentLocationName: input.destinationName,
        },
      });
      const update = db.update(players)
        .set({
          ...projection,
          currentSceneLocationId: input.destination.locationId,
        })
        .where(and(
          eq(players.id, input.actor.actorId),
          eq(players.campaignId, input.packet.campaignId),
          eq(players.currentLocationId, input.actor.currentLocationId),
        ))
        .run();
      if (update.changes !== 1) {
        throw new Error("Player movement update did not affect exactly one row.");
      }
    } else {
      const npc = db
        .select()
        .from(npcs)
        .where(and(
          eq(npcs.id, input.actor.actorId),
          eq(npcs.campaignId, input.packet.campaignId),
        ))
        .get();
      if (!npc) throw new Error(`NPC actor not found: ${input.actor.actorId}.`);
      if (npc.currentLocationId !== input.actor.currentLocationId) {
        throw new Error("NPC location changed after the model-facing packet was built.");
      }
      const record = hydrateStoredNpcRecord(npc, {
        currentLocationName: input.destinationName,
      });
      const projection = projectNpcRecord({
        ...record,
        socialContext: {
          ...record.socialContext,
          currentLocationId: input.destination.locationId,
          currentLocationName: input.destinationName,
        },
      });
      const update = db.update(npcs)
        .set({
          ...projection,
          currentSceneLocationId: input.destination.locationId,
        })
        .where(and(
          eq(npcs.id, input.actor.actorId),
          eq(npcs.campaignId, input.packet.campaignId),
          eq(npcs.currentLocationId, input.actor.currentLocationId),
        ))
        .run();
      if (update.changes !== 1) {
        throw new Error("NPC movement update did not affect exactly one row.");
      }
    }

    input.testHooks?.afterActorRowUpdateBeforeAuthorityTrace?.();

    const elapsedWorldTimeMinutes = Math.max(0, input.path.totalTravelCost);
    const resultWorldVersion = clock.worldVersion + 1;
    const resultWorldTimeMinutes = clock.worldTimeMinutes + elapsedWorldTimeMinutes;
    const resultTick = Math.max(
      clock.currentTick,
      input.packet.baseTick,
      resultWorldTimeMinutes,
    );
    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: resultWorldTimeMinutes,
        currentTick: resultTick,
        updatedAt: timestamp,
      })
      .where(and(
        eq(worldClocks.campaignId, input.packet.campaignId),
        eq(worldClocks.worldVersion, clock.worldVersion),
      ))
      .run();
    if (clockUpdate.changes !== 1) {
      throw new Error("World clock changed before actor.move.v2 could commit.");
    }

    const authorityTraceId = crypto.randomUUID();
    db.insert(authorityTraces)
      .values({
        id: authorityTraceId,
        campaignId: input.packet.campaignId,
        operation: "gameplay-cycle-v2.actor.move.v2",
        sourceEntityType: input.actor.actorKind,
        sourceEntityId: input.actor.actorId,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: resultWorldTimeMinutes,
        elapsedWorldTimeMinutes,
        toolResultId: sourceKey,
        eventIds: "[]",
        stateDeltaRefs: stringifyStringArray(stateDeltaRefs),
        witnesses: stringifyStringArray(input.request.effectBinding.evidenceRefs),
        metadata: stringifyJson({
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          toolId: input.request.toolId,
          travelMode: input.request.effectBinding.travelMode,
          destinationRef: input.request.effectBinding.destinationRef,
          destinationLocationId: input.destination.locationId,
          edgeIds: input.path.edgeIds,
        }),
        createdAt: timestamp,
      })
      .run();

    db.insert(turnClockLedger)
      .values({
        clockReceiptId: clockReceiptId({
          campaignId: input.packet.campaignId,
          sourceReceiptRef,
          turnId: input.packet.turnId,
          resultWorldVersion,
          deltaMinutes: elapsedWorldTimeMinutes,
        }),
        campaignId: input.packet.campaignId,
        turnId: input.packet.turnId,
        uiTurnOrdinal: input.packet.baseTick,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        deltaMinutes: elapsedWorldTimeMinutes,
        reasonKind: "travel",
        sourceReceiptRef,
        resultWorldTimeMinutes,
        createdAt: timestamp,
      })
      .run();

    return {
      resultWorldVersion,
      resultWorldTimeMinutes,
      elapsedWorldTimeMinutes,
      authorityTraceId,
    };
  });
}

function applyConditionToPlayerRecord(input: {
  player: PlayerRow;
  operation: ActorConditionRequestV2["effectBinding"]["operation"];
  locationName: string | null;
}): {
  projection: ReturnType<typeof projectPlayerRecord>;
  previousHp: number;
  nextHp: number;
  previousConditions: string[];
  nextConditions: string[];
  summary: string;
  stateDeltaRefs: string[];
} {
  const record = hydrateStoredPlayerRecord(input.player, {
    currentLocationName: input.locationName ?? undefined,
  });
  const previousHp = input.player.hp;
  const previousConditions = uniqueConditionLabels(record.state.conditions);
  let nextHp = previousHp;
  let nextConditions = previousConditions;
  let summary: string;
  let stateDeltaRefs: string[];

  switch (input.operation.kind) {
    case "set_condition": {
      if (previousConditions.includes(input.operation.conditionLabel)) {
        throw new Error(`Player already has condition "${input.operation.conditionLabel}".`);
      }
      nextConditions = uniqueConditionLabels([...previousConditions, input.operation.conditionLabel]);
      summary = `Player gains condition ${input.operation.conditionLabel}.`;
      stateDeltaRefs = [`player:${input.player.id}:condition:${input.operation.conditionLabel}`];
      break;
    }
    case "clear_condition": {
      const conditionLabel = input.operation.conditionLabel;
      if (!previousConditions.includes(conditionLabel)) {
        throw new Error(`Player does not have condition "${conditionLabel}".`);
      }
      nextConditions = previousConditions.filter((condition) => condition !== conditionLabel);
      summary = `Player clears condition ${conditionLabel}.`;
      stateDeltaRefs = [`player:${input.player.id}:condition:${conditionLabel}`];
      break;
    }
    case "adjust_player_hp": {
      nextHp = previousHp + input.operation.hpDelta;
      if (nextHp < 0 || nextHp > 5) {
        throw new Error(`Player HP change would leave backend bounds 0..5: ${previousHp} -> ${nextHp}.`);
      }
      summary = `Player HP changes from ${previousHp} to ${nextHp}.`;
      stateDeltaRefs = [`player:${input.player.id}:hp`];
      break;
    }
  }

  const projection = projectPlayerRecord({
    ...record,
    state: {
      ...record.state,
      hp: nextHp,
      conditions: nextConditions,
    },
  });
  return {
    projection,
    previousHp,
    nextHp,
    previousConditions,
    nextConditions,
    summary,
    stateDeltaRefs,
  };
}

function applyConditionToNpcRecord(input: {
  npc: NpcRow;
  operation: ActorConditionRequestV2["effectBinding"]["operation"];
  locationName: string | null;
}): {
  projection: ReturnType<typeof projectNpcRecord>;
  previousConditions: string[];
  nextConditions: string[];
  summary: string;
  stateDeltaRefs: string[];
} {
  if (input.operation.kind === "adjust_player_hp") {
    throw new Error("actor.condition_set.v2 does not support NPC HP.");
  }
  const record = hydrateStoredNpcRecord(input.npc, {
    currentLocationName: input.locationName ?? undefined,
  });
  const previousConditions = uniqueConditionLabels(record.state.conditions);
  let nextConditions = previousConditions;
  if (input.operation.kind === "set_condition") {
    if (previousConditions.includes(input.operation.conditionLabel)) {
      throw new Error(`${input.npc.name} already has condition "${input.operation.conditionLabel}".`);
    }
    nextConditions = uniqueConditionLabels([...previousConditions, input.operation.conditionLabel]);
  } else {
    const conditionLabel = input.operation.conditionLabel;
    if (!previousConditions.includes(conditionLabel)) {
      throw new Error(`${input.npc.name} does not have condition "${conditionLabel}".`);
    }
    nextConditions = previousConditions.filter((condition) => condition !== conditionLabel);
  }
  const projection = projectNpcRecord({
    ...record,
    state: {
      ...record.state,
      conditions: nextConditions,
    },
  });
  return {
    projection,
    previousConditions,
    nextConditions,
    summary: input.operation.kind === "set_condition"
      ? `${input.npc.name} gains condition ${input.operation.conditionLabel}.`
      : `${input.npc.name} clears condition ${input.operation.conditionLabel}.`,
    stateDeltaRefs: [`npc:${input.npc.id}:condition:${input.operation.conditionLabel}`],
  };
}

function commitActorConditionSetV2(input: {
  packet: ModelFacingTurnPacketV2;
  request: ActorConditionRequestV2;
  actor: Extract<ActorResolution, { status: "resolved" }>;
  sourceReceipts: readonly GameplayRuntimeReceiptV2[];
  testHooks?: GameplayDbHandlerTestHooksV2;
}): {
  resultWorldVersion: number;
  resultWorldTimeMinutes: number;
  authorityTraceId: string;
  visibleSummary: string;
  stateDeltaRefs: string[];
} {
  const db = getDb();
  const timestamp = Date.now();
  const sourceKey = authoritySourceKey({
    turnId: input.packet.turnId,
    requestId: input.request.requestId,
  });
  const sourceAuthority = input.request.effectBinding.sourceAuthority;
  const operation = input.request.effectBinding.operation;
  const locationNames = locationNameById(input.packet.campaignId);

  return db.transaction(() => {
    const clock = ensureClockAtBase({
      campaignId: input.packet.campaignId,
      baseWorldVersion: input.packet.baseWorldVersion,
      currentTick: input.packet.baseTick,
    });
    if (clock.worldVersion !== input.packet.baseWorldVersion) {
      throw new Error(
        `Stale world version for ${input.packet.campaignId}: expected ${clock.worldVersion}, got ${input.packet.baseWorldVersion}.`,
      );
    }

    let visibleSummary: string;
    let stateDeltaRefs: string[];
    let previousHp: number | null = null;
    let nextHp: number | null = null;
    let previousConditions: string[] = [];
    let nextConditions: string[] = [];

    if (input.actor.actorKind === "player") {
      const player = db
        .select()
        .from(players)
        .where(and(
          eq(players.id, input.actor.actorId),
          eq(players.campaignId, input.packet.campaignId),
        ))
        .get();
      if (!player) throw new Error(`Player actor not found: ${input.actor.actorId}.`);
      const applied = applyConditionToPlayerRecord({
        player,
        operation,
        locationName: locationNames.get(player.currentLocationId ?? "") ?? null,
      });
      const update = db.update(players)
        .set(applied.projection)
        .where(and(
          eq(players.id, input.actor.actorId),
          eq(players.campaignId, input.packet.campaignId),
          eq(players.hp, player.hp),
        ))
        .run();
      if (update.changes !== 1) {
        throw new Error("Player condition update did not affect exactly one row.");
      }
      visibleSummary = applied.summary;
      stateDeltaRefs = applied.stateDeltaRefs;
      previousHp = applied.previousHp;
      nextHp = applied.nextHp;
      previousConditions = applied.previousConditions;
      nextConditions = applied.nextConditions;
    } else {
      if (operation.kind === "adjust_player_hp") {
        throw new Error("actor.condition_set.v2 does not support NPC HP.");
      }
      const npc = db
        .select()
        .from(npcs)
        .where(and(
          eq(npcs.id, input.actor.actorId),
          eq(npcs.campaignId, input.packet.campaignId),
        ))
        .get();
      if (!npc) throw new Error(`NPC actor not found: ${input.actor.actorId}.`);
      const applied = applyConditionToNpcRecord({
        npc,
        operation,
        locationName: locationNames.get(npc.currentLocationId ?? "") ?? null,
      });
      const update = db.update(npcs)
        .set(applied.projection)
        .where(and(
          eq(npcs.id, input.actor.actorId),
          eq(npcs.campaignId, input.packet.campaignId),
        ))
        .run();
      if (update.changes !== 1) {
        throw new Error("NPC condition update did not affect exactly one row.");
      }
      visibleSummary = applied.summary;
      stateDeltaRefs = applied.stateDeltaRefs;
      previousConditions = applied.previousConditions;
      nextConditions = applied.nextConditions;
    }

    input.testHooks?.afterActorConditionRowUpdateBeforeAuthorityTrace?.();

    const resultWorldVersion = clock.worldVersion + 1;
    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        currentTick: Math.max(clock.currentTick, input.packet.baseTick),
        updatedAt: timestamp,
      })
      .where(and(
        eq(worldClocks.campaignId, input.packet.campaignId),
        eq(worldClocks.worldVersion, clock.worldVersion),
      ))
      .run();
    if (clockUpdate.changes !== 1) {
      throw new Error("World clock changed before actor.condition_set.v2 could commit.");
    }

    const authorityTraceId = crypto.randomUUID();
    db.insert(authorityTraces)
      .values({
        id: authorityTraceId,
        campaignId: input.packet.campaignId,
        operation: "gameplay-cycle-v2.actor.condition_set.v2",
        sourceEntityType: input.actor.actorKind,
        sourceEntityId: input.actor.actorId,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        elapsedWorldTimeMinutes: 0,
        toolResultId: sourceKey,
        eventIds: "[]",
        stateDeltaRefs: stringifyStringArray(stateDeltaRefs),
        witnesses: stringifyStringArray(input.request.effectBinding.evidenceRefs),
        metadata: stringifyJson({
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          toolId: input.request.toolId,
          actorRef: input.request.effectBinding.actorRef,
          actorScope: input.request.effectBinding.actorScope,
          actorKind: input.actor.actorKind,
          actorId: input.actor.actorId,
          operation,
          sourceAuthority,
          sourceReceiptSummaries: sourceReceiptSummary(input.sourceReceipts),
          previousHp,
          nextHp,
          previousConditions,
          nextConditions,
        }),
        createdAt: timestamp,
      })
      .run();

    return {
      resultWorldVersion,
      resultWorldTimeMinutes: clock.worldTimeMinutes,
      authorityTraceId,
      visibleSummary,
      stateDeltaRefs,
    };
  });
}

function commitSupportActorCreateV2(input: {
  packet: ModelFacingTurnPacketV2;
  request: Extract<GameplayToolRequestV2, { toolId: "support_actor.create.v2" }>;
  anchor: Extract<CurrentSceneResolution, { status: "resolved" }>;
  displayName: string;
  tags: string[];
  testHooks?: GameplayDbHandlerTestHooksV2;
}): {
  actorId: string;
  resultWorldVersion: number;
  resultWorldTimeMinutes: number;
  authorityTraceId: string;
} {
  const db = getDb();
  const timestamp = Date.now();
  const actorId = crypto.randomUUID();
  const sourceKey = authoritySourceKey({
    turnId: input.packet.turnId,
    requestId: input.request.requestId,
  });
  const locationNames = locationNameById(input.packet.campaignId);
  const broadLocationName = locationNames.get(input.anchor.broadLocationId) ?? input.anchor.label;
  const canonicalTags = [
    "temporary-support",
    input.request.effectBinding.roleKind,
    ...input.tags,
  ];

  return db.transaction(() => {
    const clock = ensureClockAtBase({
      campaignId: input.packet.campaignId,
      baseWorldVersion: input.packet.baseWorldVersion,
      currentTick: input.packet.baseTick,
    });
    if (clock.worldVersion !== input.packet.baseWorldVersion) {
      throw new Error(
        `Stale world version for ${input.packet.campaignId}: expected ${clock.worldVersion}, got ${input.packet.baseWorldVersion}.`,
      );
    }

    const existing = db
      .select({
        id: npcs.id,
        name: npcs.name,
        tier: npcs.tier,
        currentSceneLocationId: npcs.currentSceneLocationId,
      })
      .from(npcs)
      .where(and(
        eq(npcs.campaignId, input.packet.campaignId),
        eq(npcs.currentSceneLocationId, input.anchor.sceneLocationId),
        eq(npcs.tier, "temporary"),
      ))
      .all()
      .find((row) => normalizeActorName(row.name) === normalizeActorName(input.displayName));
    if (existing) {
      throw new Error(`A matching temporary support actor "${existing.name}" is already present in the current scene.`);
    }

    const seedRow = {
      id: actorId,
      campaignId: input.packet.campaignId,
      name: input.displayName,
      persona: input.request.effectBinding.persona.publicSummary,
      characterRecord: "{}",
      derivedTags: "[]",
      tags: stringifyStringArray([...new Set(canonicalTags)]),
      tier: "temporary" as const,
      currentLocationId: input.anchor.broadLocationId,
      currentSceneLocationId: input.anchor.sceneLocationId,
      goals: '{"short_term":[],"long_term":[]}',
      beliefs: "[]",
      unprocessedImportance: 0,
      inactiveTicks: 0,
      createdAt: timestamp,
    } satisfies typeof npcs.$inferInsert;
    const record = hydrateStoredNpcRecord(seedRow, {
      currentLocationName: broadLocationName,
      sourceKind: "generator",
      originMode: "native",
    });
    const projection = projectNpcRecord({
      ...record,
      profile: {
        ...record.profile,
        personaSummary: input.request.effectBinding.persona.publicSummary,
        appearance: input.request.effectBinding.persona.visibleCue
          ?? record.profile.appearance,
      },
      identity: {
        ...record.identity,
        tier: "temporary",
      },
      socialContext: {
        ...record.socialContext,
        currentLocationId: input.anchor.broadLocationId,
        currentLocationName: broadLocationName,
        originMode: "native",
      },
      motivations: {
        ...record.motivations,
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: [],
        frictions: [],
      },
    });
    const insert = db.insert(npcs)
      .values({
        id: actorId,
        campaignId: input.packet.campaignId,
        ...projection,
        currentSceneLocationId: input.anchor.sceneLocationId,
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: timestamp,
      })
      .run();
    if (insert.changes !== 1) {
      throw new Error("Support actor creation did not insert exactly one NPC row.");
    }

    input.testHooks?.afterSupportActorInsertBeforeAuthorityTrace?.();

    const resultWorldVersion = clock.worldVersion + 1;
    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        currentTick: Math.max(clock.currentTick, input.packet.baseTick),
        updatedAt: timestamp,
      })
      .where(and(
        eq(worldClocks.campaignId, input.packet.campaignId),
        eq(worldClocks.worldVersion, clock.worldVersion),
      ))
      .run();
    if (clockUpdate.changes !== 1) {
      throw new Error("World clock changed before support_actor.create.v2 could commit.");
    }

    const authorityTraceId = crypto.randomUUID();
    db.insert(authorityTraces)
      .values({
        id: authorityTraceId,
        campaignId: input.packet.campaignId,
        operation: "gameplay-cycle-v2.support_actor.create.v2",
        sourceEntityType: "npc",
        sourceEntityId: actorId,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        elapsedWorldTimeMinutes: 0,
        toolResultId: sourceKey,
        eventIds: "[]",
        stateDeltaRefs: stringifyStringArray([
          `npc:${actorId}:created`,
          `scene:${input.anchor.sceneLocationId}:actors`,
        ]),
        witnesses: stringifyStringArray(input.request.effectBinding.evidenceRefs),
        metadata: stringifyJson({
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          toolId: input.request.toolId,
          anchorRef: input.request.effectBinding.anchorRef,
          anchorScope: input.request.effectBinding.anchorScope,
          actorId,
          displayName: input.displayName,
          roleKind: input.request.effectBinding.roleKind,
          roleLabel: input.request.effectBinding.roleLabel,
          tags: input.tags,
        }),
        createdAt: timestamp,
      })
      .run();

    return {
      actorId,
      resultWorldVersion,
      resultWorldTimeMinutes: clock.worldTimeMinutes,
      authorityTraceId,
    };
  });
}

function commitMinorPoiCreateV2(input: {
  packet: ModelFacingTurnPacketV2;
  request: Extract<GameplayToolRequestV2, { toolId: "minor_poi.create.v2" }>;
  anchor: Extract<CurrentSceneResolution, { status: "resolved" }>;
  poiLabel: string;
  testHooks?: GameplayDbHandlerTestHooksV2;
}): {
  poiLocationId: string;
  resultWorldVersion: number;
  resultWorldTimeMinutes: number;
  authorityTraceId: string;
} {
  const db = getDb();
  const timestamp = Date.now();
  const poiLocationId = crypto.randomUUID();
  const sourceKey = authoritySourceKey({
    turnId: input.packet.turnId,
    requestId: input.request.requestId,
  });
  const poiTags = [
    "minor-poi",
    "gameplay-v2-created",
    "current-scene-poi",
    "target-only",
    "no-route",
  ];

  return db.transaction(() => {
    const clock = ensureClockAtBase({
      campaignId: input.packet.campaignId,
      baseWorldVersion: input.packet.baseWorldVersion,
      currentTick: input.packet.baseTick,
    });
    if (clock.worldVersion !== input.packet.baseWorldVersion) {
      throw new Error(
        `Stale world version for ${input.packet.campaignId}: expected ${clock.worldVersion}, got ${input.packet.baseWorldVersion}.`,
      );
    }

    const existing = db
      .select({
        id: locations.id,
        name: locations.name,
        tags: locations.tags,
        archivedAtTick: locations.archivedAtTick,
        parentLocationId: locations.parentLocationId,
      })
      .from(locations)
      .where(and(
        eq(locations.campaignId, input.packet.campaignId),
        eq(locations.parentLocationId, input.anchor.sceneLocationId),
      ))
      .all()
      .find((row) =>
        row.archivedAtTick == null
        && parseStringArray(row.tags).includes("minor-poi")
        && normalizePoiLabel(row.name) === normalizePoiLabel(input.poiLabel));
    if (existing) {
      throw new Error(`A matching minor POI "${existing.name}" is already present in the current scene.`);
    }

    const insert = db.insert(locations)
      .values({
        id: poiLocationId,
        campaignId: input.packet.campaignId,
        name: input.poiLabel,
        description: input.request.effectBinding.purpose,
        kind: "ephemeral_scene",
        parentLocationId: input.anchor.sceneLocationId,
        anchorLocationId: input.anchor.broadLocationId,
        persistence: "ephemeral",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: stringifyStringArray(poiTags),
        isStarting: false,
        connectedTo: "[]",
      })
      .run();
    if (insert.changes !== 1) {
      throw new Error("Minor POI creation did not insert exactly one location row.");
    }

    input.testHooks?.afterMinorPoiInsertBeforeAuthorityTrace?.();

    const resultWorldVersion = clock.worldVersion + 1;
    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        currentTick: Math.max(clock.currentTick, input.packet.baseTick),
        updatedAt: timestamp,
      })
      .where(and(
        eq(worldClocks.campaignId, input.packet.campaignId),
        eq(worldClocks.worldVersion, clock.worldVersion),
      ))
      .run();
    if (clockUpdate.changes !== 1) {
      throw new Error("World clock changed before minor_poi.create.v2 could commit.");
    }

    const authorityTraceId = crypto.randomUUID();
    db.insert(authorityTraces)
      .values({
        id: authorityTraceId,
        campaignId: input.packet.campaignId,
        operation: "gameplay-cycle-v2.minor_poi.create.v2",
        sourceEntityType: "location",
        sourceEntityId: poiLocationId,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        elapsedWorldTimeMinutes: 0,
        toolResultId: sourceKey,
        eventIds: "[]",
        stateDeltaRefs: stringifyStringArray([
          `minor_poi:${poiLocationId}:created`,
          `scene:${input.anchor.sceneLocationId}:minor_pois`,
        ]),
        witnesses: stringifyStringArray(input.request.effectBinding.evidenceRefs),
        metadata: stringifyJson({
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          toolId: input.request.toolId,
          anchorRef: input.request.effectBinding.anchorRef,
          anchorScope: input.request.effectBinding.anchorScope,
          anchorSceneLocationId: input.anchor.sceneLocationId,
          anchorBroadLocationId: input.anchor.broadLocationId,
          poiLocationId,
          poiLabel: input.poiLabel,
          purpose: input.request.effectBinding.purpose,
          exposure: "visible_target_only",
          movementCandidate: false,
          routeEdgeCreated: false,
          worldFactCreated: false,
          itemCreated: false,
        }),
        createdAt: timestamp,
      })
      .run();

    return {
      poiLocationId,
      resultWorldVersion,
      resultWorldTimeMinutes: clock.worldTimeMinutes,
      authorityTraceId,
    };
  });
}

function commitLocationRevealV2(input: {
  packet: ModelFacingTurnPacketV2;
  request: LocationRevealRequestV2;
  anchor: Extract<CurrentSceneResolution, { status: "resolved" }>;
  locationLabel: string;
  sourceReceipts: readonly GameplayRuntimeReceiptV2[];
  testHooks?: GameplayDbHandlerTestHooksV2;
}): {
  locationId: string;
  resultWorldVersion: number;
  resultWorldTimeMinutes: number;
  authorityTraceId: string;
} {
  const db = getDb();
  const timestamp = Date.now();
  const locationId = crypto.randomUUID();
  const sourceKey = authoritySourceKey({
    turnId: input.packet.turnId,
    requestId: input.request.requestId,
  });
  const binding = input.request.effectBinding;
  const revealTags = [
    "location-reveal",
    "gameplay-v2-created",
    "current-scene-place-handle",
    "target-only",
    "no-route",
  ];

  return db.transaction(() => {
    const clock = ensureClockAtBase({
      campaignId: input.packet.campaignId,
      baseWorldVersion: input.packet.baseWorldVersion,
      currentTick: input.packet.baseTick,
    });
    if (clock.worldVersion !== input.packet.baseWorldVersion) {
      throw new Error(
        `Stale world version for ${input.packet.campaignId}: expected ${clock.worldVersion}, got ${input.packet.baseWorldVersion}.`,
      );
    }

    const labelCollision = db
      .select({
        id: locations.id,
        name: locations.name,
        archivedAtTick: locations.archivedAtTick,
        parentLocationId: locations.parentLocationId,
      })
      .from(locations)
      .where(and(
        eq(locations.campaignId, input.packet.campaignId),
        eq(locations.parentLocationId, input.anchor.sceneLocationId),
      ))
      .all()
      .find((row) =>
        row.archivedAtTick == null
        && normalizePoiLabel(row.name) === normalizePoiLabel(input.locationLabel));
    if (labelCollision) {
      throw new Error(`A matching place handle "${labelCollision.name}" is already present in the current scene.`);
    }

    const insert = db.insert(locations)
      .values({
        id: locationId,
        campaignId: input.packet.campaignId,
        name: input.locationLabel,
        description: binding.visibleDescription ?? binding.reason,
        kind: "ephemeral_scene",
        parentLocationId: input.anchor.sceneLocationId,
        anchorLocationId: input.anchor.broadLocationId,
        persistence: "ephemeral",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: stringifyStringArray(revealTags),
        isStarting: false,
        connectedTo: "[]",
      })
      .run();
    if (insert.changes !== 1) {
      throw new Error("location.reveal.v2 did not insert exactly one location row.");
    }

    input.testHooks?.afterLocationRevealInsertBeforeAuthorityTrace?.();

    const resultWorldVersion = clock.worldVersion + 1;
    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        currentTick: Math.max(clock.currentTick, input.packet.baseTick),
        updatedAt: timestamp,
      })
      .where(and(
        eq(worldClocks.campaignId, input.packet.campaignId),
        eq(worldClocks.worldVersion, clock.worldVersion),
      ))
      .run();
    if (clockUpdate.changes !== 1) {
      throw new Error("World clock changed before location.reveal.v2 could commit.");
    }

    const authorityTraceId = crypto.randomUUID();
    db.insert(authorityTraces)
      .values({
        id: authorityTraceId,
        campaignId: input.packet.campaignId,
        operation: "gameplay-cycle-v2.location.reveal.v2",
        sourceEntityType: "location",
        sourceEntityId: locationId,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        elapsedWorldTimeMinutes: 0,
        toolResultId: sourceKey,
        eventIds: "[]",
        stateDeltaRefs: stringifyStringArray([
          `location_reveal:${locationId}:created`,
          `scene:${input.anchor.sceneLocationId}:place_handles`,
        ]),
        witnesses: stringifyStringArray(binding.evidenceRefs),
        metadata: stringifyJson({
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          toolId: input.request.toolId,
          anchorRef: binding.anchorRef,
          anchorScope: binding.anchorScope,
          anchorSceneLocationId: input.anchor.sceneLocationId,
          anchorBroadLocationId: input.anchor.broadLocationId,
          revealMode: binding.revealMode,
          placeHandleKind: binding.placeHandleKind,
          locationId,
          locationLabel: input.locationLabel,
          sourceAuthority: binding.sourceAuthority,
          sourceReceiptSummaries: sourceReceiptSummary(input.sourceReceipts),
          exposure: binding.exposure,
          movementCandidate: false,
          routeEdgeCreated: false,
          currentSceneChanged: false,
          absenceProof: false,
          hiddenDiscovery: false,
          itemCreated: false,
          actorCreated: false,
          worldFactCreated: false,
        }),
        createdAt: timestamp,
      })
      .run();

    return {
      locationId,
      resultWorldVersion,
      resultWorldTimeMinutes: clock.worldTimeMinutes,
      authorityTraceId,
    };
  });
}

function commitEntityTagV2(input: {
  packet: ModelFacingTurnPacketV2;
  request: Extract<GameplayToolRequestV2, { toolId: "entity.tag.v2" }>;
  target: Extract<EntityTagResolution, { status: "resolved" }>;
  tag: string;
  testHooks?: GameplayDbHandlerTestHooksV2;
}): {
  resultWorldVersion: number;
  resultWorldTimeMinutes: number;
  authorityTraceId: string;
} {
  const db = getDb();
  const timestamp = Date.now();
  const sourceKey = authoritySourceKey({
    turnId: input.packet.turnId,
    requestId: input.request.requestId,
  });

  return db.transaction(() => {
    const clock = ensureClockAtBase({
      campaignId: input.packet.campaignId,
      baseWorldVersion: input.packet.baseWorldVersion,
      currentTick: input.packet.baseTick,
    });
    if (clock.worldVersion !== input.packet.baseWorldVersion) {
      throw new Error(
        `Stale world version for ${input.packet.campaignId}: expected ${clock.worldVersion}, got ${input.packet.baseWorldVersion}.`,
      );
    }

    let rawTags: string | null | undefined;
    switch (input.target.table) {
      case "players": {
        const row = db.select().from(players).where(and(
          eq(players.id, input.target.entityId),
          eq(players.campaignId, input.packet.campaignId),
        )).get();
        if (!row) throw new Error(`Player tag target not found: ${input.target.entityId}.`);
        rawTags = row.tags;
        break;
      }
      case "npcs": {
        const row = db.select().from(npcs).where(and(
          eq(npcs.id, input.target.entityId),
          eq(npcs.campaignId, input.packet.campaignId),
        )).get();
        if (!row) throw new Error(`NPC tag target not found: ${input.target.entityId}.`);
        rawTags = row.tags;
        break;
      }
      case "items": {
        const row = db.select().from(items).where(and(
          eq(items.id, input.target.entityId),
          eq(items.campaignId, input.packet.campaignId),
        )).get();
        if (!row) throw new Error(`Item tag target not found: ${input.target.entityId}.`);
        rawTags = row.tags;
        break;
      }
      case "locations": {
        const row = db.select().from(locations).where(and(
          eq(locations.id, input.target.entityId),
          eq(locations.campaignId, input.packet.campaignId),
        )).get();
        if (!row) throw new Error(`Location tag target not found: ${input.target.entityId}.`);
        rawTags = row.tags;
        break;
      }
    }

    const currentTags = parseStringArray(rawTags);
    const currentCanonicalTags = new Set(currentTags.map((tag) => tag.toLowerCase()));
    const hasTag = currentCanonicalTags.has(input.tag);
    const nextTags = input.request.effectBinding.operation === "add"
      ? [...currentTags, input.tag]
      : currentTags.filter((tag) => tag.toLowerCase() !== input.tag);
    const changed = input.request.effectBinding.operation === "add" ? !hasTag : hasTag;
    if (!changed) {
      throw new Error(
        input.request.effectBinding.operation === "add"
          ? `${input.target.label} already has tag ${input.tag}.`
          : `${input.target.label} already lacks tag ${input.tag}.`,
      );
    }

    const serializedTags = stringifyStringArray([...new Set(nextTags)]);
    let rowUpdate: { changes: number };
    switch (input.target.table) {
      case "players":
        rowUpdate = db.update(players)
          .set({ tags: serializedTags })
          .where(and(
            eq(players.id, input.target.entityId),
            eq(players.campaignId, input.packet.campaignId),
          ))
          .run();
        break;
      case "npcs":
        rowUpdate = db.update(npcs)
          .set({ tags: serializedTags })
          .where(and(
            eq(npcs.id, input.target.entityId),
            eq(npcs.campaignId, input.packet.campaignId),
          ))
          .run();
        break;
      case "items":
        rowUpdate = db.update(items)
          .set({ tags: serializedTags })
          .where(and(
            eq(items.id, input.target.entityId),
            eq(items.campaignId, input.packet.campaignId),
          ))
          .run();
        break;
      case "locations":
        rowUpdate = db.update(locations)
          .set({ tags: serializedTags })
          .where(and(
            eq(locations.id, input.target.entityId),
            eq(locations.campaignId, input.packet.campaignId),
          ))
          .run();
        break;
    }
    if (rowUpdate.changes !== 1) {
      throw new Error("Entity tag update did not affect exactly one row.");
    }

    input.testHooks?.afterEntityTagRowUpdateBeforeAuthorityTrace?.();

    const resultWorldVersion = clock.worldVersion + 1;
    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        currentTick: Math.max(clock.currentTick, input.packet.baseTick),
        updatedAt: timestamp,
      })
      .where(and(
        eq(worldClocks.campaignId, input.packet.campaignId),
        eq(worldClocks.worldVersion, clock.worldVersion),
      ))
      .run();
    if (clockUpdate.changes !== 1) {
      throw new Error("World clock changed before entity.tag.v2 could commit.");
    }

    const authorityTraceId = crypto.randomUUID();
    db.insert(authorityTraces)
      .values({
        id: authorityTraceId,
        campaignId: input.packet.campaignId,
        operation: "gameplay-cycle-v2.entity.tag.v2",
        sourceEntityType: input.target.sourceEntityType,
        sourceEntityId: input.target.entityId,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        elapsedWorldTimeMinutes: 0,
        toolResultId: sourceKey,
        eventIds: "[]",
        stateDeltaRefs: stringifyStringArray([input.target.stateDeltaRef]),
        witnesses: stringifyStringArray(input.request.effectBinding.evidenceRefs),
        metadata: stringifyJson({
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          toolId: input.request.toolId,
          entityScope: input.request.effectBinding.entityScope,
          entityRef: input.request.effectBinding.entityRef,
          operation: input.request.effectBinding.operation,
          tag: input.tag,
        }),
        createdAt: timestamp,
      })
      .run();

    return {
      resultWorldVersion,
      resultWorldTimeMinutes: clock.worldTimeMinutes,
      authorityTraceId,
    };
  });
}

function commitItemTransferV2(input: {
  packet: ModelFacingTurnPacketV2;
  request: ItemTransferRequestV2;
  transfer: Extract<ItemTransferResolution, { status: "resolved" }>;
  testHooks?: GameplayDbHandlerTestHooksV2;
}): {
  resultWorldVersion: number;
  resultWorldTimeMinutes: number;
  authorityTraceId: string;
} {
  const db = getDb();
  const timestamp = Date.now();
  const sourceKey = authoritySourceKey({
    turnId: input.packet.turnId,
    requestId: input.request.requestId,
  });

  return db.transaction(() => {
    const clock = ensureClockAtBase({
      campaignId: input.packet.campaignId,
      baseWorldVersion: input.packet.baseWorldVersion,
      currentTick: input.packet.baseTick,
    });
    if (clock.worldVersion !== input.packet.baseWorldVersion) {
      throw new Error(
        `Stale world version for ${input.packet.campaignId}: expected ${clock.worldVersion}, got ${input.packet.baseWorldVersion}.`,
      );
    }

    const item = readItemRow({
      packet: input.packet,
      itemId: input.transfer.itemId,
    });
    if (!item) throw new Error(`Item transfer target not found: ${input.transfer.itemId}.`);

    const binding = input.request.effectBinding;
    const sourceFailure = validateItemTransferSource({
      binding,
      item,
      playerActorId: input.transfer.playerActorId,
      sourceLocationId: input.transfer.sourceLocationId,
    });
    if (sourceFailure) throw new Error(sourceFailure);

    if (
      binding.action === "equip_player_item"
      || binding.action === "unequip_player_item"
      || binding.action === "take_to_player_inventory"
    ) {
      if (input.transfer.targetOwnerId !== input.transfer.playerActorId) {
        throw new Error(`${input.transfer.itemLabel} is not being transferred to player inventory.`);
      }
    }

    if (input.transfer.nextEquipState === "equipped" && input.transfer.nextEquippedSlot) {
      const slotConflict = db.select().from(items).where(and(
        eq(items.campaignId, input.packet.campaignId),
        eq(items.ownerId, input.transfer.playerActorId),
        eq(items.equipState, "equipped"),
        eq(items.equippedSlot, input.transfer.nextEquippedSlot),
      )).all().find((candidate) => candidate.id !== input.transfer.itemId);
      if (slotConflict) {
        throw new Error(`Equip slot ${input.transfer.nextEquippedSlot} is already occupied by ${slotConflict.name}.`);
      }
    }

    const nextState = {
      ownerId: input.transfer.targetOwnerId,
      locationId: input.transfer.targetLocationId,
      equipState: input.transfer.nextEquipState,
      equippedSlot: input.transfer.nextEquippedSlot,
    };
    const changed =
      item.ownerId !== nextState.ownerId
      || item.locationId !== nextState.locationId
      || item.equipState !== nextState.equipState
      || item.equippedSlot !== nextState.equippedSlot;
    if (!changed) {
      throw new Error(`No item transfer mutation was needed for ${input.transfer.itemLabel}.`);
    }

    const rowUpdate = db.update(items)
      .set(nextState)
      .where(and(
        eq(items.id, input.transfer.itemId),
        eq(items.campaignId, input.packet.campaignId),
      ))
      .run();
    if (rowUpdate.changes !== 1) {
      throw new Error("Item transfer update did not affect exactly one row.");
    }

    input.testHooks?.afterItemTransferRowUpdateBeforeAuthorityTrace?.();

    const resultWorldVersion = clock.worldVersion + 1;
    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        currentTick: Math.max(clock.currentTick, input.packet.baseTick),
        updatedAt: timestamp,
      })
      .where(and(
        eq(worldClocks.campaignId, input.packet.campaignId),
        eq(worldClocks.worldVersion, clock.worldVersion),
      ))
      .run();
    if (clockUpdate.changes !== 1) {
      throw new Error("World clock changed before item.transfer.v2 could commit.");
    }

    const authorityTraceId = crypto.randomUUID();
    db.insert(authorityTraces)
      .values({
        id: authorityTraceId,
        campaignId: input.packet.campaignId,
        operation: "gameplay-cycle-v2.item.transfer.v2",
        sourceEntityType: "item",
        sourceEntityId: input.transfer.itemId,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        elapsedWorldTimeMinutes: 0,
        toolResultId: sourceKey,
        eventIds: "[]",
        stateDeltaRefs: stringifyStringArray(input.transfer.stateDeltaRefs),
        witnesses: stringifyStringArray(input.request.effectBinding.evidenceRefs),
        metadata: stringifyJson({
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          toolId: input.request.toolId,
          action: binding.action,
          itemScope: binding.itemScope,
          itemRef: binding.itemRef,
          sourceScope: binding.sourceScope,
          sourceRef: binding.sourceRef,
          targetScope: binding.targetScope,
          targetRef: binding.targetRef,
          targetEntityType: input.transfer.targetEntityType,
          targetEntityId: input.transfer.targetEntityId,
          previous: {
            ownerId: item.ownerId,
            locationId: item.locationId,
            equipState: item.equipState,
            equippedSlot: item.equippedSlot,
          },
          next: nextState,
        }),
        createdAt: timestamp,
      })
      .run();

    return {
      resultWorldVersion,
      resultWorldTimeMinutes: clock.worldTimeMinutes,
      authorityTraceId,
    };
  });
}

function commitWorldFactRecordV2(input: {
  packet: ModelFacingTurnPacketV2;
  request: WorldFactRequestV2;
  owner: {
    playerActorId: string;
    entry: GameplayRefRegistryEntryV2;
  };
  sourceReceipts: GameplayRuntimeReceiptV2[];
  testHooks?: GameplayDbHandlerTestHooksV2;
}): {
  knowledgeId: string;
  resultWorldVersion: number;
  resultWorldTimeMinutes: number;
  authorityTraceId: string;
} {
  const db = getDb();
  const timestamp = Date.now();
  const knowledgeId = crypto.randomUUID();
  const authorityTraceId = crypto.randomUUID();
  const sourceKey = authoritySourceKey({
    turnId: input.packet.turnId,
    requestId: input.request.requestId,
  });
  const binding = input.request.effectBinding;
  const source = binding.source;
  const confidence = knowledgeConfidence(binding.truthStatus);
  const sourceReceiptIds = source.sourceReceiptIds;
  const normalizedStatement = normalizeKnowledgeStatement(binding.statement);

  return db.transaction(() => {
    const clock = ensureClockAtBase({
      campaignId: input.packet.campaignId,
      baseWorldVersion: input.packet.baseWorldVersion,
      currentTick: input.packet.baseTick,
    });
    if (clock.worldVersion !== input.packet.baseWorldVersion) {
      throw new Error(
        `Stale world version for ${input.packet.campaignId}: expected ${clock.worldVersion}, got ${input.packet.baseWorldVersion}.`,
      );
    }

    const duplicate = db
      .select()
      .from(actorKnowledgeRecords)
      .where(and(
        eq(actorKnowledgeRecords.campaignId, input.packet.campaignId),
        eq(actorKnowledgeRecords.actorId, input.owner.playerActorId),
      ))
      .all()
      .find((row) => {
        const metadata = parseJsonRecord(row.metadata);
        const existingSourceReceiptIds = Array.isArray(metadata.sourceReceiptIds)
          ? metadata.sourceReceiptIds.filter((value): value is string => typeof value === "string")
          : [];
        return normalizeKnowledgeStatement(row.statement) === normalizedStatement
          && existingSourceReceiptIds.length === sourceReceiptIds.length
          && existingSourceReceiptIds.every((receiptId) => sourceReceiptIds.includes(receiptId));
      });
    if (duplicate) {
      throw new Error("A matching player-known knowledge record already exists for this source.");
    }

    const resultWorldVersion = clock.worldVersion + 1;
    const insert = db.insert(actorKnowledgeRecords)
      .values({
        id: knowledgeId,
        campaignId: input.packet.campaignId,
        actorId: input.owner.playerActorId,
        route: knowledgeRouteFor({
          sourceKind: source.sourceKind,
          truthStatus: binding.truthStatus,
        }),
        truthStatus: binding.truthStatus,
        statement: binding.statement.trim(),
        subjectRefs: stringifyStringArray(binding.subjectRefs),
        sourceEventIds: "[]",
        sourceKnowledgeIds: "[]",
        authorityTraceIds: stringifyStringArray([authorityTraceId]),
        sourceActorId: null,
        recipientActorIds: "[]",
        confidence,
        reliability: confidence,
        privacy: "private",
        baseWorldVersion: clock.worldVersion,
        validFromWorldVersion: resultWorldVersion,
        observedAtWorldVersion: clock.worldVersion,
        invalidatedAtWorldVersion: null,
        createdWorldTimeMinutes: clock.worldTimeMinutes,
        deliveredWorldTimeMinutes: clock.worldTimeMinutes,
        expiresWorldTimeMinutes: null,
        metadata: stringifyJson({
          toolName: "world_fact.record.v2",
          scope: "player_known",
          objectiveCanon: false,
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          truthStatus: binding.truthStatus,
          futureUseKind: binding.futureUseKind,
          summary: binding.summary,
          sourceKind: source.sourceKind,
          sourceReceiptIds,
          sourceQuote: source.sourceQuote ?? null,
          sourceSummary: source.sourceSummary,
          sourceReceiptSummaries: sourceReceiptSummary(input.sourceReceipts),
          evidenceRefs: binding.evidenceRefs,
          subjectRefs: binding.subjectRefs,
        }),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    if (insert.changes !== 1) {
      throw new Error("world_fact.record.v2 did not insert exactly one player-known knowledge row.");
    }

    input.testHooks?.afterWorldFactKnowledgeInsertBeforeAuthorityTrace?.();

    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        currentTick: Math.max(clock.currentTick, input.packet.baseTick),
        updatedAt: timestamp,
      })
      .where(and(
        eq(worldClocks.campaignId, input.packet.campaignId),
        eq(worldClocks.worldVersion, clock.worldVersion),
      ))
      .run();
    if (clockUpdate.changes !== 1) {
      throw new Error("World clock changed before world_fact.record.v2 could commit.");
    }

    db.insert(authorityTraces)
      .values({
        id: authorityTraceId,
        campaignId: input.packet.campaignId,
        operation: "gameplay-cycle-v2.player_knowledge.record.v2",
        sourceEntityType: "actor_knowledge",
        sourceEntityId: knowledgeId,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: clock.worldTimeMinutes,
        elapsedWorldTimeMinutes: 0,
        toolResultId: sourceKey,
        eventIds: "[]",
        stateDeltaRefs: stringifyStringArray([
          `actor_knowledge:${knowledgeId}:created`,
          `actor:${input.owner.playerActorId}:knowledge`,
        ]),
        witnesses: stringifyStringArray(binding.evidenceRefs),
        metadata: stringifyJson({
          requestId: input.request.requestId,
          turnId: input.packet.turnId,
          toolId: input.request.toolId,
          knowledgeOwnerRef: binding.knowledgeOwnerRef,
          knowledgeOwnerActorId: input.owner.playerActorId,
          scope: "player_known",
          objectiveCanon: false,
          truthStatus: binding.truthStatus,
          futureUseKind: binding.futureUseKind,
          sourceKind: source.sourceKind,
          sourceReceiptIds,
          subjectRefs: binding.subjectRefs,
        }),
        createdAt: timestamp,
      })
      .run();

    return {
      knowledgeId,
      resultWorldVersion,
      resultWorldTimeMinutes: clock.worldTimeMinutes,
      authorityTraceId,
    };
  });
}

function routeCheckHandler(
  packet: ModelFacingTurnPacketV2,
  request: Extract<GameplayToolRequestV2, { toolId: "route.check.v2" }>,
  refRegistry: GameplayRefRegistryV2 | undefined,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const actor = resolveActor({
    packet,
    registry,
    actorRef: request.effectBinding.actorRef,
  });
  if (actor.status !== "resolved") return failedOutcome(packet, actor.reason);
  const destination = resolveDestination({
    registry,
    destinationRef: request.effectBinding.destinationRef,
  });
  if (destination.status !== "resolved") return failedOutcome(packet, destination.reason);

  const graph = loadLocationGraph({ campaignId: packet.campaignId });
  const path = destination.connected
    ? resolveTravelPath({
      campaignId: packet.campaignId,
      fromLocationId: actor.currentLocationId,
      toLocationId: destination.locationId,
      edges: graph.edges,
      locations: graph.locations,
      currentTick: packet.baseTick,
    })
    : null;

  if (!path) {
    const reachable = listConnectedPaths({
      campaignId: packet.campaignId,
      fromLocationId: actor.currentLocationId,
      edges: graph.edges,
      locations: graph.locations,
      currentTick: packet.baseTick,
    }).map((entry) => entry.locationName);
    return {
      status: "accepted",
      mutationApplied: false,
      mutationAuthority: "none",
      resultWorldVersion: packet.baseWorldVersion,
      visibleSummary: `${destination.label} is not an exposed legal route from ${actor.label}'s current position. Available routes: ${reachable.join(", ") || "none"}.`,
      evidenceRefs: [
        request.effectBinding.actorRef,
        request.effectBinding.destinationRef,
        ...request.effectBinding.evidenceRefs,
      ],
      durableEventIds: [],
    };
  }

  return {
    status: "accepted",
    mutationApplied: false,
    mutationAuthority: "none",
    resultWorldVersion: packet.baseWorldVersion,
    visibleSummary: `${destination.label} is an exposed legal route for ${actor.label}; route path: ${pathNames(packet.campaignId, path.locationIds).join(" -> ")}.`,
    evidenceRefs: [
      request.effectBinding.actorRef,
      request.effectBinding.destinationRef,
      ...request.effectBinding.evidenceRefs,
    ],
    durableEventIds: [],
  };
}

function actorMoveHandler(
  packet: ModelFacingTurnPacketV2,
  request: Extract<GameplayToolRequestV2, { toolId: "actor.move.v2" }>,
  refRegistry: GameplayRefRegistryV2 | undefined,
  testHooks?: GameplayDbHandlerTestHooksV2,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const actor = resolveActor({
    packet,
    registry,
    actorRef: request.effectBinding.actorRef,
  });
  if (actor.status !== "resolved") return failedOutcome(packet, actor.reason);
  const destination = resolveDestination({
    registry,
    destinationRef: request.effectBinding.destinationRef,
  });
  if (destination.status !== "resolved") return failedOutcome(packet, destination.reason);
  if (!destination.connected) {
    return failedOutcome(packet, `Destination "${destination.label}" is not an exposed connected movement option.`);
  }

  const graph = loadLocationGraph({ campaignId: packet.campaignId });
  const path = resolveTravelPath({
    campaignId: packet.campaignId,
    fromLocationId: actor.currentLocationId,
    toLocationId: destination.locationId,
    edges: graph.edges,
    locations: graph.locations,
    currentTick: packet.baseTick,
  });
  if (!path) {
    return failedOutcome(packet, `Destination "${destination.label}" is no longer reachable from the actor's current location.`);
  }

  try {
    const commit = commitActorMoveV2({
      packet,
      request,
      actor,
      destination,
      path,
      destinationName: destination.label,
      testHooks,
    });
    return {
      status: "accepted",
      mutationApplied: true,
      mutationAuthority: "actor",
      resultWorldVersion: commit.resultWorldVersion,
      visibleSummary: `${actor.label} moves to ${destination.label}.`,
      evidenceRefs: [
        request.effectBinding.actorRef,
        request.effectBinding.destinationRef,
        ...request.effectBinding.evidenceRefs,
      ],
      durableEventIds: [],
    };
  } catch (error) {
    return failedOutcome(
      packet,
      error instanceof Error ? error.message : "actor.move.v2 failed before committing movement.",
      "failed",
    );
  }
}

function sceneBeatHandler(
  packet: ModelFacingTurnPacketV2,
  request: Extract<GameplayToolRequestV2, { toolId: "scene_beat.record.v2" }>,
  refRegistry: GameplayRefRegistryV2 | undefined,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const actor = resolveActor({
    packet,
    registry,
    actorRef: request.effectBinding.actorRef,
  });
  if (actor.status !== "resolved") return failedOutcome(packet, actor.reason);

  return {
    status: "accepted",
    mutationApplied: false,
    mutationAuthority: "none",
    resultWorldVersion: packet.baseWorldVersion,
    visibleSummary: request.effectBinding.summary,
    evidenceRefs: [
      request.effectBinding.actorRef,
      ...request.effectBinding.evidenceRefs,
    ],
    durableEventIds: [],
  };
}

function dialogueRecordHandler(
  packet: ModelFacingTurnPacketV2,
  request: Extract<GameplayToolRequestV2, { toolId: "dialogue.record.v2" }>,
  refRegistry: GameplayRefRegistryV2 | undefined,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const speaker = resolveGameplayRefV2({
    registry,
    ref: request.effectBinding.speakerRef,
    allowedKinds: ["visible_actor"],
  });
  if (speaker.status !== "resolved") {
    return failedOutcome(packet, speaker.reason);
  }
  for (const addresseeRef of request.effectBinding.addresseeRefs) {
    const addressee = resolveGameplayRefV2({
      registry,
      ref: addresseeRef,
      allowedKinds: ["player_actor", "visible_actor"],
    });
    if (addressee.status !== "resolved") {
      return failedOutcome(packet, addressee.reason);
    }
  }

  const quotedSpeech = request.effectBinding.quotedSpeech
    ? ` Quote: ${request.effectBinding.quotedSpeech}`
    : "";
  return {
    status: "accepted",
    mutationApplied: false,
    mutationAuthority: "none",
    resultWorldVersion: packet.baseWorldVersion,
    visibleSummary: `${speaker.entry.label} dialogue outcome (${request.effectBinding.outcomeKind}): ${request.effectBinding.summary}${quotedSpeech}`,
    evidenceRefs: [
      request.effectBinding.speakerRef,
      ...request.effectBinding.addresseeRefs,
      ...request.effectBinding.evidenceRefs,
    ],
    durableEventIds: [],
  };
}

function supportActorCreateHandler(
  packet: ModelFacingTurnPacketV2,
  request: Extract<GameplayToolRequestV2, { toolId: "support_actor.create.v2" }>,
  refRegistry: GameplayRefRegistryV2 | undefined,
  testHooks?: GameplayDbHandlerTestHooksV2,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const anchor = resolveCurrentScene({
    registry,
    anchorRef: request.effectBinding.anchorRef,
  });
  if (anchor.status !== "resolved") return failedOutcome(packet, anchor.reason);
  const invalidTag = request.effectBinding.tags.find((tag) => canonicalSupportTag(tag) !== tag);
  if (invalidTag) {
    return failedOutcome(packet, `Invalid support actor tag "${invalidTag}". Use lowercase letters, numbers, hyphen, or underscore only.`);
  }
  const displayName = request.effectBinding.displayName?.trim()
    || request.effectBinding.roleLabel.trim();

  try {
    const commit = commitSupportActorCreateV2({
      packet,
      request,
      anchor,
      displayName,
      tags: request.effectBinding.tags,
      testHooks,
    });
    return {
      status: "accepted",
      mutationApplied: true,
      mutationAuthority: "actor",
      resultWorldVersion: commit.resultWorldVersion,
      visibleSummary: `${displayName} appears as a temporary ${request.effectBinding.roleLabel} in ${anchor.label}.`,
      evidenceRefs: [
        request.effectBinding.anchorRef,
        ...request.effectBinding.evidenceRefs,
      ],
      durableEventIds: [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "support_actor.create.v2 failed before committing actor creation.";
    const isNoOp = reason.includes("already present in the current scene");
    return failedOutcome(packet, reason, isNoOp ? "rejected" : "failed");
  }
}

function minorPoiCreateHandler(
  packet: ModelFacingTurnPacketV2,
  request: Extract<GameplayToolRequestV2, { toolId: "minor_poi.create.v2" }>,
  refRegistry: GameplayRefRegistryV2 | undefined,
  testHooks?: GameplayDbHandlerTestHooksV2,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const anchor = resolveCurrentScene({
    registry,
    anchorRef: request.effectBinding.anchorRef,
  });
  if (anchor.status !== "resolved") return failedOutcome(packet, anchor.reason);
  const poiLabel = request.effectBinding.poiLabel.trim().replace(/\s+/gu, " ");
  const labelCollision = registry.entries.find((entry) =>
    normalizePoiLabel(entry.label) === normalizePoiLabel(poiLabel)
    || normalizePoiLabel(entry.ref) === normalizePoiLabel(poiLabel));
  if (labelCollision) {
    return failedOutcome(
      packet,
      `Minor POI label "${poiLabel}" collides with existing visible ref "${labelCollision.ref}".`,
    );
  }

  try {
    const commit = commitMinorPoiCreateV2({
      packet,
      request,
      anchor,
      poiLabel,
      testHooks,
    });
    return {
      status: "accepted",
      mutationApplied: true,
      mutationAuthority: "local_scene",
      resultWorldVersion: commit.resultWorldVersion,
      visibleSummary: `${poiLabel} is now a visible minor point of interest in ${anchor.label}.`,
      evidenceRefs: [
        request.effectBinding.anchorRef,
        ...request.effectBinding.evidenceRefs,
      ],
      durableEventIds: [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "minor_poi.create.v2 failed before committing POI creation.";
    const isNoOp = reason.includes("already present in the current scene");
    return failedOutcome(packet, reason, isNoOp ? "rejected" : "failed");
  }
}

function locationRevealHandler(
  packet: ModelFacingTurnPacketV2,
  request: LocationRevealRequestV2,
  refRegistry: GameplayRefRegistryV2 | undefined,
  priorReceipts: readonly GameplayRuntimeReceiptV2[],
  testHooks?: GameplayDbHandlerTestHooksV2,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const anchor = resolveCurrentScene({
    registry,
    anchorRef: request.effectBinding.anchorRef,
  });
  if (anchor.status !== "resolved") return failedOutcome(packet, anchor.reason);
  const locationLabel = request.effectBinding.locationLabel.trim().replace(/\s+/gu, " ");
  const registryCollision = registry.entries.find((entry) =>
    normalizePoiLabel(entry.label) === normalizePoiLabel(locationLabel)
    || normalizePoiLabel(entry.ref) === normalizePoiLabel(locationLabel));
  if (registryCollision) {
    return failedOutcome(
      packet,
      `Location reveal label "${locationLabel}" collides with existing visible ref "${registryCollision.ref}".`,
    );
  }
  const source = resolveLocationRevealSource({
    packet,
    request,
    priorReceipts,
  });
  if (source.status !== "resolved") return failedOutcome(packet, source.reason);

  try {
    const commit = commitLocationRevealV2({
      packet,
      request,
      anchor,
      locationLabel,
      sourceReceipts: source.receipts,
      testHooks,
    });
    return {
      status: "accepted",
      mutationApplied: true,
      mutationAuthority: "local_scene",
      resultWorldVersion: commit.resultWorldVersion,
      visibleSummary: `${locationLabel} is now a visible current-scene place handle in ${anchor.label}.`,
      evidenceRefs: [
        request.effectBinding.anchorRef,
        ...request.effectBinding.evidenceRefs,
      ],
      durableEventIds: [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "location.reveal.v2 failed before committing place-handle reveal.";
    const isNoOp = reason.includes("already present in the current scene");
    return failedOutcome(packet, reason, isNoOp ? "rejected" : "failed");
  }
}

function entityTagHandler(
  packet: ModelFacingTurnPacketV2,
  request: Extract<GameplayToolRequestV2, { toolId: "entity.tag.v2" }>,
  refRegistry: GameplayRefRegistryV2 | undefined,
  testHooks?: GameplayDbHandlerTestHooksV2,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const tag = canonicalTag(request.effectBinding.tag);
  if (!tag) {
    return failedOutcome(packet, `Invalid entity tag "${request.effectBinding.tag}". Use lowercase letters, numbers, hyphen, or underscore only.`);
  }
  const target = resolveEntityTagTarget({
    registry,
    scope: request.effectBinding.entityScope,
    entityRef: request.effectBinding.entityRef,
  });
  if (target.status !== "resolved") return failedOutcome(packet, target.reason);

  try {
    const commit = commitEntityTagV2({
      packet,
      request,
      target,
      tag,
      testHooks,
    });
    const verb = request.effectBinding.operation === "add" ? "adds" : "removes";
    return {
      status: "accepted",
      mutationApplied: true,
      mutationAuthority: target.mutationAuthority,
      resultWorldVersion: commit.resultWorldVersion,
      visibleSummary: `${target.label} ${verb} tag ${tag}.`,
      evidenceRefs: [
        request.effectBinding.entityRef,
        ...request.effectBinding.evidenceRefs,
      ],
      durableEventIds: [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "entity.tag.v2 failed before committing the tag mutation.";
    const isNoOp = reason.includes("already has tag") || reason.includes("already lacks tag");
    return failedOutcome(packet, reason, isNoOp ? "rejected" : "failed");
  }
}

function itemTransferHandler(
  packet: ModelFacingTurnPacketV2,
  request: ItemTransferRequestV2,
  refRegistry: GameplayRefRegistryV2 | undefined,
  testHooks?: GameplayDbHandlerTestHooksV2,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const transfer = resolveItemTransfer({
    packet,
    registry,
    request,
  });
  if (transfer.status !== "resolved") return failedOutcome(packet, transfer.reason);

  try {
    const commit = commitItemTransferV2({
      packet,
      request,
      transfer,
      testHooks,
    });
    return {
      status: "accepted",
      mutationApplied: true,
      mutationAuthority: "item",
      resultWorldVersion: commit.resultWorldVersion,
      visibleSummary: `${transfer.itemLabel} moves to ${transfer.targetLabel}.`,
      evidenceRefs: [
        request.effectBinding.itemRef,
        request.effectBinding.sourceRef,
        request.effectBinding.targetRef,
        ...request.effectBinding.evidenceRefs,
      ],
      durableEventIds: [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "item.transfer.v2 failed before committing item mutation.";
    const isNoOp = reason.includes("No item transfer mutation")
      || reason.includes("already")
      || reason.includes("not currently")
      || reason.includes("not located")
      || reason.includes("not being transferred")
      || reason.includes("occupied");
    return failedOutcome(packet, reason, isNoOp ? "rejected" : "failed");
  }
}

function worldFactRecordHandler(
  packet: ModelFacingTurnPacketV2,
  request: WorldFactRequestV2,
  refRegistry: GameplayRefRegistryV2 | undefined,
  priorReceipts: readonly GameplayRuntimeReceiptV2[],
  testHooks?: GameplayDbHandlerTestHooksV2,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) return failedOutcome(packet, "Missing or stale gameplay-cycle-v2 ref registry.");
  const owner = resolvePlayerEntry({
    registry,
    playerRef: request.effectBinding.knowledgeOwnerRef,
  });
  if (owner.status !== "resolved") return failedOutcome(packet, owner.reason);
  const source = resolveWorldFactSource({
    request,
    priorReceipts,
  });
  if (source.status !== "resolved") return failedOutcome(packet, source.reason);

  try {
    const commit = commitWorldFactRecordV2({
      packet,
      request,
      owner,
      sourceReceipts: source.receipts,
      testHooks,
    });
    return {
      status: "accepted",
      mutationApplied: true,
      mutationAuthority: "knowledge",
      resultWorldVersion: commit.resultWorldVersion,
      visibleSummary: `Player-known knowledge recorded from ${request.effectBinding.source.sourceKind}: ${request.effectBinding.summary}`,
      evidenceRefs: uniqueStrings([
        request.effectBinding.knowledgeOwnerRef,
        ...request.effectBinding.subjectRefs,
        ...request.effectBinding.evidenceRefs,
      ]),
      durableEventIds: [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "world_fact.record.v2 failed before committing player-known knowledge.";
    const isNoOp = reason.includes("already exists");
    return failedOutcome(packet, reason, isNoOp ? "rejected" : "failed");
  }
}

function actorConditionSetHandler(
  packet: ModelFacingTurnPacketV2,
  request: ActorConditionRequestV2,
  refRegistry: GameplayRefRegistryV2 | undefined,
  priorReceipts: readonly GameplayRuntimeReceiptV2[],
  testHooks?: GameplayDbHandlerTestHooksV2,
): GameplayToolHandlerOutcomeV2 {
  const registry = requireRegistry(packet, refRegistry);
  if (!registry) {
    return failedOutcome(packet, "actor.condition_set.v2 requires a fresh gameplay ref registry.");
  }
  const actor = resolveActor({
    packet,
    registry,
    actorRef: request.effectBinding.actorRef,
  });
  if (actor.status !== "resolved") return failedOutcome(packet, actor.reason);
  if (request.effectBinding.actorScope === "player_actor" && actor.actorKind !== "player") {
    return failedOutcome(packet, "actorScope=player_actor requires actorRef=Player.");
  }
  if (request.effectBinding.actorScope === "visible_actor" && actor.actorKind !== "npc") {
    return failedOutcome(packet, "actorScope=visible_actor requires a visible non-player actor ref.");
  }
  if (request.effectBinding.operation.kind === "adjust_player_hp" && actor.actorKind !== "player") {
    return failedOutcome(packet, "adjust_player_hp is only valid for Player.");
  }

  const source = resolveActorConditionSource({
    packet,
    request,
    priorReceipts,
  });
  if (source.status !== "resolved") return failedOutcome(packet, source.reason);

  try {
    const commit = commitActorConditionSetV2({
      packet,
      request,
      actor,
      sourceReceipts: source.receipts,
      testHooks,
    });
    return {
      status: "accepted",
      mutationApplied: true,
      mutationAuthority: "actor",
      resultWorldVersion: commit.resultWorldVersion,
      visibleSummary: commit.visibleSummary,
      evidenceRefs: uniqueStrings([
        request.effectBinding.actorRef,
        ...request.effectBinding.evidenceRefs,
      ]),
      durableEventIds: [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "actor.condition_set.v2 failed before committing actor condition.";
    const isNoOp = reason.includes("already has condition")
      || reason.includes("does not have condition")
      || reason.includes("would leave backend bounds");
    return failedOutcome(packet, reason, isNoOp ? "rejected" : "failed");
  }
}

export function createDbBackedGameplayToolHandlersV2(
  options: CreateDbBackedGameplayToolHandlersV2Options = {},
): GameplayToolHandlerRegistryV2 {
  return {
    "route.check.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "route.check.v2") {
        return failedOutcome(packet, "route.check.v2 handler received the wrong request type.");
      }
      return routeCheckHandler(packet, request, refRegistry);
    },
    "actor.move.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "actor.move.v2") {
        return failedOutcome(packet, "actor.move.v2 handler received the wrong request type.");
      }
      return actorMoveHandler(packet, request, refRegistry, options.testHooks);
    },
    "scene_beat.record.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "scene_beat.record.v2") {
        return failedOutcome(packet, "scene_beat.record.v2 handler received the wrong request type.");
      }
      return sceneBeatHandler(packet, request, refRegistry);
    },
    "dialogue.record.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "dialogue.record.v2") {
        return failedOutcome(packet, "dialogue.record.v2 handler received the wrong request type.");
      }
      return dialogueRecordHandler(packet, request, refRegistry);
    },
    "support_actor.create.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "support_actor.create.v2") {
        return failedOutcome(packet, "support_actor.create.v2 handler received the wrong request type.");
      }
      return supportActorCreateHandler(packet, request, refRegistry, options.testHooks);
    },
    "minor_poi.create.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "minor_poi.create.v2") {
        return failedOutcome(packet, "minor_poi.create.v2 handler received the wrong request type.");
      }
      return minorPoiCreateHandler(packet, request, refRegistry, options.testHooks);
    },
    "location.reveal.v2": ({ packet, request, refRegistry, priorReceipts }) => {
      if (request.toolId !== "location.reveal.v2") {
        return failedOutcome(packet, "location.reveal.v2 handler received the wrong request type.");
      }
      return locationRevealHandler(packet, request, refRegistry, priorReceipts, options.testHooks);
    },
    "entity.tag.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "entity.tag.v2") {
        return failedOutcome(packet, "entity.tag.v2 handler received the wrong request type.");
      }
      return entityTagHandler(packet, request, refRegistry, options.testHooks);
    },
    "item.transfer.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "item.transfer.v2") {
        return failedOutcome(packet, "item.transfer.v2 handler received the wrong request type.");
      }
      return itemTransferHandler(packet, request, refRegistry, options.testHooks);
    },
    "actor.condition_set.v2": ({ packet, request, refRegistry, priorReceipts }) => {
      if (request.toolId !== "actor.condition_set.v2") {
        return failedOutcome(packet, "actor.condition_set.v2 handler received the wrong request type.");
      }
      return actorConditionSetHandler(packet, request, refRegistry, priorReceipts, options.testHooks);
    },
    "world_fact.record.v2": ({ packet, request, refRegistry, priorReceipts }) => {
      if (request.toolId !== "world_fact.record.v2") {
        return failedOutcome(packet, "world_fact.record.v2 handler received the wrong request type.");
      }
      return worldFactRecordHandler(packet, request, refRegistry, priorReceipts, options.testHooks);
    },
  };
}
