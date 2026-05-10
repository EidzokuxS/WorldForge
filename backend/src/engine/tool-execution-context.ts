import type { SceneFrame } from "./scene-frame.js";
import type { ActorFrame } from "./actor-frame.js";
import type { ToolResult } from "./tool-result.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import {
  buildBridgeLookupSnapshot,
  type BridgeKnownFactSnapshot,
  type BridgeLookupSnapshot,
} from "./bridge-candidate-tools.js";
import {
  isBridgeStateToolName,
  validateBridgeStateToolGrounding,
} from "./bridge-state-tools.js";
import { buildModelFacingScenePacket } from "./model-facing-scene.js";
import { listActorKnowledge } from "./knowledge-model.js";
import {
  readWorldClock,
  type AuthoritySourceEntity,
} from "./living-world-authority.js";

export type ToolExecutionScope = "player_turn" | "actor_turn" | "background";
export type SpawnNpcLocationRef = "current_scene" | "current_location";

export interface ToolExecutionContext {
  scope: ToolExecutionScope;
  subjectActorId?: string;
  subjectActorRefs: Set<string>;
  authority?: {
    baseWorldVersion: number;
    sourceEntity: AuthoritySourceEntity;
    elapsedWorldTimeMinutes?: number;
  };
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  legalLocationRefs: Set<string>;
  legalActorRefs: Set<string>;
  legalItemRefs: Set<string>;
  legalFactionRefs: Set<string>;
  currentLocationRefs: Set<string>;
  currentSceneRefs: Set<string>;
  legalMovementRefs: Set<string>;
  bridgeLookup?: BridgeLookupSnapshot;
}

export interface CreateActorTurnToolExecutionContextArgs {
  sceneFrame: SceneFrame;
  actorFrame: ActorFrame;
  baseWorldVersion: number;
  elapsedWorldTimeMinutes?: number;
}

export interface ToolGroundingIssue {
  code:
    | "remote_location_ref"
    | "ambiguous_entity_ref"
    | "hidden_actor_ref"
    | "unexposed_item_ref"
    | "unsupported_action_claim";
  path: string;
  message: string;
  toolName?: RuntimeToolName | string;
}

export function normalizeToolRef(value: string): string {
  return value.trim().toLowerCase();
}

function addRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    target.add(normalizeToolRef(trimmed));
  }
}

function collectSceneFrameActorRefs(frame: SceneFrame, actorId: string): Set<string> {
  const refs = new Set<string>();
  const actor = [
    ...frame.roster.active,
    ...frame.roster.support.filter((entry) => entry.awareness === "clear"),
  ].find((entry) => entry.id === actorId || entry.actorId === actorId);

  if (actor) {
    addRefs(refs, [actor.id, actor.actorId, actor.label]);
    return refs;
  }

  addRefs(refs, [actorId]);
  return refs;
}

export function createScenePlanActionToolExecutionContext(input: {
  context: ToolExecutionContext;
  frame: SceneFrame;
  actorId: string;
}): ToolExecutionContext {
  return {
    ...input.context,
    subjectActorId: input.actorId,
    subjectActorRefs: collectSceneFrameActorRefs(input.frame, input.actorId),
  };
}

function hasRef(refs: ReadonlySet<string>, value: unknown): boolean {
  return typeof value === "string" && refs.has(normalizeToolRef(value));
}

function readResultString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim().length > 0
    ? field.trim()
    : null;
}

function scopedIssue(
  code: ToolGroundingIssue["code"],
  path: string,
  message: string,
): ToolGroundingIssue {
  return { code, path, message };
}

function requireRef(input: {
  value: unknown;
  refs: ReadonlySet<string>;
  path: string;
  description: string;
  code: ToolGroundingIssue["code"];
}): ToolGroundingIssue | null {
  if (typeof input.value !== "string") return null;
  if (hasRef(input.refs, input.value)) return null;

  return scopedIssue(
    input.code,
    input.path,
    `${input.path} must reference ${input.description}; got an out-of-scope ref.`,
  );
}

function mergeSets(...sets: ReadonlySet<string>[]): Set<string> {
  const merged = new Set<string>();
  for (const set of sets) {
    for (const value of set) {
      merged.add(value);
    }
  }
  return merged;
}

function buildPlayerTurnAuthority(frame: SceneFrame): ToolExecutionContext["authority"] {
  try {
    const clock = readWorldClock(frame.campaignId);
    return {
      baseWorldVersion: clock.worldVersion,
      sourceEntity: {
        type: "player",
        id: frame.playerActorId,
      },
      elapsedWorldTimeMinutes: 1,
    };
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes("Database not connected")
    ) {
      return undefined;
    }
    throw error;
  }
}

function readPlayerKnownFacts(
  frame: SceneFrame,
  worldVersion?: number | null,
): BridgeKnownFactSnapshot[] {
  try {
    return listActorKnowledge({
      campaignId: frame.campaignId,
      actorId: frame.playerActorId,
      worldVersion,
      limit: 12,
    }).map((record): BridgeKnownFactSnapshot => ({
      id: `knowledge:${record.id}`,
      summary: `${record.truthStatus}: ${record.statement}`,
      visibilityRoute: "player_known",
      confidence: Math.max(0, Math.min(1, record.confidence / 100)),
      sourceRefs: [
        record.id,
        ...record.sourceEventIds,
        ...record.sourceKnowledgeIds,
        ...record.authorityTraceIds,
      ],
    }));
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes("Database not connected")
    ) {
      return [];
    }
    throw error;
  }
}

export function createPlayerTurnToolExecutionContext(frame: SceneFrame): ToolExecutionContext {
  const subjectActorRefs = new Set<string>();
  const legalActorRefs = new Set<string>();
  const legalItemRefs = new Set<string>();
  const legalFactionRefs = new Set<string>();
  const legalLocationRefs = new Set<string>();
  const currentLocationRefs = new Set<string>();
  const currentSceneRefs = new Set<string>();
  const legalMovementRefs = new Set<string>();

  const clearActors = [
    ...frame.roster.active,
    ...frame.roster.support.filter((actor) => actor.awareness === "clear"),
  ];
  for (const actor of clearActors) {
    addRefs(legalActorRefs, [actor.id, actor.actorId, actor.label]);
    if (actor.id === frame.playerActorId || actor.actorId === frame.playerActorId) {
      addRefs(subjectActorRefs, [actor.id, actor.actorId, actor.label]);
    }
  }
  addRefs(subjectActorRefs, [frame.playerActorId]);

  addRefs(currentLocationRefs, [
    frame.currentLocationId,
    frame.currentLocationName,
    "current_location",
  ]);
  addRefs(currentSceneRefs, [
    frame.currentSceneScopeId,
    frame.currentSceneScopeName,
    "current_scene",
  ]);
  addRefs(legalLocationRefs, [
    frame.currentLocationId,
    frame.currentLocationName,
    frame.currentSceneScopeId,
    frame.currentSceneScopeName,
    "current_location",
    "current_scene",
  ]);

  for (const candidate of frame.movementCandidates.filter((entry) => entry.connected)) {
    addRefs(legalLocationRefs, [candidate.id, candidate.locationId, candidate.label]);
    addRefs(legalMovementRefs, [candidate.id, candidate.locationId, candidate.label]);
  }

  for (const candidate of frame.targetCandidates) {
    switch (candidate.type) {
      case "actor":
        addRefs(legalActorRefs, [candidate.id, candidate.actorId, candidate.label]);
        break;
      case "item":
        addRefs(legalItemRefs, [candidate.id, candidate.itemId, candidate.label]);
        break;
      case "location":
        addRefs(legalLocationRefs, [candidate.id, candidate.locationId, candidate.label]);
        break;
      case "faction":
        addRefs(legalFactionRefs, [candidate.id, candidate.factionId, candidate.label]);
        break;
    }
  }

  const authority = buildPlayerTurnAuthority(frame);
  const bridgeLookup = buildBridgeLookupSnapshot({
    frame,
    packet: buildModelFacingScenePacket(frame),
    playerKnownFacts: readPlayerKnownFacts(frame, authority?.baseWorldVersion),
  });

  return {
    scope: "player_turn",
    subjectActorId: frame.playerActorId,
    subjectActorRefs,
    authority,
    currentLocationId: frame.currentLocationId,
    currentSceneScopeId: frame.currentSceneScopeId,
    legalLocationRefs,
    legalActorRefs,
    legalItemRefs,
    legalFactionRefs,
    currentLocationRefs,
    currentSceneRefs,
    legalMovementRefs,
    bridgeLookup,
  };
}

export function createActorTurnToolExecutionContext(
  args: CreateActorTurnToolExecutionContextArgs,
): ToolExecutionContext {
  const { sceneFrame, actorFrame } = args;
  const subjectActorRefs = new Set<string>();
  const legalActorRefs = new Set<string>();
  const legalItemRefs = new Set<string>();
  const legalFactionRefs = new Set<string>();
  const legalLocationRefs = new Set<string>();
  const currentLocationRefs = new Set<string>();
  const currentSceneRefs = new Set<string>();
  const legalMovementRefs = new Set<string>();

  addRefs(legalActorRefs, [
    actorFrame.observer.id,
    actorFrame.observer.actorId,
    actorFrame.observer.label,
  ]);
  addRefs(subjectActorRefs, [
    actorFrame.observer.id,
    actorFrame.observer.actorId,
    actorFrame.observer.label,
  ]);

  const clearActors = [
    ...sceneFrame.roster.active,
    ...sceneFrame.roster.support.filter((actor) => actor.awareness === "clear"),
  ];
  for (const actor of clearActors) {
    addRefs(legalActorRefs, [actor.id, actor.actorId, actor.label]);
  }

  addRefs(currentLocationRefs, [
    actorFrame.observer.locationId,
    sceneFrame.currentLocationName,
    "current_location",
  ]);
  addRefs(currentSceneRefs, [
    actorFrame.observer.sceneScopeId,
    sceneFrame.currentSceneScopeName,
    "current_scene",
  ]);
  addRefs(legalLocationRefs, [
    actorFrame.observer.locationId,
    actorFrame.observer.sceneScopeId,
    sceneFrame.currentLocationName,
    sceneFrame.currentSceneScopeName,
    "current_location",
    "current_scene",
  ]);

  for (const candidate of sceneFrame.movementCandidates.filter((entry) => entry.connected)) {
    addRefs(legalLocationRefs, [candidate.id, candidate.locationId, candidate.label]);
    addRefs(legalMovementRefs, [candidate.id, candidate.locationId, candidate.label]);
  }

  for (const candidate of sceneFrame.targetCandidates) {
    switch (candidate.type) {
      case "actor":
        addRefs(legalActorRefs, [candidate.id, candidate.actorId, candidate.label]);
        break;
      case "item":
        addRefs(legalItemRefs, [candidate.id, candidate.itemId, candidate.label]);
        break;
      case "location":
        addRefs(legalLocationRefs, [candidate.id, candidate.locationId, candidate.label]);
        break;
      case "faction":
        addRefs(legalFactionRefs, [candidate.id, candidate.factionId, candidate.label]);
        break;
    }
  }

  const bridgeLookup = buildBridgeLookupSnapshot({
    frame: sceneFrame,
    packet: buildModelFacingScenePacket(sceneFrame),
  });

  return {
    scope: "actor_turn",
    subjectActorId: actorFrame.observer.actorId,
    subjectActorRefs,
    authority: {
      baseWorldVersion: args.baseWorldVersion,
      sourceEntity: {
        type: "npc",
        id: actorFrame.observer.actorId,
      },
      elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes ?? 1,
    },
    currentLocationId: actorFrame.observer.locationId,
    currentSceneScopeId: actorFrame.observer.sceneScopeId,
    legalLocationRefs,
    legalActorRefs,
    legalItemRefs,
    legalFactionRefs,
    currentLocationRefs,
    currentSceneRefs,
    legalMovementRefs,
    bridgeLookup,
  };
}

export function applySuccessfulToolObservationToExecutionContext(input: {
  toolName: RuntimeToolName;
  result: ToolResult;
  context: ToolExecutionContext;
}): void {
  if (!input.result.success) {
    return;
  }
  if (
    input.context.authority
    && typeof input.result.authority?.resultWorldVersion === "number"
  ) {
    input.context.authority.baseWorldVersion =
      input.result.authority.resultWorldVersion;
  }

  const payload = input.result.result;
  const id = readResultString(payload, "id")
    ?? readResultString(payload, "locationId")
    ?? readResultString(payload, "npcId");
  const name = readResultString(payload, "name")
    ?? readResultString(payload, "locationName");

  switch (input.toolName) {
    case "advance_time":
      if (input.context.authority) {
        input.context.authority.elapsedWorldTimeMinutes = 0;
      }
      break;
    case "reveal_location":
      addRefs(input.context.legalLocationRefs, [id, name]);
      addRefs(input.context.legalMovementRefs, [id, name]);
      break;
    case "move_to":
    case "move_actor":
      if (!id) return;
      input.context.currentLocationId = id;
      input.context.currentSceneScopeId = id;
      input.context.currentLocationRefs.clear();
      input.context.currentSceneRefs.clear();
      addRefs(input.context.currentLocationRefs, ["current_location", id, name]);
      addRefs(input.context.currentSceneRefs, ["current_scene", id, name]);
      addRefs(input.context.legalLocationRefs, [id, name]);
      addRefs(input.context.legalMovementRefs, [id, name]);
      break;
    case "spawn_npc":
    case "create_scene_extra":
      addRefs(input.context.legalActorRefs, [id, name]);
      break;
    case "create_minor_poi":
      addRefs(input.context.legalLocationRefs, [id, name]);
      addRefs(input.context.legalMovementRefs, [id, name]);
      break;
    case "spawn_item":
      addRefs(input.context.legalItemRefs, [id, name]);
      break;
  }
}

function validateSpawnNpcGrounding(
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  pathPrefix: string,
): ToolGroundingIssue | null {
  const selectorCount = [
    typeof input.locationRef === "string",
    typeof input.locationId === "string",
    typeof input.locationName === "string",
  ].filter(Boolean).length;
  if (selectorCount === 0) {
    return scopedIssue(
      "remote_location_ref",
      `${pathPrefix}.locationRef`,
      "spawn_npc requires locationRef, locationId, or legacy locationName.",
    );
  }

  if (typeof input.locationRef === "string") {
    if (input.locationRef !== "current_scene" && input.locationRef !== "current_location") {
      return scopedIssue(
        "remote_location_ref",
        `${pathPrefix}.locationRef`,
        "locationRef must be current_scene or current_location.",
      );
    }
    if (input.locationRef === "current_scene" && !context.currentSceneScopeId) {
      return scopedIssue(
        "remote_location_ref",
        `${pathPrefix}.locationRef`,
        "current_scene is not available for this turn.",
      );
    }
    if (input.locationRef === "current_location" && !context.currentLocationId) {
      return scopedIssue(
        "remote_location_ref",
        `${pathPrefix}.locationRef`,
        "current_location is not available for this turn.",
      );
    }
  }

  const locationIdIssue = requireRef({
    value: input.locationId,
    refs: context.legalLocationRefs,
    path: `${pathPrefix}.locationId`,
    description: "a backend-approved local location ref",
    code: "remote_location_ref",
  });
  if (locationIdIssue) return locationIdIssue;

  if (typeof input.locationName === "string" && context.scope !== "background") {
    const localRefs = mergeSets(context.currentLocationRefs, context.currentSceneRefs);
    return requireRef({
      value: input.locationName,
      refs: localRefs,
      path: `${pathPrefix}.locationName`,
      description: "the current scene/current location only; use locationRef for player-turn spawns",
      code: "remote_location_ref",
    });
  }

  return null;
}

function textHasUnsupportedActionClaim(text: string): boolean {
  const normalized = text.toLowerCase();
  if (
    /\b(?:no|not|without|lacks|lack|does not|doesn't|cannot|can't|fails to|failed to|tries to|attempts to|claims?)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  const completionVerb =
    /\b(?:take|takes|took|taken|grab|grabs|receive|receives|received|gain|gains|got|gets|pocket|pockets|carry|carries|has|have|had|use|uses|used|unlock|unlocks|unlocked|open|opens|opened|enter|enters|entered)\b/;
  const backendOwnedObject =
    /\b(?:key|token|permit|badge|pass|letter|message|seal|door|gate|vault|lock|room|hall|chamber|item|weapon|coin|chit)\b/;

  return completionVerb.test(normalized) && backendOwnedObject.test(normalized);
}

function validateLogEventGrounding(
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  pathPrefix: string,
): ToolGroundingIssue | null {
  const participants = Array.isArray(input.participants) ? input.participants : [];
  for (const [index, participant] of participants.entries()) {
    const participantIssue = requireRef({
      value: participant,
      refs: context.legalActorRefs,
      path: `${pathPrefix}.participants.${index}`,
      description: "a clear local actor participant",
      code: "hidden_actor_ref",
    });
    if (participantIssue) return participantIssue;
  }

  if (input.durability !== "durable") {
    return null;
  }

  const textParts = [input.text, input.futureRelevance].filter(
    (value): value is string => typeof value === "string",
  );
  if (textParts.some(textHasUnsupportedActionClaim)) {
    return scopedIssue(
      "unsupported_action_claim",
      `${pathPrefix}.text`,
      "player-turn durable log_event cannot commit possession, access, item-use, or completed movement claims; use a concrete backend tool result or record the attempted/failed beat as scene_local.",
    );
  }

  return null;
}

function validateTagGrounding(
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  pathPrefix: string,
): ToolGroundingIssue | null {
  if (context.scope !== "player_turn" || typeof input.tag !== "string") {
    return null;
  }

  const tagText = input.tag.replace(/[-_]/g, " ");
  if (!textHasUnsupportedActionClaim(tagText)) {
    return null;
  }

  return scopedIssue(
    "unsupported_action_claim",
    `${pathPrefix}.tag`,
    "player-turn tags cannot commit possession, access, item-use, or completed movement claims; use concrete backend tools/state or keep the beat as narration without durable state.",
  );
}

export function validateToolInputGrounding(input: {
  toolName: RuntimeToolName | string;
  toolInput: Record<string, unknown>;
  context: ToolExecutionContext;
  subjectActorRefs?: ReadonlySet<string>;
  pathPrefix?: string;
}): ToolGroundingIssue | null {
  const path = input.pathPrefix ?? "input";
  const toolInput = input.toolInput;

  if (input.context.scope === "background") {
    return null;
  }

  switch (input.toolName) {
    case "move_actor":
    case "create_minor_poi":
    case "create_scene_extra":
    case "start_search":
    case "record_player_intent": {
      if (!isBridgeStateToolName(input.toolName)) return null;
      const issue = validateBridgeStateToolGrounding({
        toolName: input.toolName,
        toolInput,
        context: input.context,
        pathPrefix: path,
      });
      return issue ? { ...issue } : null;
    }
    case "log_event":
      return validateLogEventGrounding(toolInput, input.context, path);
    case "spawn_npc":
      return validateSpawnNpcGrounding(toolInput, input.context, path);
    case "promote_npc":
      return requireRef({
        value: toolInput.npcRef,
        refs: input.context.legalActorRefs,
        path: `${path}.npcRef`,
        description: "a clear local NPC actor",
        code: "hidden_actor_ref",
      });
    case "reveal_location":
      return requireRef({
        value: toolInput.connectedToName,
        refs: input.context.legalLocationRefs,
        path: `${path}.connectedToName`,
        description: "a local/current location anchor",
        code: "remote_location_ref",
      });
    case "move_to":
      return requireRef({
        value: toolInput.targetLocationName,
        refs: input.context.legalMovementRefs,
        path: `${path}.targetLocationName`,
        description: "a connected movement candidate",
        code: "remote_location_ref",
      });
    case "request_contested_outcome":
      return (
        requireRef({
          value: toolInput.actorName,
          refs: input.subjectActorRefs ?? input.context.subjectActorRefs,
          path: `${path}.actorName`,
          description: "the actor currently allowed to request this contest",
          code: "hidden_actor_ref",
        })
        ?? requireRef({
          value: toolInput.targetName,
          refs: input.context.legalActorRefs,
          path: `${path}.targetName`,
          description: "a clear local actor",
          code: "hidden_actor_ref",
        })
      );
    case "spawn_item":
      if (toolInput.ownerType === "location") {
        return requireRef({
          value: toolInput.ownerName,
          refs: input.context.legalLocationRefs,
          path: `${path}.ownerName`,
          description: "a local/current location ref",
          code: "remote_location_ref",
        });
      }
      if (toolInput.ownerType === "character") {
        return requireRef({
          value: toolInput.ownerName,
          refs: input.context.legalActorRefs,
          path: `${path}.ownerName`,
          description: "a clear local actor",
          code: "hidden_actor_ref",
        });
      }
      return null;
    case "transfer_item": {
      const itemIssue = requireRef({
        value: toolInput.itemName,
        refs: input.context.legalItemRefs,
        path: `${path}.itemName`,
        description: "a visible/local item ref",
        code: "unexposed_item_ref",
      });
      if (itemIssue) return itemIssue;
      if (toolInput.targetType === "location") {
        return requireRef({
          value: toolInput.targetName,
          refs: input.context.legalLocationRefs,
          path: `${path}.targetName`,
          description: "a local/current location ref",
          code: "remote_location_ref",
        });
      }
      if (toolInput.targetType === "character") {
        return requireRef({
          value: toolInput.targetName,
          refs: input.context.legalActorRefs,
          path: `${path}.targetName`,
          description: "a clear local actor",
          code: "hidden_actor_ref",
        });
      }
      return null;
    }
    case "add_tag":
    case "remove_tag": {
      const tagIssue = validateTagGrounding(toolInput, input.context, path);
      if (tagIssue) return tagIssue;

      if (toolInput.entityType === "location") {
        return requireRef({
          value: toolInput.entityName,
          refs: input.context.legalLocationRefs,
          path: `${path}.entityName`,
          description: "a local/current location ref",
          code: "remote_location_ref",
        });
      }
      if (toolInput.entityType === "item") {
        return requireRef({
          value: toolInput.entityName,
          refs: input.context.legalItemRefs,
          path: `${path}.entityName`,
          description: "a visible/local item ref",
          code: "unexposed_item_ref",
        });
      }
      if (toolInput.entityType === "faction") {
        return requireRef({
          value: toolInput.entityName,
          refs: input.context.legalFactionRefs,
          path: `${path}.entityName`,
          description: "an exposed faction ref",
          code: "ambiguous_entity_ref",
        });
      }
      return requireRef({
        value: toolInput.entityName,
        refs: input.context.legalActorRefs,
        path: `${path}.entityName`,
        description: "a clear local actor",
        code: "hidden_actor_ref",
      });
    }
    case "set_relationship": {
      const legalEntityRefs = mergeSets(
        input.context.legalActorRefs,
        input.context.legalLocationRefs,
        input.context.legalItemRefs,
        input.context.legalFactionRefs,
      );
      return (
        requireRef({
          value: toolInput.entityA,
          refs: legalEntityRefs,
          path: `${path}.entityA`,
          description: "an exposed local entity ref",
          code: "ambiguous_entity_ref",
        })
        ?? requireRef({
          value: toolInput.entityB,
          refs: legalEntityRefs,
          path: `${path}.entityB`,
          description: "an exposed local entity ref",
          code: "ambiguous_entity_ref",
        })
      );
    }
    case "set_condition":
      return requireRef({
        value: toolInput.targetName,
        refs: input.context.legalActorRefs,
        path: `${path}.targetName`,
        description: "a clear local actor",
        code: "hidden_actor_ref",
      });
    default:
      return null;
  }
}

export function validateToolPlanGrounding(input: {
  actions: ReadonlyArray<{
    id: string;
    actorId?: string;
    toolName: RuntimeToolName | string;
    input: unknown;
  }>;
  context: ToolExecutionContext;
  contextForAction?: (action: {
    id: string;
    actorId?: string;
    toolName: RuntimeToolName | string;
    input: unknown;
  }) => ToolExecutionContext;
}): ToolGroundingIssue[] {
  const issues: ToolGroundingIssue[] = [];

  for (const action of input.actions) {
    if (!action.input || typeof action.input !== "object" || Array.isArray(action.input)) {
      continue;
    }
    const context = input.contextForAction?.(action) ?? input.context;
    const issue = validateToolInputGrounding({
      toolName: action.toolName,
      toolInput: action.input as Record<string, unknown>,
      context,
      pathPrefix: `plannedActions.${action.id}.input`,
    });
    if (issue) {
      issues.push({ ...issue, toolName: action.toolName });
    }
  }

  return issues;
}
