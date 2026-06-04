import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
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
import type { GameplayToolRequestV2, ModelFacingTurnPacketV2 } from "./contracts.js";

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

type EntityTagScope = Extract<GameplayToolRequestV2, { toolId: "entity.tag.v2" }>["effectBinding"]["entityScope"];

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

export interface GameplayDbHandlerTestHooksV2 {
  afterActorRowUpdateBeforeAuthorityTrace?: () => void;
  afterEntityTagRowUpdateBeforeAuthorityTrace?: () => void;
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

function canonicalTag(raw: string): string | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/gu, "-");
  if (!normalized || normalized.length > 80) return null;
  if (!/^[a-z0-9][a-z0-9_-]*$/u.test(normalized)) return null;
  return normalized;
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
    "entity.tag.v2": ({ packet, request, refRegistry }) => {
      if (request.toolId !== "entity.tag.v2") {
        return failedOutcome(packet, "entity.tag.v2 handler received the wrong request type.");
      }
      return entityTagHandler(packet, request, refRegistry, options.testHooks);
    },
  };
}
