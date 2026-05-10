import { eq } from "drizzle-orm";
import { readCampaignConfig } from "../campaign/index.js";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
} from "../character/record-adapters.js";
import { getDb } from "../db/index.js";
import { items, locationEdges, locations, npcs, players } from "../db/schema.js";
import { readPendingCommittedEvents } from "../vectors/episodic-events.js";
import { buildCombatEnvelope, type CombatEnvelope } from "./combat-envelope.js";
import { resolveActorExposureCatchup } from "./actor-exposure-catchup.js";
import { listRecentLocationEvents } from "./location-events.js";
import { parseTags } from "./parse-helpers.js";
import {
  getObserverAwareness,
  getObserverKnowledgeBasis,
  inferPresenceVisibility,
  resolveScenePresence,
  type AwarenessBand,
  type KnowledgeBasis,
} from "./scene-presence.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";

export const SCENE_FRAME_RECENT_EVENT_LIMIT = 12;
export const SCENE_FRAME_TARGET_CANDIDATE_LIMIT = 12;
export const SCENE_FRAME_MOVEMENT_CANDIDATE_LIMIT = 12;

export type SceneActorType = "player" | "npc";

export interface SceneActor {
  id: string;
  actorId?: string;
  type: SceneActorType;
  label: string;
  locationId: string | null;
  sceneScopeId: string | null;
  awareness: AwarenessBand;
  knowledgeBasis?: KnowledgeBasis;
  awarenessHint?: string | null;
  tags?: string[];
  summary?: string | null;
}

export interface SceneFrameRoster {
  active: SceneActor[];
  support: SceneActor[];
  background: SceneActor[];
}

export interface SceneFramePerception {
  playerAwarenessHints: string[];
  actorAwareness: Record<string, Record<string, AwarenessBand>>;
  actorKnowledge?: Record<string, Record<string, KnowledgeBasis>>;
  forbiddenActorIds?: string[];
  forbiddenActorLabels?: string[];
}

export interface SceneFrameRecentEvent {
  id: string;
  tick: number;
  summary: string;
  source:
    | "location_recent_event"
    | "world_thread_signal"
    | "committed_event"
    | "tool_result"
    | "chat_history";
  actorIds: string[];
  perceivableByPlayer: boolean;
}

export interface SceneFrameTargetCandidate {
  id: string;
  type: "actor" | "item" | "location" | "faction";
  label: string;
  actorId?: string | null;
  itemId?: string | null;
  locationId?: string | null;
  factionId?: string | null;
  awareness?: AwarenessBand;
  tags?: string[];
}

export interface SceneFrameMovementCandidate {
  id: string;
  locationId: string;
  label: string;
  connected: boolean;
  travelCost?: number;
  path?: string[];
}

export interface SceneFrameDeferredHook {
  id: string;
  hookType: "offscreen" | "reflection" | "faction" | "memory" | "custom";
  subjectIds: string[];
  reason: string;
}

export interface SceneFrameOracleInput {
  outcome: string;
  confidence?: number;
  rationale?: string;
}

export interface SceneFrameOracleContext {
  targetLabel: string | null;
  targetType: "character" | "item" | "location/object" | "faction" | "none";
  targetTags: string[];
  source: "parsed" | "movement" | "scene_frame" | "fallback";
  fallbackReason: string | null;
  candidateId?: string | null;
  actorId?: string | null;
  itemId?: string | null;
  locationId?: string | null;
  factionId?: string | null;
}

export interface SceneFrame {
  campaignId: string;
  tick: number;
  playerActorId: string;
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  currentLocationName?: string | null;
  currentSceneScopeName?: string | null;
  playerAction: string;
  roster: SceneFrameRoster;
  perception: SceneFramePerception;
  recentEvents: SceneFrameRecentEvent[];
  targetCandidates: SceneFrameTargetCandidate[];
  movementCandidates: SceneFrameMovementCandidate[];
  deferredHooks: SceneFrameDeferredHook[];
  allowedTools: RuntimeToolName[];
  /**
   * Post-GM/Judge framing only. Neutral player-turn SceneFrames omit this field
   * unless a caller provides an explicit concrete oracle context.
   */
  oracleContext?: SceneFrameOracleContext | null;
  /**
   * Post-GM/Judge framing only. Neutral player-turn SceneFrames omit this field
   * unless a caller provides an explicit concrete combat envelope.
   */
  combatEnvelope?: CombatEnvelope | null;
  oracle: SceneFrameOracleInput | null;
}

export interface SceneFrameBuildOptions {
  campaignId: string;
  tick?: number;
  playerActorId?: string;
  currentLocationId?: string | null;
  currentSceneScopeId?: string | null;
  currentLocationName?: string | null;
  currentSceneScopeName?: string | null;
  playerAction: string;
  intent?: string;
  method?: string;
  elapsedWorldTimeMinutes?: number;
  runActorExposureCatchup?: boolean;
  roster?: SceneFrameRoster;
  perception?: SceneFramePerception;
  recentEvents?: SceneFrameRecentEvent[];
  targetCandidates?: SceneFrameTargetCandidate[];
  movementCandidates?: SceneFrameMovementCandidate[];
  deferredHooks?: SceneFrameDeferredHook[];
  allowedTools?: RuntimeToolName[];
  oracleContext?: SceneFrameOracleContext | null;
  combatEnvelope?: CombatEnvelope | null;
  oracle?: SceneFrameOracleInput | null;
}

type PlayerRow = typeof players.$inferSelect;
type NpcRow = typeof npcs.$inferSelect;
type LocationRow = typeof locations.$inferSelect;
type LocationEdgeRow = typeof locationEdges.$inferSelect;
type ItemRow = typeof items.$inferSelect;

const EXECUTE_TOOL_SUPPORTED_TOOL_NAMES = new Set<RuntimeToolName>([
  "list_visible_affordances",
  "list_navigation_options",
  "find_location_candidates",
  "find_object_candidates",
  "find_actor_candidates",
  "find_poi_candidates",
  "inspect_known_fact",
  "check_route",
  "move_actor",
  "create_minor_poi",
  "create_scene_extra",
  "start_search",
  "record_player_intent",
  "add_tag",
  "remove_tag",
  "set_relationship",
  "add_chronicle_entry",
  "log_event",
  "advance_time",
  "offer_quick_actions",
  "spawn_npc",
  "promote_npc",
  "spawn_item",
  "reveal_location",
  "request_contested_outcome",
  "set_condition",
  "move_to",
  "transfer_item",
]);

const DEFAULT_PLAYER_TURN_ALLOWED_TOOLS: RuntimeToolName[] = (
  Object.keys(runtimeToolInputSchemas) as RuntimeToolName[]
);

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export function getSceneFrameVisibleActorNames(frame: Pick<SceneFrame, "roster">): string[] {
  return uniqueStrings(
    [...frame.roster.active, ...frame.roster.support]
      .filter((actor) => actor.awareness === "clear")
      .map((actor) => actor.label),
  );
}

export function getSceneFramePlayerHints(
  frame: Pick<SceneFrame, "perception" | "roster">,
): string[] {
  return uniqueStrings([
    ...frame.perception.playerAwarenessHints,
    ...frame.roster.support
      .filter((actor) => actor.awareness !== "clear")
      .map((actor) => actor.awarenessHint ?? null),
  ]);
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function cloneActors(actors: readonly SceneActor[]): SceneActor[] {
  return actors.map((actor) => ({
    ...actor,
    actorId: actor.actorId ?? actor.id,
    tags: actor.tags ? [...actor.tags] : undefined,
  }));
}

function clonePerception(perception: SceneFramePerception): SceneFramePerception {
  return {
    playerAwarenessHints: [...perception.playerAwarenessHints],
    actorAwareness: Object.fromEntries(
      Object.entries(perception.actorAwareness).map(([observerId, awareness]) => [
        observerId,
        { ...awareness },
      ]),
    ),
    actorKnowledge: perception.actorKnowledge
      ? Object.fromEntries(
          Object.entries(perception.actorKnowledge).map(([observerId, knowledge]) => [
            observerId,
            { ...knowledge },
          ]),
        )
      : undefined,
    forbiddenActorIds: perception.forbiddenActorIds
      ? [...perception.forbiddenActorIds]
      : undefined,
    forbiddenActorLabels: perception.forbiddenActorLabels
      ? [...perception.forbiddenActorLabels]
      : undefined,
  };
}

function cloneRecentEvents(events: readonly SceneFrameRecentEvent[]): SceneFrameRecentEvent[] {
  return events.map((event) => ({
    ...event,
    actorIds: [...event.actorIds],
  }));
}

function cloneTargetCandidates(
  candidates: readonly SceneFrameTargetCandidate[],
): SceneFrameTargetCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    tags: candidate.tags ? [...candidate.tags] : undefined,
  }));
}

function cloneMovementCandidates(
  candidates: readonly SceneFrameMovementCandidate[],
): SceneFrameMovementCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    path: candidate.path ? [...candidate.path] : undefined,
  }));
}

function cloneDeferredHooks(hooks: readonly SceneFrameDeferredHook[]): SceneFrameDeferredHook[] {
  return hooks.map((hook) => ({
    ...hook,
    subjectIds: [...hook.subjectIds],
  }));
}

function buildAllowedTools(explicitTools?: readonly RuntimeToolName[]): RuntimeToolName[] {
  const allowedTools = explicitTools ?? DEFAULT_PLAYER_TURN_ALLOWED_TOOLS;
  return allowedTools.filter(
    (toolName) =>
      toolName in runtimeToolInputSchemas
      && EXECUTE_TOOL_SUPPORTED_TOOL_NAMES.has(toolName),
  );
}

function normalizeFrame(input: {
  campaignId: string;
  tick: number;
  playerActorId: string;
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  currentLocationName?: string | null;
  currentSceneScopeName?: string | null;
  playerAction: string;
  roster: SceneFrameRoster;
  perception: SceneFramePerception;
  recentEvents?: SceneFrameRecentEvent[];
  targetCandidates?: SceneFrameTargetCandidate[];
  movementCandidates?: SceneFrameMovementCandidate[];
  deferredHooks?: SceneFrameDeferredHook[];
  allowedTools?: RuntimeToolName[];
  oracleContext?: SceneFrameOracleContext | null;
  combatEnvelope?: CombatEnvelope | null;
  oracle?: SceneFrameOracleInput | null;
}): SceneFrame {
  const frame: SceneFrame = {
    campaignId: input.campaignId,
    tick: input.tick,
    playerActorId: input.playerActorId,
    currentLocationId: input.currentLocationId,
    currentSceneScopeId: input.currentSceneScopeId,
    currentLocationName: input.currentLocationName ?? null,
    currentSceneScopeName: input.currentSceneScopeName ?? null,
    playerAction: input.playerAction,
    roster: {
      active: cloneActors(input.roster.active),
      support: cloneActors(input.roster.support),
      background: cloneActors(input.roster.background),
    },
    perception: clonePerception(input.perception),
    recentEvents: cloneRecentEvents(input.recentEvents ?? []).slice(
      0,
      SCENE_FRAME_RECENT_EVENT_LIMIT,
    ),
    targetCandidates: cloneTargetCandidates(input.targetCandidates ?? []).slice(
      0,
      SCENE_FRAME_TARGET_CANDIDATE_LIMIT,
    ),
    movementCandidates: cloneMovementCandidates(input.movementCandidates ?? []).slice(
      0,
      SCENE_FRAME_MOVEMENT_CANDIDATE_LIMIT,
    ),
    deferredHooks: cloneDeferredHooks(input.deferredHooks ?? []),
    allowedTools: buildAllowedTools(input.allowedTools),
    oracle: input.oracle ?? null,
  };

  if (input.oracleContext) {
    frame.oracleContext = {
      ...input.oracleContext,
      targetTags: [...input.oracleContext.targetTags],
    };
  }
  if (input.combatEnvelope) {
    frame.combatEnvelope = input.combatEnvelope;
  }

  return frame;
}

function readCampaignRows<T>(query: { all?: () => T[]; get?: () => T | null | undefined }): T[] {
  if (typeof query.all === "function") {
    return query.all();
  }
  if (typeof query.get === "function") {
    const row = query.get();
    return row ? [row] : [];
  }
  return [];
}

function readPlayer(campaignId: string, playerActorId?: string): PlayerRow {
  const rows = readCampaignRows<PlayerRow>(
    getDb()
      .select()
      .from(players)
      .where(eq(players.campaignId, campaignId)),
  );
  const player = playerActorId
    ? rows.find((row) => row.id === playerActorId)
    : rows[0];

  if (!player) {
    throw new Error(
      `Cannot build SceneFrame: invalid-campaign missing player row for campaign ${campaignId}. Create or select a player character before entering /game.`,
    );
  }

  return player;
}

function readRowsByCampaign<T>(
  campaignId: string,
  table: { campaignId: unknown },
): T[] {
  return readCampaignRows<T>(
    getDb()
      .select()
      .from(table as never)
      .where(eq(table.campaignId as never, campaignId)),
  );
}

function locationIsVisibleNow(location: LocationRow, currentTick: number): boolean {
  if (location.archivedAtTick != null) {
    return false;
  }
  if (
    location.persistence === "ephemeral"
    && location.expiresAtTick != null
    && location.expiresAtTick <= currentTick
  ) {
    return false;
  }
  return true;
}

function resolveImmediatePresenceSceneScopeId(input: {
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  locationRows: LocationRow[];
}): string | null {
  if (!input.currentSceneScopeId) {
    return null;
  }

  if (input.currentSceneScopeId !== input.currentLocationId) {
    return input.currentSceneScopeId;
  }

  const sceneLocation = input.locationRows.find(
    (location) => location.id === input.currentSceneScopeId,
  );
  if (sceneLocation?.kind === "macro") {
    return null;
  }

  return input.currentSceneScopeId;
}

function resolvePresenceBroadLocationId(input: {
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  locationRows: LocationRow[];
}): string | null {
  if (!input.currentLocationId) {
    return null;
  }

  const currentLocation = input.locationRows.find(
    (location) => location.id === input.currentLocationId,
  );
  const sceneLocation = input.currentSceneScopeId
    ? input.locationRows.find((location) => location.id === input.currentSceneScopeId)
    : null;

  return sceneLocation?.parentLocationId
    ?? currentLocation?.parentLocationId
    ?? input.currentLocationId;
}

function buildRoster(input: {
  player: PlayerRow;
  npcRows: NpcRow[];
  locationRows: LocationRow[];
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
}): { roster: SceneFrameRoster; perception: SceneFramePerception } {
  const playerTags = parseTags(input.player.tags);
  const presenceSceneScopeId = resolveImmediatePresenceSceneScopeId({
    currentLocationId: input.currentLocationId,
    currentSceneScopeId: input.currentSceneScopeId,
    locationRows: input.locationRows,
  });
  const presenceBroadLocationId = resolvePresenceBroadLocationId({
    currentLocationId: input.currentLocationId,
    currentSceneScopeId: input.currentSceneScopeId,
    locationRows: input.locationRows,
  });
  const npcRowsInBroadLocation = input.npcRows.filter(
    (npc) => npc.currentLocationId === presenceBroadLocationId,
  );
  const actorInputs = [
    {
      actorId: input.player.id,
      actorType: "player" as const,
      broadLocationId: presenceBroadLocationId,
      sceneScopeId: presenceSceneScopeId,
      visibility: "clear" as const,
    },
    ...npcRowsInBroadLocation.map((npc) => {
      const visibility = inferPresenceVisibility(npc.tags);
      return {
        actorId: npc.id,
        actorType: "npc" as const,
        broadLocationId: npc.currentLocationId,
        sceneScopeId: npc.currentSceneLocationId,
        visibility: visibility.visibility,
        awarenessHint: visibility.awarenessHint,
      };
    }),
  ];

  const snapshot = resolveScenePresence({
    playerActorId: input.player.id,
    broadLocationId: presenceBroadLocationId,
    sceneScopeId: presenceSceneScopeId,
    actors: actorInputs,
  });
  const playerActor: SceneActor = {
    id: input.player.id,
    actorId: input.player.id,
    type: "player",
    label: input.player.name,
    locationId: input.currentLocationId,
    sceneScopeId: presenceSceneScopeId,
    awareness: "clear",
    knowledgeBasis: "perceived_now",
    tags: playerTags,
  };
  const npcActors = npcRowsInBroadLocation.map((npc): SceneActor => {
    const visibility = inferPresenceVisibility(npc.tags);
    const awareness = getObserverAwareness(snapshot, input.player.id, npc.id);
    const knowledgeBasis = getObserverKnowledgeBasis(snapshot, input.player.id, npc.id);

    return {
      id: npc.id,
      actorId: npc.id,
      type: "npc",
      label: npc.name,
      locationId: npc.currentLocationId,
      sceneScopeId: npc.currentSceneLocationId ?? null,
      awareness,
      knowledgeBasis,
      awarenessHint: visibility.awarenessHint,
      tags: parseTags(npc.tags),
      summary: npc.persona,
    };
  });

  const active = [
    playerActor,
    ...npcActors.filter(
      (actor) =>
        snapshot.presentActorIds.includes(actor.id)
        && actor.awareness === "clear",
    ),
  ];
  const support = npcActors.filter(
    (actor) =>
      snapshot.presentActorIds.includes(actor.id)
      && actor.awareness === "hint",
  );
  const background = npcActors.filter((actor) => !active.includes(actor) && !support.includes(actor));

  return {
    roster: { active, support, background },
    perception: {
      playerAwarenessHints: [...snapshot.playerAwarenessHints],
      actorAwareness: Object.fromEntries(
        Object.entries(snapshot.awarenessByObserver).map(([observerId, awareness]) => [
          observerId,
          { ...awareness },
        ]),
      ),
      actorKnowledge: Object.fromEntries(
        Object.entries(snapshot.knowledgeBasisByObserver).map(([observerId, knowledge]) => [
          observerId,
          { ...knowledge },
        ]),
      ),
      forbiddenActorIds: [
        ...support.filter((actor) => actor.awareness !== "clear").map((actor) => actor.id),
        ...background.map((actor) => actor.id),
      ],
      forbiddenActorLabels: [
        ...support.filter((actor) => actor.awareness !== "clear").map((actor) => actor.label),
        ...background.map((actor) => actor.label),
      ],
    },
  };
}

function collectRecentEvents(input: {
  campaignId: string;
  tick: number;
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  currentSceneName: string | null;
}): SceneFrameRecentEvent[] {
  const localRefs = new Set(
    [
      input.currentLocationId,
      input.currentSceneScopeId,
      input.currentSceneName?.toLowerCase(),
    ].filter((value): value is string => Boolean(value)),
  );
  const localLocationRef = input.currentSceneScopeId ?? input.currentLocationId;
  const locationEvents = localLocationRef
    ? listRecentLocationEvents({
        campaignId: input.campaignId,
        locationRef: localLocationRef,
        limit: SCENE_FRAME_RECENT_EVENT_LIMIT,
      }).map((event): SceneFrameRecentEvent => {
        const visibility = event.visibility ?? "player_perceivable";
        return {
          id: event.id,
          tick: event.tick,
          summary: event.summary,
          source: event.threadId ? "world_thread_signal" : "location_recent_event",
          actorIds: [],
          perceivableByPlayer:
            visibility === "player_perceivable" || visibility === "local_signal",
        };
      })
    : [];
  const pendingEvents = readPendingCommittedEvents(input.campaignId, input.tick)
    .filter((event) => {
      const location = event.location.trim();
      return (
        location.length === 0
        || localRefs.has(location)
        || localRefs.has(location.toLowerCase())
      );
    })
    .map((event): SceneFrameRecentEvent => ({
      id: event.id,
      tick: event.tick,
      summary: event.text,
      source: "committed_event",
      actorIds: [...event.participants],
      perceivableByPlayer: true,
    }));

  return [...locationEvents, ...pendingEvents].slice(0, SCENE_FRAME_RECENT_EVENT_LIMIT);
}

function collectMovementCandidates(input: {
  currentLocationId: string | null;
  currentTick: number;
  locationRows: LocationRow[];
  edgeRows: LocationEdgeRow[];
}): SceneFrameMovementCandidate[] {
  if (!input.currentLocationId) {
    return [];
  }

  const locationById = new Map(input.locationRows.map((location) => [location.id, location]));
  return input.edgeRows
    .filter((edge) => edge.fromLocationId === input.currentLocationId)
    .filter((edge) => edge.discovered)
    .map((edge): SceneFrameMovementCandidate | null => {
      const location = locationById.get(edge.toLocationId);
      if (!location || !locationIsVisibleNow(location, input.currentTick)) {
        return null;
      }
      return {
        id: edge.id,
        locationId: location.id,
        label: location.name,
        connected: true,
        travelCost: edge.travelCost,
        path: [input.currentLocationId!, location.id],
      };
    })
    .filter((candidate): candidate is SceneFrameMovementCandidate => candidate !== null)
    .sort((left, right) => {
      if ((left.travelCost ?? 0) !== (right.travelCost ?? 0)) {
        return (left.travelCost ?? 0) - (right.travelCost ?? 0);
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, SCENE_FRAME_MOVEMENT_CANDIDATE_LIMIT);
}

function collectTargetCandidates(input: {
  roster: SceneFrameRoster;
  itemRows: ItemRow[];
  movementCandidates: SceneFrameMovementCandidate[];
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
}): SceneFrameTargetCandidate[] {
  const sceneActorIds = new Set([
    ...input.roster.active.map((actor) => actor.id),
    ...input.roster.support.map((actor) => actor.id),
  ]);
  const visibleLocationIds = new Set(
    [input.currentLocationId, input.currentSceneScopeId].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const actorCandidates: SceneFrameTargetCandidate[] = [
    ...input.roster.active,
    ...input.roster.support,
  ].map((actor) => ({
    id: `actor:${actor.id}`,
    type: "actor",
    label: actor.awareness === "clear"
      ? actor.label
      : actor.awarenessHint ?? "Unidentified nearby presence",
    actorId: actor.id,
    locationId: actor.locationId,
    awareness: actor.awareness,
    tags: actor.tags ? [...actor.tags] : [],
  }));
  const itemCandidates = input.itemRows
    .filter(
      (item) =>
        (item.locationId != null && visibleLocationIds.has(item.locationId))
        || (item.ownerId != null && sceneActorIds.has(item.ownerId)),
    )
    .map((item): SceneFrameTargetCandidate => ({
      id: `item:${item.id}`,
      type: "item",
      label: item.name,
      itemId: item.id,
      locationId: item.locationId,
      tags: parseTags(item.tags),
    }));
  const locationCandidates = input.movementCandidates.map((candidate): SceneFrameTargetCandidate => ({
    id: `location:${candidate.locationId}`,
    type: "location",
    label: candidate.label,
    locationId: candidate.locationId,
    tags: [],
  }));

  return [...actorCandidates, ...itemCandidates, ...locationCandidates].slice(
    0,
    SCENE_FRAME_TARGET_CANDIDATE_LIMIT,
  );
}

function mapCandidateTypeToOracleType(
  candidate: SceneFrameTargetCandidate,
): SceneFrameOracleContext["targetType"] {
  switch (candidate.type) {
    case "actor":
      return "character";
    case "item":
      return "item";
    case "location":
      return "location/object";
    case "faction":
      return "faction";
  }
}

export function buildSceneFrameOracleContextForCandidate(
  candidate: SceneFrameTargetCandidate,
): SceneFrameOracleContext {
  return {
    targetLabel: candidate.label,
    targetType: mapCandidateTypeToOracleType(candidate),
    targetTags: [...(candidate.tags ?? [])],
    source: candidate.type === "location" ? "movement" : "parsed",
    fallbackReason: null,
    candidateId: candidate.id,
    actorId: candidate.actorId ?? null,
    itemId: candidate.itemId ?? null,
    locationId: candidate.locationId ?? null,
    factionId: candidate.factionId ?? null,
  };
}

export function buildSceneFrameCombatEnvelopeForConcreteTarget(input: {
  player: PlayerRow;
  npcRows: NpcRow[];
  targetActorId: string;
  hostileAction: boolean;
  actionText?: string;
}): CombatEnvelope | null {
  if (!input.hostileAction) {
    return null;
  }

  const targetNpc = input.npcRows.find((npc) => npc.id === input.targetActorId);
  if (!targetNpc) {
    return null;
  }

  const playerRecord = hydrateStoredPlayerRecord(input.player);
  const targetRecord = hydrateStoredNpcRecord(targetNpc);

  return buildCombatEnvelope({
    actor: {
      label: input.player.name,
      powerStats: playerRecord.powerStats,
    },
    target: {
      label: targetNpc.name,
      powerStats: targetRecord.powerStats,
    },
    hostileAction: true,
    actionText: input.actionText,
  });
}

function findLocationName(
  locationRows: LocationRow[],
  locationId: string | null,
): string | null {
  if (!locationId) {
    return null;
  }
  return locationRows.find((location) => location.id === locationId)?.name ?? null;
}

export async function buildSceneFrame(
  options: SceneFrameBuildOptions,
): Promise<SceneFrame> {
  if (options.roster && options.perception && options.playerActorId) {
    return normalizeFrame({
      campaignId: options.campaignId,
      tick: options.tick ?? readCampaignConfig(options.campaignId).currentTick ?? 0,
      playerActorId: options.playerActorId,
      currentLocationId: options.currentLocationId ?? null,
      currentSceneScopeId: options.currentSceneScopeId ?? null,
      currentLocationName: options.currentLocationName ?? null,
      currentSceneScopeName: options.currentSceneScopeName ?? null,
      playerAction: options.playerAction,
      roster: options.roster,
      perception: options.perception,
      recentEvents: options.recentEvents,
      targetCandidates: options.targetCandidates,
      movementCandidates: options.movementCandidates,
      deferredHooks: options.deferredHooks,
      allowedTools: options.allowedTools,
      oracleContext: options.oracleContext,
      combatEnvelope: options.combatEnvelope,
      oracle: options.oracle,
    });
  }

  const player = readPlayer(options.campaignId, options.playerActorId);
  const campaignConfig = readCampaignConfig(options.campaignId);
  const tick = options.tick ?? campaignConfig.currentTick ?? 0;
  const currentLocationId = options.currentLocationId ?? player.currentLocationId ?? null;
  const currentSceneScopeId = options.currentSceneScopeId ?? player.currentSceneLocationId ?? null;
  if (options.runActorExposureCatchup !== false) {
    resolveActorExposureCatchup({
      campaignId: options.campaignId,
      tick,
      playerLocationId: currentLocationId,
      playerSceneScopeId: currentSceneScopeId,
      elapsedWorldTimeMinutes: options.elapsedWorldTimeMinutes,
      phase: "pre_scene_frame",
    });
  }
  const npcRows = readRowsByCampaign<NpcRow>(options.campaignId, npcs);
  const locationRows = readRowsByCampaign<LocationRow>(options.campaignId, locations);
  const edgeRows = readRowsByCampaign<LocationEdgeRow>(options.campaignId, locationEdges);
  const itemRows = readRowsByCampaign<ItemRow>(options.campaignId, items);
  const currentLocationName = findLocationName(locationRows, currentLocationId);
  const currentSceneScopeName = findLocationName(locationRows, currentSceneScopeId);
  const { roster, perception } = buildRoster({
    player,
    npcRows,
    locationRows,
    currentLocationId,
    currentSceneScopeId,
  });
  const movementCandidates = collectMovementCandidates({
    currentLocationId,
    currentTick: tick,
    locationRows,
    edgeRows,
  });
  const targetCandidates = collectTargetCandidates({
    roster,
    itemRows,
    movementCandidates,
    currentLocationId,
    currentSceneScopeId,
  });
  const recentEvents = collectRecentEvents({
    campaignId: options.campaignId,
    tick,
    currentLocationId,
    currentSceneScopeId,
    currentSceneName: currentSceneScopeName,
  });

  return normalizeFrame({
    campaignId: options.campaignId,
    tick,
    playerActorId: player.id,
    currentLocationId,
    currentSceneScopeId,
    currentLocationName,
    currentSceneScopeName,
    playerAction: options.playerAction,
    roster,
    perception,
    recentEvents,
    targetCandidates,
    movementCandidates,
    deferredHooks: options.deferredHooks,
    allowedTools: options.allowedTools,
    oracleContext: options.oracleContext,
    combatEnvelope: options.combatEnvelope,
    oracle: options.oracle,
  });
}
