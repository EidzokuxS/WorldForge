import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { locations, npcs, players } from "../db/schema.js";
import { readCampaignConfig } from "../campaign/index.js";
import { hydrateStoredPlayerRecord } from "../character/record-adapters.js";
import { deriveStartConditionEffects } from "./start-condition-runtime.js";
import { listRecentLocationEvents } from "./location-events.js";
import {
  readPendingCommittedEvents,
  type PendingCommittedEvent,
} from "../vectors/episodic-events.js";

export interface SceneEffect {
  id: string;
  kind:
    | "opening"
    | "player_action"
    | "movement"
    | "state_change"
    | "npc_reaction"
    | "environment"
    | "relationship";
  source: "opening_state" | "tool_call" | "committed_event" | "recent_context";
  summary: string;
  perceivable: boolean;
  actor: string | null;
  target: string | null;
  locationId: string | null;
  causalDetail: string | null;
}

export interface AuthoritativeOpeningState {
  active: boolean;
  locationId: string | null;
  locationName: string | null;
  arrivalMode: string | null;
  startingVisibility: string | null;
  immediateSituation: string | null;
  entryPressure: string[];
  promptLines: string[];
  sceneContextLines: string[];
}

export interface AuthoritativeSceneContext {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface SceneAssembly {
  openingScene: boolean;
  openingState: AuthoritativeOpeningState | null;
  currentScene: AuthoritativeSceneContext | null;
  presentNpcNames: string[];
  recentContext: Array<{
    tick: number;
    summary: string;
    source: "location_recent_event" | "committed_event";
  }>;
  sceneEffects: SceneEffect[];
  playerPerceivableConsequences: string[];
}

export interface AssembleSceneOptions {
  campaignId: string;
  currentLocationId?: string | null;
  pendingEventTicks: number[];
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  openingScene?: boolean;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeBlock(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSummaries(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = normalizeBlock(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(value.trim());
  }

  return unique;
}

export function collapseRepeatedNarrationBlocks(text: string): string {
  const blocks = text
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    return text.trim();
  }

  const collapsed: string[] = [];
  let previousNormalized: string | null = null;

  for (const block of blocks) {
    const normalized = normalizeBlock(block);
    if (!normalized || normalized === previousNormalized) {
      continue;
    }
    previousNormalized = normalized;
    collapsed.push(block);
  }

  return collapsed.join("\n\n").trim();
}

function buildOpeningState(campaignId: string): AuthoritativeOpeningState | null {
  const db = getDb();
  const config = readCampaignConfig(campaignId);
  const currentTick = config.currentTick ?? 0;
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  if (!player) {
    return null;
  }

  const playerRecord = hydrateStoredPlayerRecord(player);
  const effects = deriveStartConditionEffects(playerRecord, {
    currentTick,
    currentLocationId: player.currentLocationId,
  });

  return {
    active: effects.isActive,
    locationId:
      playerRecord.startConditions.startLocationId
      ?? playerRecord.socialContext.currentLocationId
      ?? null,
    locationName:
      playerRecord.socialContext.currentLocationName
      ?? player.name
      ?? null,
    arrivalMode: playerRecord.startConditions.arrivalMode ?? null,
    startingVisibility: playerRecord.startConditions.startingVisibility ?? null,
    immediateSituation: playerRecord.startConditions.immediateSituation ?? null,
    entryPressure: [...(playerRecord.startConditions.entryPressure ?? [])],
    promptLines: [...effects.promptLines],
    sceneContextLines: [...effects.sceneContextLines],
  };
}

function buildCurrentScene(
  campaignId: string,
  currentLocationId?: string | null,
): AuthoritativeSceneContext | null {
  const db = getDb();
  const locationId =
    currentLocationId
    ?? db
      .select({ currentLocationId: players.currentLocationId })
      .from(players)
      .where(eq(players.campaignId, campaignId))
      .get()?.currentLocationId
    ?? null;

  if (!locationId) {
    return null;
  }

  const location = db
    .select()
    .from(locations)
    .where(eq(locations.id, locationId))
    .get();

  if (!location) {
    return null;
  }

  return {
    id: location.id,
    name: location.name,
    description: location.description,
    tags: parseStringArray(location.tags),
  };
}

function summarizeToolCall(
  index: number,
  toolCall: { tool: string; args: unknown; result: unknown },
  currentScene: AuthoritativeSceneContext | null,
): SceneEffect | null {
  const args = (toolCall.args ?? {}) as Record<string, unknown>;
  const result = (toolCall.result ?? {}) as Record<string, unknown>;
  const inner = (result.result ?? {}) as Record<string, unknown>;

  switch (toolCall.tool) {
    case "log_event":
      if (typeof args.text === "string" && args.text.trim().length > 0) {
        return {
          id: `tool-${index}`,
          kind: "player_action",
          source: "tool_call",
          summary: args.text,
          perceivable: true,
          actor: "player",
          target: null,
          locationId: currentScene?.id ?? null,
          causalDetail: "Tool-driving hidden pass committed a same-turn event.",
        };
      }
      return null;

    case "move_to":
      if (typeof inner.locationName === "string" && inner.locationName.trim().length > 0) {
        return {
          id: `tool-${index}`,
          kind: "movement",
          source: "tool_call",
          summary: `The player arrives at ${inner.locationName}.`,
          perceivable: true,
          actor: "player",
          target: inner.locationName,
          locationId: typeof inner.locationId === "string" ? inner.locationId : currentScene?.id ?? null,
          causalDetail: "Authoritative movement resolved before final narration.",
        };
      }
      return null;

    case "spawn_npc":
      if (typeof args.name === "string" && args.name.trim().length > 0) {
        return {
          id: `tool-${index}`,
          kind: "npc_reaction",
          source: "tool_call",
          summary: `${args.name} becomes visibly present in the scene.`,
          perceivable: true,
          actor: typeof args.name === "string" ? args.name : null,
          target: null,
          locationId: currentScene?.id ?? null,
          causalDetail: "A new present-scene actor was introduced during hidden resolution.",
        };
      }
      return null;

    case "spawn_item":
    case "transfer_item":
      if (typeof args.itemName === "string" && args.itemName.trim().length > 0) {
        return {
          id: `tool-${index}`,
          kind: "environment",
          source: "tool_call",
          summary: `${args.itemName} changes the visible state of the scene.`,
          perceivable: true,
          actor: null,
          target: typeof args.itemName === "string" ? args.itemName : null,
          locationId: currentScene?.id ?? null,
          causalDetail: "Authoritative item movement happened before final narration.",
        };
      }
      return null;

    case "set_condition":
      return {
        id: `tool-${index}`,
        kind: "state_change",
        source: "tool_call",
        summary:
          typeof args.delta === "number" && args.delta < 0
            ? "The player visibly takes the consequences of the action."
            : "The player's condition visibly changes.",
        perceivable: true,
        actor: typeof args.targetName === "string" ? args.targetName : "player",
        target: null,
        locationId: currentScene?.id ?? null,
        causalDetail: "set_condition resolved inside the hidden pass.",
      };

    case "reveal_location":
      if (typeof args.name === "string" && args.name.trim().length > 0) {
        return {
          id: `tool-${index}`,
          kind: "environment",
          source: "tool_call",
          summary: `${args.name} becomes a visible or reachable part of the scene.`,
          perceivable: true,
          actor: null,
          target: typeof args.name === "string" ? args.name : null,
          locationId: currentScene?.id ?? null,
          causalDetail: "Scene geography changed during hidden resolution.",
        };
      }
      return null;

    case "set_relationship":
      if (
        typeof args.entityA === "string"
        && typeof args.entityB === "string"
        && typeof args.reason === "string"
      ) {
        return {
          id: `tool-${index}`,
          kind: "relationship",
          source: "tool_call",
          summary: `${args.entityA} and ${args.entityB}: ${args.reason}`,
          perceivable: true,
          actor: args.entityA,
          target: args.entityB,
          locationId: currentScene?.id ?? null,
          causalDetail: "Relationship state shifted in authoritative runtime state.",
        };
      }
      return null;

    default:
      return null;
  }
}

function summarizeCommittedEvent(
  event: PendingCommittedEvent,
  currentScene: AuthoritativeSceneContext | null,
): SceneEffect | null {
  if (
    currentScene
    && event.location
    && event.location !== currentScene.id
    && event.location.toLowerCase() !== currentScene.name.toLowerCase()
  ) {
    return null;
  }

  return {
    id: event.id,
    kind:
      event.type === "dialogue" || event.type === "npc_offscreen"
        ? "npc_reaction"
        : "player_action",
    source: "committed_event",
    summary: event.text,
    perceivable: true,
    actor: event.participants[0] ?? null,
    target: event.participants[1] ?? null,
    locationId: currentScene?.id ?? null,
    causalDetail: `Committed same-turn event (${event.type}) is available for final narration.`,
  };
}

function buildPresentNpcNames(
  campaignId: string,
  currentScene: AuthoritativeSceneContext | null,
): string[] {
  if (!currentScene) {
    return [];
  }

  return getDb()
    .select({ name: npcs.name })
    .from(npcs)
    .where(eq(npcs.currentLocationId, currentScene.id))
    .all()
    .map((npc) => npc.name);
}

export function assembleAuthoritativeScene(
  options: AssembleSceneOptions,
): SceneAssembly {
  const openingState = buildOpeningState(options.campaignId);
  const currentScene = buildCurrentScene(options.campaignId, options.currentLocationId);
  const presentNpcNames = buildPresentNpcNames(options.campaignId, currentScene);

  const pendingEvents = [...new Set(options.pendingEventTicks)]
    .flatMap((tick) => readPendingCommittedEvents(options.campaignId, tick));
  const recentLocationEvents = currentScene
    ? listRecentLocationEvents({
        campaignId: options.campaignId,
        locationRef: currentScene.id,
        limit: 5,
      })
    : [];

  const sceneEffects = uniqueSummaries([
    ...(openingState?.active
      ? openingState.sceneContextLines.map((line) => line.trim())
      : []),
    ...options.toolCalls
      .map((toolCall, index) => summarizeToolCall(index, toolCall, currentScene))
      .filter((effect): effect is SceneEffect => Boolean(effect))
      .map((effect) => effect.summary),
    ...pendingEvents
      .map((event) => summarizeCommittedEvent(event, currentScene))
      .filter((effect): effect is SceneEffect => Boolean(effect))
      .map((effect) => effect.summary),
  ]);

  const typedSceneEffects: SceneEffect[] = [
    ...(openingState?.active
      ? openingState.sceneContextLines.map((line, index) => ({
          id: `opening-${index}`,
          kind: "opening" as const,
          source: "opening_state" as const,
          summary: line,
          perceivable: true,
          actor: "player",
          target: null,
          locationId: openingState.locationId,
          causalDetail: "Structured opening state is active for this scene.",
        }))
      : []),
    ...options.toolCalls
      .map((toolCall, index) => summarizeToolCall(index, toolCall, currentScene))
      .filter((effect): effect is SceneEffect => Boolean(effect)),
    ...pendingEvents
      .map((event) => summarizeCommittedEvent(event, currentScene))
      .filter((effect): effect is SceneEffect => Boolean(effect)),
  ].filter(
    (effect, index, allEffects) =>
      allEffects.findIndex(
        (candidate) => normalizeBlock(candidate.summary) === normalizeBlock(effect.summary),
      ) === index,
  );

  const recentContext = [
    ...recentLocationEvents.map((event) => ({
      tick: event.tick,
      summary: event.summary,
      source: "location_recent_event" as const,
    })),
    ...pendingEvents.map((event) => ({
      tick: event.tick,
      summary: event.text,
      source: "committed_event" as const,
    })),
  ].filter(
    (entry, index, entries) =>
      entries.findIndex(
        (candidate) =>
          candidate.tick === entry.tick
          && normalizeBlock(candidate.summary) === normalizeBlock(entry.summary),
      ) === index,
  );

  return {
    openingScene: options.openingScene ?? false,
    openingState,
    currentScene,
    presentNpcNames,
    recentContext,
    sceneEffects: typedSceneEffects,
    playerPerceivableConsequences: uniqueSummaries([
      ...sceneEffects,
      ...recentContext.map((entry) => entry.summary),
      ...presentNpcNames.map((name) => `${name} is present in the current scene.`),
    ]),
  };
}
