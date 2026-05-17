import type { SceneFrame } from "./scene-frame.js";
import type { ActorFrame } from "./actor-frame.js";
import {
  canonicalAuthorityRef,
  canonicalEventRef,
  canonicalKnowledgeRef,
  uniqueModelRefs,
  toModelSafeRefs,
  type ModelSafeRef,
} from "./ref-provenance.js";
import {
  inferRefsFromToolResultPayload,
  isObservationToolResult,
  type ToolResult,
} from "./tool-result.js";
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
import {
  buildModelFacingScenePacket,
  isUnsafeModelFacingRef,
} from "./model-facing-scene.js";
import { listActorKnowledge } from "./knowledge-model.js";
import {
  readWorldClock,
  type AuthoritySourceEntity,
} from "./living-world-authority.js";
import {
  isRuntimeToolName,
  runtimeToolRequiresExecutionAuthority,
} from "./tool-contracts.js";

export type ToolExecutionScope = "player_turn" | "actor_turn" | "background";
export type SpawnNpcLocationRef = "current_scene" | "current_location";

export interface ToolExecutionContext {
  scope: ToolExecutionScope;
  subjectActorId?: string;
  subjectActorRefs: Set<string>;
  addressedTarget?: DialogueAddressedTarget;
  authority?: {
    baseWorldVersion: number;
    sourceEntity: AuthoritySourceEntity;
    elapsedWorldTimeMinutes?: number;
    toolResultId?: string;
    allowedWriteScopes?: readonly string[];
    metadata?: Record<string, unknown>;
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
  sameTurnResultRefs?: Set<string>;
  sameTurnModelSafeRefs?: ModelSafeRef[];
  backendOnlyRefs?: Set<string>;
  bridgeLookup?: BridgeLookupSnapshot;
}

export type DialogueAddressedTarget =
  | {
      kind: "none";
    }
  | {
      kind: "visible_ref";
      ref: string;
      refs: Set<string>;
    }
  | {
      kind: "prose_role";
      roleText: string;
      matchedActorRefs: Set<string>;
      createdActorRefs: Set<string>;
    }
  | {
      kind: "no_visible_authority";
      roleText: string;
    };

export interface CreateActorTurnToolExecutionContextArgs {
  sceneFrame: SceneFrame;
  actorFrame: ActorFrame;
  baseWorldVersion: number;
  elapsedWorldTimeMinutes?: number;
}

export interface CreateBackgroundToolExecutionContextArgs {
  campaignId: string;
  sourceEntity: AuthoritySourceEntity;
  baseWorldVersion?: number;
  elapsedWorldTimeMinutes?: number;
  toolResultId?: string;
  allowedWriteScopes?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface CreatePlayerTurnToolExecutionContextArgs {
  frame: SceneFrame;
  addressedTarget?: DialogueAddressedTargetInput | null;
}

export type DialogueAddressedTargetInput =
  | {
      kind: "none";
    }
  | {
      kind: "visible_ref";
      ref: string;
    }
  | {
      kind: "prose_role";
      roleText: string;
    }
  | {
      kind: "no_visible_authority";
      roleText: string;
    };

export interface ToolGroundingIssue {
  code:
    | "remote_location_ref"
    | "ambiguous_entity_ref"
    | "hidden_actor_ref"
    | "unexposed_item_ref"
    | "unsupported_action_claim"
    | "invalid_speaker_ref"
    | "invalid_source_ref"
    | "invalid_durability"
    | "addressed_target_mismatch"
    | "missing_structural_claim"
    | "missing_background_authority"
    | "missing_background_write_scope";
  path: string;
  message: string;
  toolName?: RuntimeToolName | string;
  invalidRef?: string;
  refHints?: string[];
}

export function normalizeToolRef(value: string): string {
  return value.trim().toLowerCase();
}

const PLAYER_MODEL_SAFE_REFS = ["Player", "current_player"];

function addRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    target.add(normalizeToolRef(trimmed));
  }
}

function addBackendOnlyRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    target.add(normalizeToolRef(trimmed));
  }
}

function addActorScopedRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    addRefs(target, [trimmed, trimmed.startsWith("actor:") ? trimmed : `actor:${trimmed}`]);
  }
}

function addLocationScopedRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const unprefixed = trimmed.startsWith("location:")
      ? trimmed.slice("location:".length)
      : trimmed;
    addRefs(target, [unprefixed, `location:${unprefixed}`]);
  }
}

function addItemScopedRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const unprefixed = trimmed.startsWith("item:")
      ? trimmed.slice("item:".length)
      : trimmed;
    addRefs(target, [unprefixed, `item:${unprefixed}`]);
  }
}

function collectSceneFrameActorRefs(frame: SceneFrame, actorId: string): Set<string> {
  const refs = new Set<string>();
  const actor = [
    ...frame.roster.active,
    ...frame.roster.support.filter((entry) => entry.awareness === "clear"),
  ].find((entry) => entry.id === actorId || entry.actorId === actorId);

  if (actor) {
    addActorScopedRefs(refs, [actor.id, actor.actorId]);
    addRefs(refs, [actor.label]);
    return refs;
  }

  addActorScopedRefs(refs, [actorId]);
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

function normalizeAddressedRoleText(value: string): string {
  let normalized = "";
  let pendingSpace = false;
  for (const char of value.trim().toLowerCase()) {
    if (char.trim() === "") {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace) {
      normalized += " ";
      pendingSpace = false;
    }
    normalized += char;
  }
  return normalized;
}

function addressedRoleMatchesExistingActorLabel(roleText: string, actorLabel: string): boolean {
  const role = normalizeAddressedRoleText(roleText);
  const label = normalizeAddressedRoleText(actorLabel);
  return Boolean(role)
    && Boolean(label)
    && (
      role === label
      || label.endsWith(` ${role}`)
      || role.endsWith(` ${label}`)
    );
}

function collectVisibleActorRefsForRef(
  frame: SceneFrame,
  legalActorRefs: ReadonlySet<string>,
  ref: string,
): Set<string> {
  const normalizedRef = normalizeToolRef(ref);
  const matchedRefs = new Set<string>();
  const clearActors = [
    ...frame.roster.active,
    ...frame.roster.support.filter((actor) => actor.awareness === "clear"),
  ];
  for (const actor of clearActors) {
    const candidateRefs = [
      actor.id,
      actor.actorId,
      actor.label,
      `actor:${actor.id}`,
      `actor:${actor.actorId}`,
    ].filter((candidateRef): candidateRef is string =>
      typeof candidateRef === "string" && candidateRef.trim().length > 0);
    if (!candidateRefs.some((candidateRef) => normalizeToolRef(candidateRef) === normalizedRef)) {
      continue;
    }
    for (const candidateRef of candidateRefs) {
      const normalized = normalizeToolRef(candidateRef);
      if (legalActorRefs.has(normalized)) matchedRefs.add(normalized);
    }
  }
  if (legalActorRefs.has(normalizedRef)) {
    matchedRefs.add(normalizedRef);
  }
  return matchedRefs;
}

function buildDialogueAddressedTarget(
  input: DialogueAddressedTargetInput | null | undefined,
  frame: SceneFrame,
  legalActorRefs: ReadonlySet<string>,
): DialogueAddressedTarget {
  if (!input || input.kind === "none") {
    return { kind: "none" };
  }
  if (input.kind === "visible_ref") {
    return {
      kind: "visible_ref",
      ref: normalizeToolRef(input.ref),
      refs: collectVisibleActorRefsForRef(frame, legalActorRefs, input.ref),
    };
  }
  if (input.kind === "no_visible_authority") {
    return {
      kind: "no_visible_authority",
      roleText: input.roleText.trim(),
    };
  }

  const matchedActorRefs = new Set<string>();
  const clearActors = [
    ...frame.roster.active,
    ...frame.roster.support.filter((actor) => actor.awareness === "clear"),
  ];
  for (const actor of clearActors) {
    if (!addressedRoleMatchesExistingActorLabel(input.roleText, actor.label)) continue;
    for (const ref of [actor.id, actor.actorId, actor.label].filter((candidateRef): candidateRef is string =>
      typeof candidateRef === "string" && candidateRef.trim().length > 0)) {
      const normalized = normalizeToolRef(ref);
      if (legalActorRefs.has(normalized)) matchedActorRefs.add(normalized);
      const actorScoped = `actor:${normalized}`;
      if (legalActorRefs.has(actorScoped)) matchedActorRefs.add(actorScoped);
    }
  }

  return {
    kind: "prose_role",
    roleText: input.roleText.trim(),
    matchedActorRefs,
    createdActorRefs: new Set<string>(),
  };
}

function startsWithSupportBackendRef(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (!lower.startsWith("support-") && !lower.startsWith("support_")) return false;
  const markerLength = "support-".length;
  const next = lower.charCodeAt(markerLength);
  return (
    (next >= 48 && next <= 57)
    || (next >= 97 && next <= 122)
  );
}

function isModelFacingRefHint(
  value: string,
  backendOnlyRefs?: ReadonlySet<string>,
): boolean {
  const ref = value.trim();
  if (!ref) return false;
  if (backendOnlyRefs?.has(normalizeToolRef(ref))) return false;
  return !isUnsafeModelFacingRef(ref) && !startsWithSupportBackendRef(ref);
}

function modelFacingRefHints(
  refs: ReadonlySet<string>,
  backendOnlyRefs?: ReadonlySet<string>,
): string[] {
  return [...refs]
    .filter((ref) => isModelFacingRefHint(ref, backendOnlyRefs))
    .slice(0, 16);
}

function strictModelFacingRefs(context: ToolExecutionContext): boolean {
  return context.scope === "player_turn";
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

function resultPayloadMatchesAddressedRole(
  payload: unknown,
  roleText: string,
): boolean {
  const candidateTexts = [
    readResultString(payload, "requestedRoleText"),
    readResultString(payload, "roleText"),
    readResultString(payload, "role"),
    readResultString(payload, "name"),
  ];
  return candidateTexts.some((candidateText) =>
    candidateText !== null && addressedRoleMatchesExistingActorLabel(roleText, candidateText));
}

function normalizedTextContainsPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeAddressedRoleText(text);
  const normalizedPhrase = normalizeAddressedRoleText(phrase);
  return Boolean(normalizedText)
    && Boolean(normalizedPhrase)
    && normalizedText.includes(normalizedPhrase);
}

function toolInputMatchesAddressedRole(
  toolInput: unknown,
  roleText: string,
): boolean {
  if (!toolInput || typeof toolInput !== "object" || Array.isArray(toolInput)) return false;
  const input = toolInput as Record<string, unknown>;
  const candidateTexts = [
    readResultString(input, "requestedRoleText"),
    readResultString(input, "roleText"),
    readResultString(input, "role"),
    readResultString(input, "name"),
  ];
  const directMatch = candidateTexts.some((candidateText) =>
    candidateText !== null && addressedRoleMatchesExistingActorLabel(roleText, candidateText));
  if (directMatch) return true;

  const tags = input.tags;
  if (Array.isArray(tags) && tags.some((tag) =>
    typeof tag === "string" && addressedRoleMatchesExistingActorLabel(roleText, tag))) {
    return true;
  }

  const reason = readResultString(input, "reason");
  return reason !== null && normalizedTextContainsPhrase(reason, roleText);
}

function addCreatedActorRefsForAddressedTarget(input: {
  context: ToolExecutionContext;
  toolName: RuntimeToolName;
  toolInput?: Record<string, unknown>;
  payload: unknown;
  id: string | null;
  actorId: string | null;
  name: string | null;
}): void {
  const target = input.context.addressedTarget;
  if (!target || target.kind !== "prose_role") return;
  if (
    !resultPayloadMatchesAddressedRole(input.payload, target.roleText)
    && !(
      input.toolName === "create_scene_extra"
      && toolInputMatchesAddressedRole(input.toolInput, target.roleText)
    )
  ) {
    return;
  }

  for (const ref of [
    input.id,
    input.actorId,
    input.name,
    input.id ? `actor:${input.id}` : null,
    input.actorId ? `actor:${input.actorId}` : null,
  ]) {
    if (!ref) continue;
    const normalized = normalizeToolRef(ref);
    if (input.context.legalActorRefs.has(normalized)) {
      target.createdActorRefs.add(normalized);
    }
  }
}

function sameTurnResultRefs(context: ToolExecutionContext): Set<string> {
  context.sameTurnResultRefs ??= new Set<string>();
  return context.sameTurnResultRefs;
}

function addSameTurnToolResultRefs(
  context: ToolExecutionContext,
  toolName: RuntimeToolName,
  result: ToolResult,
): void {
  if (isObservationToolResult(result)) {
    const refs = result.modelSafeRefs ?? [];
    if (refs.length === 0) return;
    const consumableBy: RuntimeToolName[] = ["record_dialogue_outcome", "record_world_fact"];
    if (toolName === "check_route") {
      consumableBy.push("move_actor");
    }
    context.sameTurnModelSafeRefs = [
      ...(context.sameTurnModelSafeRefs ?? []),
      ...toModelSafeRefs({
        refs,
        provenance: "same-turn successful helper observation",
        sourceTool: toolName,
        consumableBy,
      }),
    ];
    return;
  }

  const authority = result.authority;
  addRefs(sameTurnResultRefs(context), [
    authority?.toolResultId,
    ...(authority?.stateDeltaRefs ?? []),
    ...(authority?.eventRefs ?? []),
    ...(authority?.witnesses ?? []),
    ...(authority?.knowledgeOutputs ?? []),
    ...(authority?.visibilityOutputs ?? []),
    ...(authority?.resources ?? []),
    ...inferRefsFromToolResultPayload(result.result),
  ]);
}

function sameTurnRefsConsumableBy(
  context: ToolExecutionContext,
  toolName: RuntimeToolName,
): Set<string> {
  const refs = new Set<string>();
  for (const ref of context.sameTurnModelSafeRefs ?? []) {
    if (ref.consumableBy && !ref.consumableBy.includes(toolName)) continue;
    addRefs(refs, [ref.token, ...ref.aliases]);
  }
  return refs;
}

function scopedIssue(
  code: ToolGroundingIssue["code"],
  path: string,
  message: string,
  invalidRef?: string,
  refHints?: string[],
): ToolGroundingIssue {
  return { code, path, message, invalidRef, refHints };
}

function requireRef(input: {
  value: unknown;
  refs: ReadonlySet<string>;
  path: string;
  description: string;
  code: ToolGroundingIssue["code"];
  enforceModelFacingRefSafety?: boolean;
  backendOnlyRefs?: ReadonlySet<string>;
}): ToolGroundingIssue | null {
  if (typeof input.value !== "string") return null;
  const usesBackendOnlyRef = input.enforceModelFacingRefSafety
    && (
      isUnsafeModelFacingRef(input.value)
      || input.backendOnlyRefs?.has(normalizeToolRef(input.value))
    );
  if (usesBackendOnlyRef) {
    const refHints = modelFacingRefHints(input.refs, input.backendOnlyRefs);
    return scopedIssue(
      input.code,
      input.path,
      `${input.path} uses a backend-only ref. Use a visible label, current_scene/current_location, or a short helper alias. Examples: ${refHints.join(", ") || "none"}.`,
      input.value,
      refHints,
    );
  }
  if (hasRef(input.refs, input.value)) return null;
  const refHints = modelFacingRefHints(input.refs, input.backendOnlyRefs);

  return scopedIssue(
    input.code,
    input.path,
    `${input.path} must reference ${input.description}; got an out-of-scope ref. Use a visible label, current_scene/current_location, or a short helper alias. Examples: ${refHints.join(", ") || "none"}.`,
    input.value,
    refHints,
  );
}

function requireContextRef(input: {
  value: unknown;
  refs: ReadonlySet<string>;
  path: string;
  description: string;
  code: ToolGroundingIssue["code"];
  context: ToolExecutionContext;
}): ToolGroundingIssue | null {
  return requireRef({
    value: input.value,
    refs: input.refs,
    path: input.path,
    description: input.description,
    code: input.code,
    enforceModelFacingRefSafety: strictModelFacingRefs(input.context),
    backendOnlyRefs: input.context.backendOnlyRefs,
  });
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
    }).map((record): BridgeKnownFactSnapshot => {
      const knowledgeRef = canonicalKnowledgeRef(record.id);
      return {
        id: knowledgeRef,
        summary: `${record.truthStatus}: ${record.statement}`,
        visibilityRoute: "player_known",
        confidence: Math.max(0, Math.min(1, record.confidence / 100)),
        sourceRefs: uniqueModelRefs([
          knowledgeRef,
          ...record.sourceEventIds.map(canonicalEventRef),
          ...record.sourceKnowledgeIds.map(canonicalKnowledgeRef),
          ...record.authorityTraceIds.map(canonicalAuthorityRef),
        ]),
      };
    });
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

export function createPlayerTurnToolExecutionContext(
  input: SceneFrame | CreatePlayerTurnToolExecutionContextArgs,
): ToolExecutionContext {
  const frame = "frame" in input ? input.frame : input;
  const addressedTargetInput = "frame" in input ? input.addressedTarget : null;
  const packet = buildModelFacingScenePacket(frame);
  const subjectActorRefs = new Set<string>();
  const legalActorRefs = new Set<string>();
  const legalItemRefs = new Set<string>();
  const legalFactionRefs = new Set<string>();
  const legalLocationRefs = new Set<string>();
  const currentLocationRefs = new Set<string>();
  const currentSceneRefs = new Set<string>();
  const legalMovementRefs = new Set<string>();
  const backendOnlyRefs = new Set<string>();
  addBackendOnlyRefs(backendOnlyRefs, [
    frame.campaignId,
    frame.playerActorId,
    frame.currentLocationId,
    frame.currentSceneScopeId,
  ]);

  const clearActors = [
    ...frame.roster.active,
    ...frame.roster.support.filter((actor) => actor.awareness === "clear"),
  ];
  for (const actor of clearActors) {
    addBackendOnlyRefs(backendOnlyRefs, [
      actor.id,
      actor.actorId,
      actor.locationId,
      actor.sceneScopeId,
    ]);
    addActorScopedRefs(legalActorRefs, [actor.id, actor.actorId]);
    addRefs(legalActorRefs, [actor.label]);
    if (actor.id === frame.playerActorId || actor.actorId === frame.playerActorId) {
      addActorScopedRefs(subjectActorRefs, [actor.id, actor.actorId]);
      addRefs(subjectActorRefs, [actor.label, ...PLAYER_MODEL_SAFE_REFS]);
      addRefs(legalActorRefs, PLAYER_MODEL_SAFE_REFS);
    }
  }
  addActorScopedRefs(subjectActorRefs, [frame.playerActorId]);
  addRefs(subjectActorRefs, PLAYER_MODEL_SAFE_REFS);
  addRefs(legalActorRefs, PLAYER_MODEL_SAFE_REFS);

  addLocationScopedRefs(currentLocationRefs, [frame.currentLocationId]);
  addRefs(currentLocationRefs, [frame.currentLocationName, "current_location"]);
  addLocationScopedRefs(currentSceneRefs, [frame.currentSceneScopeId]);
  addRefs(currentSceneRefs, [frame.currentSceneScopeName, "current_scene"]);
  addLocationScopedRefs(legalLocationRefs, [
    frame.currentLocationId,
    frame.currentSceneScopeId,
  ]);
  addRefs(legalLocationRefs, [
    frame.currentLocationName,
    frame.currentSceneScopeName,
    "current_location",
    "current_scene",
  ]);

  for (const candidate of frame.movementCandidates.filter((entry) => entry.connected)) {
    addBackendOnlyRefs(backendOnlyRefs, [candidate.id, candidate.locationId]);
    addLocationScopedRefs(legalLocationRefs, [candidate.id, candidate.locationId]);
    addRefs(legalLocationRefs, [candidate.label]);
    addLocationScopedRefs(legalMovementRefs, [candidate.id, candidate.locationId]);
    addRefs(legalMovementRefs, [candidate.label]);
  }

  for (const candidate of packet.view.legalTargets) {
    switch (candidate.type) {
      case "actor":
        addActorScopedRefs(legalActorRefs, [candidate.id, candidate.actorId]);
        addRefs(legalActorRefs, [candidate.label]);
        break;
      case "item":
        addItemScopedRefs(legalItemRefs, [candidate.id, candidate.itemId]);
        addRefs(legalItemRefs, [candidate.label]);
        break;
      case "location":
        addLocationScopedRefs(legalLocationRefs, [candidate.id, candidate.locationId]);
        addRefs(legalLocationRefs, [candidate.label]);
        break;
      case "faction":
        addRefs(legalFactionRefs, [candidate.id, candidate.factionId, candidate.label]);
        break;
    }
  }
  for (const candidate of frame.targetCandidates) {
    addBackendOnlyRefs(backendOnlyRefs, [
      candidate.id,
      "actorId" in candidate ? candidate.actorId : undefined,
      "itemId" in candidate ? candidate.itemId : undefined,
      "locationId" in candidate ? candidate.locationId : undefined,
      "factionId" in candidate ? candidate.factionId : undefined,
    ]);
  }

  const authority = buildPlayerTurnAuthority(frame);
  const bridgeLookup = buildBridgeLookupSnapshot({
    frame,
    packet,
    playerKnownFacts: readPlayerKnownFacts(frame, authority?.baseWorldVersion),
  });
  const addressedTarget = buildDialogueAddressedTarget(
    addressedTargetInput,
    frame,
    legalActorRefs,
  );

  return {
    scope: "player_turn",
    subjectActorId: frame.playerActorId,
    subjectActorRefs,
    addressedTarget,
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
    sameTurnResultRefs: new Set(),
    backendOnlyRefs,
    bridgeLookup,
  };
}

export function createBackgroundToolExecutionContext(
  args: CreateBackgroundToolExecutionContextArgs,
): ToolExecutionContext {
  const baseWorldVersion =
    typeof args.baseWorldVersion === "number"
      ? args.baseWorldVersion
      : readWorldClock(args.campaignId).worldVersion;
  return {
    scope: "background",
    subjectActorId: args.sourceEntity.id ?? undefined,
    subjectActorRefs: new Set<string>(),
    authority: {
      baseWorldVersion,
      sourceEntity: args.sourceEntity,
      elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes ?? 1,
      toolResultId: args.toolResultId,
      allowedWriteScopes: args.allowedWriteScopes,
      metadata: args.metadata,
    },
    currentLocationId: null,
    currentSceneScopeId: null,
    legalLocationRefs: new Set<string>(),
    legalActorRefs: new Set<string>(),
    legalItemRefs: new Set<string>(),
    legalFactionRefs: new Set<string>(),
    currentLocationRefs: new Set<string>(),
    currentSceneRefs: new Set<string>(),
    legalMovementRefs: new Set<string>(),
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

  addActorScopedRefs(legalActorRefs, [
    actorFrame.observer.id,
    actorFrame.observer.actorId,
  ]);
  addRefs(legalActorRefs, [actorFrame.observer.label]);
  addActorScopedRefs(subjectActorRefs, [
    actorFrame.observer.id,
    actorFrame.observer.actorId,
  ]);
  addRefs(subjectActorRefs, [actorFrame.observer.label]);

  const clearActors = [
    ...sceneFrame.roster.active,
    ...sceneFrame.roster.support.filter((actor) => actor.awareness === "clear"),
  ];
  for (const actor of clearActors) {
    addActorScopedRefs(legalActorRefs, [actor.id, actor.actorId]);
    addRefs(legalActorRefs, [actor.label]);
  }

  addLocationScopedRefs(currentLocationRefs, [actorFrame.observer.locationId]);
  addRefs(currentLocationRefs, [sceneFrame.currentLocationName, "current_location"]);
  addLocationScopedRefs(currentSceneRefs, [actorFrame.observer.sceneScopeId]);
  addRefs(currentSceneRefs, [sceneFrame.currentSceneScopeName, "current_scene"]);
  addLocationScopedRefs(legalLocationRefs, [
    actorFrame.observer.locationId,
    actorFrame.observer.sceneScopeId,
  ]);
  addRefs(legalLocationRefs, [
    sceneFrame.currentLocationName,
    sceneFrame.currentSceneScopeName,
    "current_location",
    "current_scene",
  ]);

  for (const candidate of sceneFrame.movementCandidates.filter((entry) => entry.connected)) {
    addLocationScopedRefs(legalLocationRefs, [candidate.id, candidate.locationId]);
    addRefs(legalLocationRefs, [candidate.label]);
    addLocationScopedRefs(legalMovementRefs, [candidate.id, candidate.locationId]);
    addRefs(legalMovementRefs, [candidate.label]);
  }

  for (const candidate of sceneFrame.targetCandidates) {
    switch (candidate.type) {
      case "actor":
        addActorScopedRefs(legalActorRefs, [candidate.id, candidate.actorId]);
        addRefs(legalActorRefs, [candidate.label]);
        break;
      case "item":
        addItemScopedRefs(legalItemRefs, [candidate.id, candidate.itemId]);
        addRefs(legalItemRefs, [candidate.label]);
        break;
      case "location":
        addLocationScopedRefs(legalLocationRefs, [candidate.id, candidate.locationId]);
        addRefs(legalLocationRefs, [candidate.label]);
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
    sameTurnResultRefs: new Set(),
    bridgeLookup,
  };
}

export function applySuccessfulToolObservationToExecutionContext(input: {
  toolName: RuntimeToolName;
  toolInput?: Record<string, unknown>;
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
  addSameTurnToolResultRefs(input.context, input.toolName, input.result);

  if (input.context.scope === "player_turn" && isObservationToolResult(input.result)) {
    return;
  }

  const payload = input.result.result;
  const id = readResultString(payload, "id")
    ?? readResultString(payload, "locationId")
    ?? readResultString(payload, "npcId");
  const actorId = readResultString(payload, "actorId")
    ?? readResultString(payload, "npcId")
    ?? id;
  const name = readResultString(payload, "name")
    ?? readResultString(payload, "locationName");

  switch (input.toolName) {
    case "advance_time":
      if (input.context.authority) {
        input.context.authority.elapsedWorldTimeMinutes = 0;
      }
      break;
    case "reveal_location":
      addLocationScopedRefs(input.context.legalLocationRefs, [id]);
      addRefs(input.context.legalLocationRefs, [name]);
      addLocationScopedRefs(input.context.legalMovementRefs, [id]);
      addRefs(input.context.legalMovementRefs, [name]);
      break;
    case "move_to":
    case "move_actor":
      if (!id) return;
      input.context.currentLocationId = id;
      input.context.currentSceneScopeId = id;
      input.context.currentLocationRefs.clear();
      input.context.currentSceneRefs.clear();
      addLocationScopedRefs(input.context.currentLocationRefs, [id]);
      addRefs(input.context.currentLocationRefs, ["current_location", name]);
      addLocationScopedRefs(input.context.currentSceneRefs, [id]);
      addRefs(input.context.currentSceneRefs, ["current_scene", name]);
      addLocationScopedRefs(input.context.legalLocationRefs, [id]);
      addRefs(input.context.legalLocationRefs, [name]);
      addLocationScopedRefs(input.context.legalMovementRefs, [id]);
      addRefs(input.context.legalMovementRefs, [name]);
      break;
    case "spawn_npc":
    case "create_scene_extra":
      addActorScopedRefs(input.context.legalActorRefs, [actorId, id]);
      addRefs(input.context.legalActorRefs, [name]);
      addCreatedActorRefsForAddressedTarget({
        context: input.context,
        toolName: input.toolName,
        toolInput: input.toolInput,
        payload,
        id,
        actorId,
        name,
      });
      break;
    case "create_minor_poi":
      addLocationScopedRefs(input.context.legalLocationRefs, [id]);
      addRefs(input.context.legalLocationRefs, [name]);
      addLocationScopedRefs(input.context.legalMovementRefs, [id]);
      addRefs(input.context.legalMovementRefs, [name]);
      break;
    case "spawn_item":
      addItemScopedRefs(input.context.legalItemRefs, [id]);
      addRefs(input.context.legalItemRefs, [name]);
      break;
    case "transfer_item":
      addItemScopedRefs(input.context.legalItemRefs, [readResultString(payload, "id")]);
      addRefs(input.context.legalItemRefs, [
        readResultString(payload, "item"),
        readResultString(payload, "splitFrom"),
        readResultString(payload, "remainingItem"),
      ]);
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
    enforceModelFacingRefSafety: strictModelFacingRefs(context),
    backendOnlyRefs: context.backendOnlyRefs,
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
      enforceModelFacingRefSafety: strictModelFacingRefs(context),
      backendOnlyRefs: context.backendOnlyRefs,
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
      enforceModelFacingRefSafety: strictModelFacingRefs(context),
      backendOnlyRefs: context.backendOnlyRefs,
    });
    if (participantIssue) return participantIssue;
  }

  if (input.durability !== "durable") {
    return null;
  }

  const eventText = typeof input.text === "string" ? input.text : "";
  if (textHasUnsupportedActionClaim(eventText)) {
    return scopedIssue(
      "unsupported_action_claim",
      `${pathPrefix}.text`,
      "player-turn durable log_event cannot commit possession, access, item-use, or completed movement claims; use a concrete backend tool result or record the attempted/failed beat as scene_local.",
    );
  }

  return null;
}

function knownFactRefs(context: ToolExecutionContext): Set<string> {
  const refs = new Set<string>();
  for (const fact of context.bridgeLookup?.playerKnownFacts ?? []) {
    addRefs(refs, [fact.id, ...fact.sourceRefs]);
  }
  return refs;
}

function dialogueSourceRefs(context: ToolExecutionContext): Set<string> {
  return mergeSets(
    context.subjectActorRefs,
    context.legalActorRefs,
    context.legalItemRefs,
    context.legalLocationRefs,
    context.legalFactionRefs,
    context.legalMovementRefs,
    context.currentLocationRefs,
    context.currentSceneRefs,
    context.sameTurnResultRefs ?? new Set(),
    sameTurnRefsConsumableBy(context, "record_dialogue_outcome"),
    knownFactRefs(context),
  );
}

function worldFactSourceRefs(context: ToolExecutionContext): Set<string> {
  return mergeSets(
    context.subjectActorRefs,
    context.legalActorRefs,
    context.legalItemRefs,
    context.legalLocationRefs,
    context.legalFactionRefs,
    context.legalMovementRefs,
    context.currentLocationRefs,
    context.currentSceneRefs,
    context.sameTurnResultRefs ?? new Set(),
    sameTurnRefsConsumableBy(context, "record_world_fact"),
    knownFactRefs(context),
  );
}

function validateRefArray(input: {
  values: unknown;
  refs: ReadonlySet<string>;
  path: string;
  description: string;
  code: ToolGroundingIssue["code"];
  context: ToolExecutionContext;
}): ToolGroundingIssue | null {
  if (!Array.isArray(input.values)) return null;
  for (const [index, value] of input.values.entries()) {
    const issue = requireRef({
      value,
      refs: input.refs,
      path: `${input.path}.${index}`,
      description: input.description,
      code: input.code,
      enforceModelFacingRefSafety: strictModelFacingRefs(input.context),
      backendOnlyRefs: input.context.backendOnlyRefs,
    });
    if (issue) return issue;
  }
  return null;
}

function validateDialogueAddressedTarget(input: {
  toolInput: Record<string, unknown>;
  context: ToolExecutionContext;
  pathPrefix: string;
  speakerRef: unknown;
  speakerOptional: boolean;
}): ToolGroundingIssue | null {
  if (input.context.scope !== "player_turn") return null;
  const target = input.context.addressedTarget;
  if (!target || target.kind === "none") return null;

  if (target.kind === "visible_ref") {
    if (
      typeof input.speakerRef === "string"
      && (
        hasRef(target.refs, input.speakerRef)
        || (
          target.refs.size === 0
          && normalizeToolRef(input.speakerRef) === target.ref
        )
      )
    ) {
      return null;
    }
    return scopedIssue(
      "addressed_target_mismatch",
      `${input.pathPrefix}.speakerRef`,
      "record_dialogue_outcome speakerRef must match the visible actor selected by GM Read speakerBinding.",
      typeof input.speakerRef === "string" ? input.speakerRef : undefined,
      modelFacingRefHints(target.refs, input.context.backendOnlyRefs),
    );
  }

  if (target.kind === "no_visible_authority") {
    const requestedRoleText = readResultString(input.toolInput, "requestedRoleText");
    if (
      !requestedRoleText
      || !addressedRoleMatchesExistingActorLabel(target.roleText, requestedRoleText)
    ) {
      return scopedIssue(
        "addressed_target_mismatch",
        `${input.pathPrefix}.requestedRoleText`,
        "record_dialogue_outcome must echo GM Read speakerBinding.requestedRoleText for no-visible-authority dialogue targets.",
        requestedRoleText ?? undefined,
      );
    }
    if (!input.speakerOptional) {
      return scopedIssue(
        "addressed_target_mismatch",
        `${input.pathPrefix}.outcomeKind`,
        "GM Read no_visible_authority speakerBinding only permits unavailable/no_current_answer dialogue outcomes.",
      );
    }
    const authorityKind = readResultString(input.toolInput, "authorityKind");
    if (authorityKind !== "no_visible_authority") {
      return scopedIssue(
        "addressed_target_mismatch",
        `${input.pathPrefix}.authorityKind`,
        "GM Read no_visible_authority speakerBinding requires authorityKind no_visible_authority.",
        authorityKind ?? undefined,
      );
    }
    if (typeof input.speakerRef === "string" && input.speakerRef.trim()) {
      return scopedIssue(
        "addressed_target_mismatch",
        `${input.pathPrefix}.speakerRef`,
        "GM Read no_visible_authority speakerBinding must not be rebound to a visible or created speakerRef.",
        input.speakerRef,
      );
    }
    return null;
  }

  if (
    !input.speakerOptional
    && typeof input.speakerRef === "string"
    && (
      hasRef(target.matchedActorRefs, input.speakerRef)
      || hasRef(target.createdActorRefs, input.speakerRef)
    )
  ) {
    return null;
  }

  const requestedRoleText = readResultString(input.toolInput, "requestedRoleText");
  if (
    !requestedRoleText
    || !addressedRoleMatchesExistingActorLabel(target.roleText, requestedRoleText)
  ) {
    return scopedIssue(
      "addressed_target_mismatch",
      `${input.pathPrefix}.requestedRoleText`,
      input.speakerOptional
        ? "record_dialogue_outcome must preserve GM Read speakerBinding.requestedRoleText when no concrete speaker is bound."
        : "record_dialogue_outcome speakerRef must match the bound prose-role actor, or requestedRoleText must preserve GM Read speakerBinding.requestedRoleText.",
      requestedRoleText ?? undefined,
    );
  }

  if (input.speakerOptional) {
    return null;
  }

  if (
    typeof input.speakerRef === "string"
    && (
      hasRef(target.matchedActorRefs, input.speakerRef)
      || hasRef(target.createdActorRefs, input.speakerRef)
    )
  ) {
    return null;
  }

  return scopedIssue(
    "addressed_target_mismatch",
    `${input.pathPrefix}.speakerRef`,
    "record_dialogue_outcome speakerRef must be the matched visible actor or same-turn created actor for GM Read prose-role speakerBinding; do not substitute another visible NPC.",
    typeof input.speakerRef === "string" ? input.speakerRef : undefined,
    modelFacingRefHints(
      mergeSets(target.matchedActorRefs, target.createdActorRefs),
      input.context.backendOnlyRefs,
    ),
  );
}

function validateRecordDialogueOutcomeGrounding(
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  pathPrefix: string,
): ToolGroundingIssue | null {
  const outcomeKind = typeof input.outcomeKind === "string" ? input.outcomeKind : "";
  const topicKind = typeof input.topicKind === "string" ? input.topicKind : "";
  const durability = typeof input.durability === "string" ? input.durability : "";
  const authorityKind = typeof input.authorityKind === "string" ? input.authorityKind : "";
  const speakerOptional = outcomeKind === "unavailable" || outcomeKind === "no_current_answer";
  const speakerRef = input.speakerRef;

  if (authorityKind === "no_visible_authority") {
    if (!speakerOptional) {
      return scopedIssue(
        "invalid_speaker_ref",
        `${pathPrefix}.authorityKind`,
        "record_dialogue_outcome may use no_visible_authority only for unavailable/no_current_answer outcomes.",
      );
    }
    if (typeof speakerRef === "string" && speakerRef.trim()) {
      return scopedIssue(
        "invalid_speaker_ref",
        `${pathPrefix}.speakerRef`,
        "record_dialogue_outcome unavailable/no_current_answer outcomes with no_visible_authority must not use a speakerRef.",
      );
    }
  }

  if (!speakerOptional && (typeof speakerRef !== "string" || !speakerRef.trim())) {
    return scopedIssue(
      "invalid_speaker_ref",
      `${pathPrefix}.speakerRef`,
      "record_dialogue_outcome requires speakerRef for visible dialogue outcomes.",
    );
  }

  if (!speakerOptional || typeof speakerRef === "string") {
    const speakerIssue = requireContextRef({
      value: speakerRef,
      refs: context.legalActorRefs,
      path: `${pathPrefix}.speakerRef`,
      description: "a clear visible/current actor speaker",
      code: "invalid_speaker_ref",
      context,
    });
    if (speakerIssue) return speakerIssue;

    if (typeof speakerRef === "string" && hasRef(context.subjectActorRefs, speakerRef)) {
      return scopedIssue(
        "invalid_speaker_ref",
        `${pathPrefix}.speakerRef`,
        "record_dialogue_outcome speakerRef must be a non-player visible/current actor for NPC answers, refusals, warnings, gestures, or silence.",
      );
    }

  }

  const addressedTargetIssue = validateDialogueAddressedTarget({
    toolInput: input,
    context,
    pathPrefix,
    speakerRef,
    speakerOptional,
  });
  if (addressedTargetIssue) return addressedTargetIssue;

  const addresseeIssue = validateRefArray({
    values: input.addresseeRefs,
    refs: context.legalActorRefs,
    path: `${pathPrefix}.addresseeRefs`,
    description: "clear visible/current actor addressee refs",
    code: "hidden_actor_ref",
    context,
  });
  if (addresseeIssue) return addresseeIssue;

  const sourceIssue = validateRefArray({
    values: input.sourceRefs,
    refs: dialogueSourceRefs(context),
    path: `${pathPrefix}.sourceRefs`,
    description: "legal visible/current refs, movement refs, or player-known fact refs",
    code: "invalid_source_ref",
    context,
  });
  if (sourceIssue) return sourceIssue;

  if (durability === "durable") {
    if (typeof input.futureUseKind !== "string" || !input.futureUseKind.trim()) {
      return scopedIssue(
        "invalid_durability",
        `${pathPrefix}.futureUseKind`,
        "durable record_dialogue_outcome requires futureUseKind.",
      );
    }
    if (typeof input.futureRelevance !== "string" || !input.futureRelevance.trim()) {
      return scopedIssue(
        "invalid_durability",
        `${pathPrefix}.futureRelevance`,
        "durable record_dialogue_outcome requires futureRelevance.",
      );
    }
  }

  const requiresClaim =
    durability === "durable"
    && ["procedure", "permission", "proof", "route", "safety", "status"].includes(topicKind)
    && ["answered", "warned", "redirected"].includes(outcomeKind);
  if (
    durability === "durable"
    && outcomeKind === "answered"
    && ["procedure", "permission", "proof", "route", "safety", "status"].includes(topicKind)
    && (typeof input.quote !== "string" || !input.quote.trim())
  ) {
    return scopedIssue(
      "missing_structural_claim",
      `${pathPrefix}.quote`,
      "durable procedural answered record_dialogue_outcome must include quote so the concrete player-visible answer is owned by the dialogue receipt.",
    );
  }
  if (requiresClaim && (!Array.isArray(input.claims) || input.claims.length === 0)) {
    return scopedIssue(
      "missing_structural_claim",
      `${pathPrefix}.claims`,
      "durable procedural answered/warned/redirected dialogue outcomes require at least one structured claim.",
    );
  }

  if (Array.isArray(input.claims)) {
    const legalClaimRefs = dialogueSourceRefs(context);
    for (const [index, claim] of input.claims.entries()) {
      if (!claim || typeof claim !== "object" || Array.isArray(claim)) continue;
      const subjectIssue = requireContextRef({
        value: (claim as Record<string, unknown>).subjectRef,
        refs: legalClaimRefs,
        path: `${pathPrefix}.claims.${index}.subjectRef`,
        description: "a legal visible/current ref or player-known fact ref",
        code: "invalid_source_ref",
        context,
      });
      if (subjectIssue) return subjectIssue;
    }
  }

  return null;
}

function validateRecordWorldFactGrounding(
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  pathPrefix: string,
): ToolGroundingIssue | null {
  const sourceRefs = worldFactSourceRefs(context);
  const sourceIssue = validateRefArray({
    values: input.sourceRefs,
    refs: sourceRefs,
    path: `${pathPrefix}.sourceRefs`,
    description: "legal visible/current refs, movement refs, or player-known fact refs",
    code: "invalid_source_ref",
    context,
  });
  if (sourceIssue) return sourceIssue;

  const subjectIssue = validateRefArray({
    values: input.subjectRefs,
    refs: sourceRefs,
    path: `${pathPrefix}.subjectRefs`,
    description: "legal visible/current refs, movement refs, or player-known fact refs",
    code: "invalid_source_ref",
    context,
  });
  if (subjectIssue) return subjectIssue;

  if (Array.isArray(input.claims)) {
    for (const [index, claim] of input.claims.entries()) {
      if (!claim || typeof claim !== "object" || Array.isArray(claim)) continue;
      const claimSubjectIssue = requireContextRef({
        value: (claim as Record<string, unknown>).subjectRef,
        refs: sourceRefs,
        path: `${pathPrefix}.claims.${index}.subjectRef`,
        description: "a legal visible/current ref or player-known fact ref",
        code: "invalid_source_ref",
        context,
      });
      if (claimSubjectIssue) return claimSubjectIssue;
    }
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

function validateBackgroundGrounding(input: {
  toolName: RuntimeToolName | string;
  context: ToolExecutionContext;
  pathPrefix: string;
}): ToolGroundingIssue | null {
  if (!isRuntimeToolName(input.toolName)) return null;
  if (!runtimeToolRequiresExecutionAuthority(input.toolName)) return null;

  const authority = input.context.authority;
  if (!authority?.sourceEntity?.type) {
    return scopedIssue(
      "missing_background_authority",
      input.pathPrefix,
      `background state-bearing tool ${input.toolName} requires an authority source entity.`,
    );
  }

  if (!authority.allowedWriteScopes || authority.allowedWriteScopes.length === 0) {
    return scopedIssue(
      "missing_background_write_scope",
      input.pathPrefix,
      `background state-bearing tool ${input.toolName} requires non-empty allowedWriteScopes.`,
    );
  }

  return null;
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
    return validateBackgroundGrounding({
      toolName: input.toolName,
      context: input.context,
      pathPrefix: path,
    });
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
    case "record_dialogue_outcome":
      return validateRecordDialogueOutcomeGrounding(toolInput, input.context, path);
    case "record_world_fact":
      return validateRecordWorldFactGrounding(toolInput, input.context, path);
    case "spawn_npc":
      return validateSpawnNpcGrounding(toolInput, input.context, path);
    case "promote_npc":
      return requireContextRef({
        value: toolInput.npcRef,
        refs: input.context.legalActorRefs,
        path: `${path}.npcRef`,
        description: "a clear local NPC actor",
        code: "hidden_actor_ref",
        context: input.context,
      });
    case "reveal_location":
      return requireContextRef({
        value: toolInput.connectedToName,
        refs: input.context.legalLocationRefs,
        path: `${path}.connectedToName`,
        description: "a local/current location anchor",
        code: "remote_location_ref",
        context: input.context,
      });
    case "move_to":
      return requireContextRef({
        value: toolInput.targetLocationName,
        refs: input.context.legalMovementRefs,
        path: `${path}.targetLocationName`,
        description: "a connected movement candidate",
        code: "remote_location_ref",
        context: input.context,
      });
    case "request_contested_outcome":
      return (
        requireContextRef({
          value: toolInput.actorName,
          refs: input.subjectActorRefs ?? input.context.subjectActorRefs,
          path: `${path}.actorName`,
          description: "the actor currently allowed to request this contest",
          code: "hidden_actor_ref",
          context: input.context,
        })
        ?? requireContextRef({
          value: toolInput.targetName,
          refs: input.context.legalActorRefs,
          path: `${path}.targetName`,
          description: "a clear local actor",
          code: "hidden_actor_ref",
          context: input.context,
        })
        ?? validateRefArray({
          values: toolInput.evidenceRefs,
          refs: mergeSets(
            input.context.subjectActorRefs,
            input.context.legalActorRefs,
            input.context.legalLocationRefs,
            input.context.legalMovementRefs,
            input.context.currentLocationRefs,
            input.context.currentSceneRefs,
            input.context.sameTurnResultRefs ?? new Set(),
            sameTurnRefsConsumableBy(input.context, "request_contested_outcome"),
            knownFactRefs(input.context),
          ),
          path: `${path}.evidenceRefs`,
          description: "legal visible/current refs, movement refs, or player-known fact refs",
          code: "invalid_source_ref",
          context: input.context,
        })
      );
    case "spawn_item":
      if (toolInput.ownerType === "location") {
        return requireContextRef({
          value: toolInput.ownerName,
          refs: input.context.legalLocationRefs,
          path: `${path}.ownerName`,
          description: "a local/current location ref",
          code: "remote_location_ref",
          context: input.context,
        });
      }
      if (toolInput.ownerType === "character") {
        return requireContextRef({
          value: toolInput.ownerName,
          refs: input.context.legalActorRefs,
          path: `${path}.ownerName`,
          description: "a clear local actor",
          code: "hidden_actor_ref",
          context: input.context,
        });
      }
      return null;
    case "transfer_item": {
      const itemIssue = requireContextRef({
        value: toolInput.itemName,
        refs: input.context.legalItemRefs,
        path: `${path}.itemName`,
        description: "a visible/local item ref",
        code: "unexposed_item_ref",
        context: input.context,
      });
      if (itemIssue) return itemIssue;
      if (toolInput.targetType === "location") {
        return requireContextRef({
          value: toolInput.targetName,
          refs: input.context.legalLocationRefs,
          path: `${path}.targetName`,
          description: "a local/current location ref",
          code: "remote_location_ref",
          context: input.context,
        });
      }
      if (
        toolInput.targetType === "character"
        || toolInput.targetType === "npc"
        || toolInput.targetType === "player"
        || toolInput.targetType === "actor"
      ) {
        return requireContextRef({
          value: toolInput.targetName,
          refs: input.context.legalActorRefs,
          path: `${path}.targetName`,
          description: "a clear local actor",
          code: "hidden_actor_ref",
          context: input.context,
        });
      }
      return null;
    }
    case "add_tag":
    case "remove_tag": {
      const tagIssue = validateTagGrounding(toolInput, input.context, path);
      if (tagIssue) return tagIssue;

      if (toolInput.entityType === "location") {
        return requireContextRef({
          value: toolInput.entityName,
          refs: input.context.legalLocationRefs,
          path: `${path}.entityName`,
          description: "a local/current location ref",
          code: "remote_location_ref",
          context: input.context,
        });
      }
      if (toolInput.entityType === "item") {
        return requireContextRef({
          value: toolInput.entityName,
          refs: input.context.legalItemRefs,
          path: `${path}.entityName`,
          description: "a visible/local item ref",
          code: "unexposed_item_ref",
          context: input.context,
        });
      }
      if (toolInput.entityType === "faction") {
        return requireContextRef({
          value: toolInput.entityName,
          refs: input.context.legalFactionRefs,
          path: `${path}.entityName`,
          description: "an exposed faction ref",
          code: "ambiguous_entity_ref",
          context: input.context,
        });
      }
      return requireContextRef({
        value: toolInput.entityName,
        refs: input.context.legalActorRefs,
        path: `${path}.entityName`,
        description: "a clear local actor",
        code: "hidden_actor_ref",
        context: input.context,
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
        requireContextRef({
          value: toolInput.entityA,
          refs: legalEntityRefs,
          path: `${path}.entityA`,
          description: "an exposed local entity ref",
          code: "ambiguous_entity_ref",
          context: input.context,
        })
        ?? requireContextRef({
          value: toolInput.entityB,
          refs: legalEntityRefs,
          path: `${path}.entityB`,
          description: "an exposed local entity ref",
          code: "ambiguous_entity_ref",
          context: input.context,
        })
      );
    }
    case "set_condition":
      return requireContextRef({
        value: toolInput.targetName,
        refs: input.context.legalActorRefs,
        path: `${path}.targetName`,
        description: "a clear local actor",
        code: "hidden_actor_ref",
        context: input.context,
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
