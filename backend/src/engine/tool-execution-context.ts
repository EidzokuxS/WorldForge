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
  type ModelFacingAcceptedRefKind,
} from "./model-facing-scene.js";
import {
  findUnsafeBackendRefTokenInText,
  isNaturalModelFacingProseHyphenToken,
} from "./model-facing-ref-safety.js";
import { listActorKnowledge } from "./knowledge-model.js";
import {
  readWorldClock,
  type AuthoritySourceEntity,
} from "./living-world-authority.js";
import { writeScopesConflict } from "./simulation-write-scope.js";
import {
  isRuntimeToolName,
  runtimeToolRequiresExecutionAuthority,
} from "./tool-contracts.js";
import { runtimeToolWriteScopes } from "./runtime-tool-descriptors.js";

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
    elapsedWorldTimeMinutes: number;
    timePassageAllowed?: boolean;
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
  modelRefResolutions?: Map<string, ToolExecutionRefResolution>;
  sameTurnAliasCounters?: Partial<Record<SameTurnAliasKind, number>>;
  bridgeLookup?: BridgeLookupSnapshot;
}

export type ToolExecutionRefKind =
  | ModelFacingAcceptedRefKind
  | "item"
  | "faction";

export interface ToolExecutionRefResolution {
  ref: string;
  kind: ToolExecutionRefKind;
  backendRef: string;
  candidateId?: string;
  label?: string | null;
}

type SameTurnAliasKind = "actor" | "item" | "location";

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
  allowedWriteScopes?: readonly string[];
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
  allowedWriteScopes?: readonly string[];
  timePassageAllowed?: boolean;
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
    | "missing_time_semantics"
    | "addressed_target_mismatch"
    | "missing_structural_claim"
    | "missing_write_scope"
    | "missing_background_authority"
    | "missing_background_write_scope"
    | "unsupported_tool_owner";
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

function addActorScopedBackendOnlyRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    addBackendOnlyRefs(target, [trimmed, trimmed.startsWith("actor:") ? trimmed : `actor:${trimmed}`]);
  }
}

function addLocationScopedBackendOnlyRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const unprefixed = trimmed.startsWith("location:")
      ? trimmed.slice("location:".length)
      : trimmed;
    addBackendOnlyRefs(target, [unprefixed, `location:${unprefixed}`]);
  }
}

function addItemScopedBackendOnlyRefs(target: Set<string>, values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const unprefixed = trimmed.startsWith("item:")
      ? trimmed.slice("item:".length)
      : trimmed;
    addBackendOnlyRefs(target, [unprefixed, `item:${unprefixed}`]);
  }
}

function addModelRefResolution(
  target: Map<string, ToolExecutionRefResolution>,
  input: ToolExecutionRefResolution,
): void {
  const ref = input.ref.trim();
  const backendRef = input.backendRef.trim();
  if (!ref || !backendRef) return;
  target.set(normalizeToolRef(ref), {
    ...input,
    ref,
    backendRef,
  });
}

function addResolvedRefToSet(input: {
  refs: Set<string>;
  resolutions: Map<string, ToolExecutionRefResolution>;
  ref: string | null | undefined;
  kind: ToolExecutionRefKind;
  backendRef: string | null | undefined;
  candidateId?: string | null;
  label?: string | null;
}): void {
  const ref = input.ref?.trim();
  const backendRef = input.backendRef?.trim();
  if (!ref || !backendRef) return;
  addRefs(input.refs, [ref]);
  addModelRefResolution(input.resolutions, {
    ref,
    kind: input.kind,
    backendRef,
    candidateId: input.candidateId ?? undefined,
    label: input.label,
  });
}

function addSubjectResolvedRef(input: {
  subjectRefs: Set<string>;
  legalActorRefs: Set<string>;
  resolutions: Map<string, ToolExecutionRefResolution>;
  ref: string | null | undefined;
  backendRef: string | null | undefined;
  label?: string | null;
}): void {
  addResolvedRefToSet({
    refs: input.subjectRefs,
    resolutions: input.resolutions,
    ref: input.ref,
    kind: "player",
    backendRef: input.backendRef,
    label: input.label,
  });
  addResolvedRefToSet({
    refs: input.legalActorRefs,
    resolutions: input.resolutions,
    ref: input.ref,
    kind: "player",
    backendRef: input.backendRef,
    label: input.label,
  });
}

function refResolutionFor(
  context: ToolExecutionContext | undefined,
  value: unknown,
): ToolExecutionRefResolution | null {
  if (!context || typeof value !== "string") return null;
  return context.modelRefResolutions?.get(normalizeToolRef(value)) ?? null;
}

export function resolveToolExecutionRef(
  context: ToolExecutionContext | undefined,
  value: string,
  allowedKinds?: ReadonlySet<ToolExecutionRefKind>,
): string {
  const resolution = refResolutionFor(context, value);
  if (!resolution) return value;
  if (allowedKinds && !allowedKinds.has(resolution.kind)) return value;
  return resolution.backendRef;
}

function nextSameTurnAlias(
  context: ToolExecutionContext,
  kind: SameTurnAliasKind,
): string {
  context.sameTurnAliasCounters ??= {};
  const next = (context.sameTurnAliasCounters[kind] ?? 0) + 1;
  context.sameTurnAliasCounters[kind] = next;
  return `new_${kind}_${next}`;
}

function addModelSafeRefToResult(result: ToolResult, ref: string): void {
  result.modelSafeRefs = uniqueModelRefs([...(result.modelSafeRefs ?? []), ref]);
}

function addSameTurnResolvedRef(input: {
  context: ToolExecutionContext;
  result: ToolResult;
  refs: Set<string>;
  aliasKind: SameTurnAliasKind;
  refKind: ToolExecutionRefKind;
  backendRef: string | null | undefined;
  label?: string | null;
  candidateId?: string | null;
}): string | null {
  const backendRef = input.backendRef?.trim();
  if (!backendRef) return null;
  const alias = nextSameTurnAlias(input.context, input.aliasKind);
  input.context.modelRefResolutions ??= new Map<string, ToolExecutionRefResolution>();
  addResolvedRefToSet({
    refs: input.refs,
    resolutions: input.context.modelRefResolutions,
    ref: alias,
    kind: input.refKind,
    backendRef,
    candidateId: input.candidateId,
    label: input.label,
  });
  addModelSafeRefToResult(input.result, alias);
  return alias;
}

function addResolvedRefsForBackendRef(input: {
  context: ToolExecutionContext;
  refs: Set<string>;
  backendRef: string | null | undefined;
  kinds: ReadonlySet<ToolExecutionRefKind>;
}): void {
  const backendRef = input.backendRef?.trim();
  if (!backendRef) return;
  for (const resolution of input.context.modelRefResolutions?.values() ?? []) {
    if (resolution.backendRef === backendRef && input.kinds.has(resolution.kind)) {
      addRefs(input.refs, [resolution.ref]);
    }
  }
}

function collectSceneFrameActorRefs(
  frame: SceneFrame,
  actorId: string,
  context?: ToolExecutionContext,
): Set<string> {
  const refs = new Set<string>();
  const actor = [
    ...frame.roster.active,
    ...frame.roster.support.filter((entry) => entry.awareness === "clear"),
  ].find((entry) => entry.id === actorId || entry.actorId === actorId);

  const actorBackendRefs = actor
    ? [actor.id, actor.actorId].filter((value): value is string => Boolean(value))
    : [actorId];
  for (const [alias, resolution] of context?.modelRefResolutions ?? []) {
    if (
      (resolution.kind === "actor" || resolution.kind === "player")
      && actorBackendRefs.includes(resolution.backendRef)
    ) {
      addRefs(refs, [alias]);
    }
  }

  if (context?.scope === "player_turn") {
    if (context.subjectActorId && actorBackendRefs.includes(context.subjectActorId)) {
      addRefs(refs, [...context.subjectActorRefs]);
    }
    return refs;
  }

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
  toolName?: RuntimeToolName | string;
}): ToolExecutionContext {
  if (
    input.context.scope === "player_turn"
    && (
      input.toolName === "move_actor"
      || input.toolName === "record_player_intent"
      || input.toolName === "start_search"
    )
  ) {
    return input.context;
  }

  return {
    ...input.context,
    subjectActorId: input.actorId,
    subjectActorRefs: collectSceneFrameActorRefs(input.frame, input.actorId, input.context),
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
  modelRefResolutions?: ReadonlyMap<string, ToolExecutionRefResolution>,
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
    const backendRefs = new Set(
      [actor.id, actor.actorId].filter((candidateRef): candidateRef is string =>
        typeof candidateRef === "string" && candidateRef.trim().length > 0)
        .map((candidateRef) => normalizeToolRef(candidateRef)),
    );
    for (const [alias, resolution] of modelRefResolutions ?? []) {
      if (
        (resolution.kind === "actor" || resolution.kind === "player" || resolution.kind === "target")
        && backendRefs.has(normalizeToolRef(resolution.backendRef))
        && legalActorRefs.has(alias)
      ) {
        matchedActorRefs.add(alias);
      }
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
  return context.scope === "player_turn" || context.scope === "actor_turn";
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
  modelSafeRefs?: readonly string[];
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
    ...(input.modelSafeRefs ?? []),
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

  addRefs(sameTurnResultRefs(context), [
    ...(result.modelSafeRefs ?? []),
    ...(result.stateReceipts ?? []).map((receipt) => receipt.stateReceipt),
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

function legacySameTurnResultRefs(
  context: ToolExecutionContext,
): Set<string> {
  return context.scope === "player_turn"
    ? new Set<string>()
    : context.sameTurnResultRefs ?? new Set<string>();
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
      `${input.path} uses a backend-only ref. Use current_scene/current_location or a short helper alias. Examples: ${refHints.join(", ") || "none"}.`,
      input.value,
      refHints,
    );
  }
  if (hasRef(input.refs, input.value)) return null;
  const refHints = modelFacingRefHints(input.refs, input.backendOnlyRefs);

  return scopedIssue(
    input.code,
    input.path,
    `${input.path} must reference ${input.description}; got an out-of-scope ref. Use current_scene/current_location or a short helper alias. Examples: ${refHints.join(", ") || "none"}.`,
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

export function writeScopesForRuntimeToolNames(
  toolNames: readonly (RuntimeToolName | string)[],
): string[] {
  const scopes = new Set<string>();
  for (const toolName of toolNames) {
    for (const scope of runtimeToolWriteScopes(toolName)) {
      scopes.add(scope);
    }
  }
  return [...scopes];
}

function runtimeToolWriteScopesForInput(
  toolName: RuntimeToolName | string,
  input: Record<string, unknown>,
): readonly string[] {
  const inputString = (key: string): string | null => {
    const value = input[key];
    return typeof value === "string" && value.trim().length > 0
      ? value.trim().toLowerCase()
      : null;
  };

  if (toolName === "log_event" && input.durability !== "durable") {
    return [];
  }

  if (toolName === "add_tag" || toolName === "remove_tag") {
    switch (inputString("entityType")) {
      case "player":
        return ["player:*:tags"];
      case "npc":
        return ["npc:*:state"];
      case "location":
        return ["location:*:state"];
      case "item":
        return ["item:*:state"];
      case "faction":
        return ["faction:*:state"];
      default:
        return runtimeToolWriteScopes(toolName);
    }
  }

  if (toolName === "set_condition") {
    return ["player:*:state"];
  }

  if (toolName === "move_actor") {
    return inputString("actorRef")
      ? ["npc:*:location", "npc:*", "location:*"]
      : ["player:*:location", "location:*"];
  }

  if (toolName === "move_to") {
    return ["player:*:location", "location:*"];
  }

  if (
    toolName === "spawn_npc"
    || toolName === "promote_npc"
    || toolName === "create_scene_extra"
  ) {
    return ["npc:*", "location:*"];
  }

  if (toolName === "spawn_item") {
    return ["item:*"];
  }

  if (toolName === "reveal_location" || toolName === "create_minor_poi") {
    return ["location:*"];
  }

  return runtimeToolWriteScopes(toolName);
}

function writeScopeCovered(input: {
  allowedWriteScopes?: readonly string[];
  descriptorScope: string;
}): boolean {
  return input.allowedWriteScopes?.some((allowedScope) =>
    writeScopesConflict(allowedScope, input.descriptorScope)) ?? false;
}

function writeScopesCoveredForToolInput(input: {
  toolName: RuntimeToolName;
  toolInput: Record<string, unknown>;
  allowedWriteScopes?: readonly string[];
  context?: ToolExecutionContext;
}): boolean {
  const descriptorScopes =
    input.toolName === "move_to" && input.context?.scope === "actor_turn"
      ? ["npc:*:location", "location:*"]
      : runtimeToolWriteScopesForInput(input.toolName, input.toolInput);
  if (descriptorScopes.length === 0) return true;
  return descriptorScopes.every((descriptorScope) =>
    writeScopeCovered({
      allowedWriteScopes: input.allowedWriteScopes,
      descriptorScope,
    }));
}

function buildPlayerTurnAuthority(
  frame: SceneFrame,
  args: {
    allowedWriteScopes?: readonly string[];
    timePassageAllowed?: boolean;
  },
): ToolExecutionContext["authority"] {
  try {
    const clock = readWorldClock(frame.campaignId);
    return {
      baseWorldVersion: clock.worldVersion,
      sourceEntity: {
        type: "player",
        id: frame.playerActorId,
      },
      elapsedWorldTimeMinutes: 0,
      timePassageAllowed: args.timePassageAllowed === true,
      allowedWriteScopes: args.allowedWriteScopes ?? [],
    };
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes("Database not connected")
    ) {
      return {
        baseWorldVersion: frame.worldVersion,
        sourceEntity: {
          type: "player",
          id: frame.playerActorId,
        },
        elapsedWorldTimeMinutes: 0,
        timePassageAllowed: args.timePassageAllowed === true,
        allowedWriteScopes: args.allowedWriteScopes ?? [],
      };
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
        truthStatus: record.truthStatus,
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
  const allowedWriteScopes = "frame" in input
    ? input.allowedWriteScopes
    : writeScopesForRuntimeToolNames(frame.allowedTools);
  const timePassageAllowed = "frame" in input
    ? input.timePassageAllowed
    : false;
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
  const modelRefResolutions = new Map<string, ToolExecutionRefResolution>();
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
  }

  addSubjectResolvedRef({
    subjectRefs: subjectActorRefs,
    legalActorRefs,
    resolutions: modelRefResolutions,
    ref: packet.view.localScene.player.ref,
    backendRef: frame.playerActorId,
    label: packet.view.localScene.player.label,
  });
  addSubjectResolvedRef({
    subjectRefs: subjectActorRefs,
    legalActorRefs,
    resolutions: modelRefResolutions,
    ref: "current_player",
    backendRef: frame.playerActorId,
    label: "Player",
  });

  packet.internalView.visibleActors.forEach((actor, index) => {
    const promptActor = packet.view.visibleActors[index];
    if (!promptActor) return;
    const backendRef = actor.actorId ?? actor.id;
    addResolvedRefToSet({
      refs: legalActorRefs,
      resolutions: modelRefResolutions,
      ref: promptActor.ref,
      kind: actor.type === "player" ? "player" : "actor",
      backendRef,
      label: promptActor.label,
    });
    if (actor.id === frame.playerActorId || actor.actorId === frame.playerActorId) {
      addResolvedRefToSet({
        refs: subjectActorRefs,
        resolutions: modelRefResolutions,
        ref: promptActor.ref,
        kind: "player",
        backendRef,
        label: promptActor.label,
      });
    }
  });

  if (frame.currentLocationId) {
    addResolvedRefToSet({
      refs: currentLocationRefs,
      resolutions: modelRefResolutions,
      ref: "current_location",
      kind: "location",
      backendRef: frame.currentLocationId,
      label: frame.currentLocationName,
    });
    addResolvedRefToSet({
      refs: legalLocationRefs,
      resolutions: modelRefResolutions,
      ref: "current_location",
      kind: "location",
      backendRef: frame.currentLocationId,
      label: frame.currentLocationName,
    });
  }
  if (frame.currentSceneScopeId) {
    addResolvedRefToSet({
      refs: currentSceneRefs,
      resolutions: modelRefResolutions,
      ref: "current_scene",
      kind: "scene",
      backendRef: frame.currentSceneScopeId,
      label: frame.currentSceneScopeName,
    });
    addResolvedRefToSet({
      refs: legalLocationRefs,
      resolutions: modelRefResolutions,
      ref: "current_scene",
      kind: "scene",
      backendRef: frame.currentSceneScopeId,
      label: frame.currentSceneScopeName,
    });
  }

  for (const [index, candidate] of packet.internalView.legalMovement.entries()) {
    if (!candidate.connected) continue;
    const promptMovement = packet.view.legalMovement[index];
    addBackendOnlyRefs(backendOnlyRefs, [candidate.id, candidate.locationId]);
    if (!promptMovement) continue;
    addResolvedRefToSet({
      refs: legalLocationRefs,
      resolutions: modelRefResolutions,
      ref: promptMovement.ref,
      kind: "movement",
      backendRef: candidate.locationId ?? candidate.id,
      candidateId: candidate.id,
      label: promptMovement.label,
    });
    addResolvedRefToSet({
      refs: legalMovementRefs,
      resolutions: modelRefResolutions,
      ref: promptMovement.ref,
      kind: "movement",
      backendRef: candidate.locationId ?? candidate.id,
      candidateId: candidate.id,
      label: promptMovement.label,
    });
  }

  for (const [index, candidate] of packet.internalView.legalTargets.entries()) {
    const promptTarget = packet.view.legalTargets[index];
    const ref = promptTarget?.ref;
    switch (candidate.type) {
      case "actor":
        addResolvedRefToSet({
          refs: legalActorRefs,
          resolutions: modelRefResolutions,
          ref,
          kind: "actor",
          backendRef: candidate.actorId ?? candidate.id,
          candidateId: candidate.id,
          label: promptTarget?.label ?? candidate.label,
        });
        break;
      case "item":
        addResolvedRefToSet({
          refs: legalItemRefs,
          resolutions: modelRefResolutions,
          ref,
          kind: "item",
          backendRef: candidate.itemId ?? candidate.id,
          candidateId: candidate.id,
          label: promptTarget?.label ?? candidate.label,
        });
        break;
      case "location":
        addResolvedRefToSet({
          refs: legalLocationRefs,
          resolutions: modelRefResolutions,
          ref,
          kind: "location",
          backendRef: candidate.locationId ?? candidate.id,
          candidateId: candidate.id,
          label: promptTarget?.label ?? candidate.label,
        });
        break;
      case "faction":
        addResolvedRefToSet({
          refs: legalFactionRefs,
          resolutions: modelRefResolutions,
          ref,
          kind: "faction",
          backendRef: candidate.factionId ?? candidate.id,
          candidateId: candidate.id,
          label: promptTarget?.label ?? candidate.label,
        });
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

  const authority = buildPlayerTurnAuthority(frame, {
    allowedWriteScopes,
    timePassageAllowed,
  });
  const bridgeLookup = buildBridgeLookupSnapshot({
    frame,
    packet,
    playerKnownFacts: readPlayerKnownFacts(frame, authority?.baseWorldVersion),
  });
  const addressedTarget = buildDialogueAddressedTarget(
    addressedTargetInput,
    frame,
    legalActorRefs,
    modelRefResolutions,
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
    modelRefResolutions,
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
      elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes ?? 0,
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
  const backendOnlyRefs = new Set<string>();
  const modelRefResolutions = new Map<string, ToolExecutionRefResolution>();
  const targetByFactId = new Map(sceneFrame.targetCandidates.map((candidate) => [
    `target:${candidate.id}`,
    candidate,
  ]));
  addBackendOnlyRefs(backendOnlyRefs, [
    sceneFrame.campaignId,
    sceneFrame.playerActorId,
    sceneFrame.currentLocationId,
    sceneFrame.currentSceneScopeId,
    actorFrame.observer.id,
    actorFrame.observer.actorId,
    actorFrame.observer.locationId,
    actorFrame.observer.sceneScopeId,
  ]);

  for (const ref of ["self", "current_actor"]) {
    addResolvedRefToSet({
      refs: subjectActorRefs,
      resolutions: modelRefResolutions,
      ref,
      kind: "actor",
      backendRef: actorFrame.observer.actorId ?? actorFrame.observer.id,
      label: actorFrame.observer.label,
    });
    addResolvedRefToSet({
      refs: legalActorRefs,
      resolutions: modelRefResolutions,
      ref,
      kind: "actor",
      backendRef: actorFrame.observer.actorId ?? actorFrame.observer.id,
      label: actorFrame.observer.label,
    });
  }

  addResolvedRefToSet({
    refs: currentLocationRefs,
    resolutions: modelRefResolutions,
    ref: "current_location",
    kind: "location",
    backendRef: actorFrame.observer.locationId,
  });
  addResolvedRefToSet({
    refs: legalLocationRefs,
    resolutions: modelRefResolutions,
    ref: "current_location",
    kind: "location",
    backendRef: actorFrame.observer.locationId,
  });
  addResolvedRefToSet({
    refs: currentSceneRefs,
    resolutions: modelRefResolutions,
    ref: "current_scene",
    kind: "scene",
    backendRef: actorFrame.observer.sceneScopeId ?? actorFrame.observer.locationId,
  });
  addResolvedRefToSet({
    refs: legalLocationRefs,
    resolutions: modelRefResolutions,
    ref: "current_scene",
    kind: "scene",
    backendRef: actorFrame.observer.sceneScopeId ?? actorFrame.observer.locationId,
  });

  for (const candidate of sceneFrame.targetCandidates) {
    addBackendOnlyRefs(backendOnlyRefs, [
      candidate.id,
      "actorId" in candidate ? candidate.actorId : undefined,
      "itemId" in candidate ? candidate.itemId : undefined,
      "locationId" in candidate ? candidate.locationId : undefined,
      "factionId" in candidate ? candidate.factionId : undefined,
    ]);
  }

  for (const candidate of sceneFrame.movementCandidates) {
    addBackendOnlyRefs(backendOnlyRefs, [
      candidate.id,
      candidate.locationId,
    ]);
  }

  actorFrame.facts.forEach((fact, index) => {
    const ref = `f${index + 1}`;
    if (fact.route === "self_state" || fact.id.startsWith("self:")) {
      for (const refs of [subjectActorRefs, legalActorRefs]) {
        addResolvedRefToSet({
          refs,
          resolutions: modelRefResolutions,
          ref,
          kind: "actor",
          backendRef: actorFrame.observer.actorId ?? actorFrame.observer.id,
          label: actorFrame.observer.label,
        });
      }
      return;
    }
    if (fact.id.startsWith("actor:")) {
      addResolvedRefToSet({
        refs: legalActorRefs,
        resolutions: modelRefResolutions,
        ref,
        kind: "actor",
        backendRef: fact.subjectRefs[0],
      });
      return;
    }
    if (fact.id.startsWith("move:")) {
      const routeId = fact.id.slice("move:".length);
      const locationId = fact.subjectRefs[0];
      addResolvedRefToSet({
        refs: legalLocationRefs,
        resolutions: modelRefResolutions,
        ref,
        kind: "movement",
        backendRef: locationId,
        candidateId: routeId,
      });
      addResolvedRefToSet({
        refs: legalMovementRefs,
        resolutions: modelRefResolutions,
        ref,
        kind: "movement",
        backendRef: locationId,
        candidateId: routeId,
      });
      return;
    }
    const candidate = targetByFactId.get(fact.id);
    if (!candidate) return;
    switch (candidate.type) {
      case "actor":
        addResolvedRefToSet({
          refs: legalActorRefs,
          resolutions: modelRefResolutions,
          ref,
          kind: "actor",
          backendRef: candidate.actorId ?? candidate.id,
          candidateId: candidate.id,
          label: candidate.label,
        });
        break;
      case "item":
        addResolvedRefToSet({
          refs: legalItemRefs,
          resolutions: modelRefResolutions,
          ref,
          kind: "item",
          backendRef: candidate.itemId ?? candidate.id,
          candidateId: candidate.id,
          label: candidate.label,
        });
        break;
      case "location":
        addResolvedRefToSet({
          refs: legalLocationRefs,
          resolutions: modelRefResolutions,
          ref,
          kind: "location",
          backendRef: candidate.locationId ?? candidate.id,
          candidateId: candidate.id,
          label: candidate.label,
        });
        break;
      case "faction":
        addResolvedRefToSet({
          refs: legalFactionRefs,
          resolutions: modelRefResolutions,
          ref,
          kind: "faction",
          backendRef: candidate.factionId ?? candidate.id,
          candidateId: candidate.id,
          label: candidate.label,
        });
        break;
    }
  });

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
      elapsedWorldTimeMinutes: args.elapsedWorldTimeMinutes ?? 0,
      allowedWriteScopes: args.allowedWriteScopes ?? [],
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
    backendOnlyRefs,
    modelRefResolutions,
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
  const backendOnlyRefs = input.context.backendOnlyRefs ??= new Set<string>();
  addBackendOnlyRefs(
    backendOnlyRefs,
    (input.result.stateReceipts ?? []).map((receipt) => receipt.stateReceipt),
  );

  switch (input.toolName) {
    case "advance_time":
      if (input.context.authority) {
        input.context.authority.elapsedWorldTimeMinutes = 0;
      }
      break;
    case "reveal_location":
      addLocationScopedBackendOnlyRefs(backendOnlyRefs, [id]);
      {
        const alias = addSameTurnResolvedRef({
        context: input.context,
        result: input.result,
        refs: input.context.legalLocationRefs,
        aliasKind: "location",
        refKind: "movement",
        backendRef: id,
        label: name,
      });
        addRefs(input.context.legalMovementRefs, [alias]);
      }
      break;
    case "move_to":
    case "move_actor":
      if (!id) return;
      input.context.currentLocationId = id;
      input.context.currentSceneScopeId = id;
      input.context.currentLocationRefs.clear();
      input.context.currentSceneRefs.clear();
      addLocationScopedBackendOnlyRefs(backendOnlyRefs, [id]);
      input.context.modelRefResolutions ??= new Map<string, ToolExecutionRefResolution>();
      addResolvedRefToSet({
        refs: input.context.currentLocationRefs,
        resolutions: input.context.modelRefResolutions,
        ref: "current_location",
        kind: "location",
        backendRef: id,
        label: name,
      });
      addResolvedRefToSet({
        refs: input.context.currentSceneRefs,
        resolutions: input.context.modelRefResolutions,
        ref: "current_scene",
        kind: "scene",
        backendRef: id,
        label: name,
      });
      addResolvedRefsForBackendRef({
        context: input.context,
        refs: input.context.currentLocationRefs,
        backendRef: id,
        kinds: new Set<ToolExecutionRefKind>(["location", "movement", "scene"]),
      });
      addResolvedRefsForBackendRef({
        context: input.context,
        refs: input.context.currentSceneRefs,
        backendRef: id,
        kinds: new Set<ToolExecutionRefKind>(["location", "movement", "scene"]),
      });
      addRefs(input.context.legalLocationRefs, ["current_location", "current_scene"]);
      break;
    case "spawn_npc":
    case "create_scene_extra":
      addActorScopedBackendOnlyRefs(backendOnlyRefs, [actorId, id]);
      addSameTurnResolvedRef({
        context: input.context,
        result: input.result,
        refs: input.context.legalActorRefs,
        aliasKind: "actor",
        refKind: "actor",
        backendRef: actorId ?? id,
        label: name,
      });
      addCreatedActorRefsForAddressedTarget({
        context: input.context,
        toolName: input.toolName,
        toolInput: input.toolInput,
        payload,
        modelSafeRefs: input.result.modelSafeRefs,
        id,
        actorId,
        name,
      });
      break;
    case "create_minor_poi":
      addLocationScopedBackendOnlyRefs(backendOnlyRefs, [id]);
      {
        const alias = addSameTurnResolvedRef({
        context: input.context,
        result: input.result,
        refs: input.context.legalLocationRefs,
        aliasKind: "location",
        refKind: "movement",
        backendRef: id,
        label: name,
      });
        addRefs(input.context.legalMovementRefs, [alias]);
      }
      break;
    case "spawn_item":
      addItemScopedBackendOnlyRefs(backendOnlyRefs, [id]);
      addSameTurnResolvedRef({
        context: input.context,
        result: input.result,
        refs: input.context.legalItemRefs,
        aliasKind: "item",
        refKind: "item",
        backendRef: id,
        label: name,
      });
      break;
    case "transfer_item":
      addItemScopedBackendOnlyRefs(backendOnlyRefs, [readResultString(payload, "id")]);
      addSameTurnResolvedRef({
        context: input.context,
        result: input.result,
        refs: input.context.legalItemRefs,
        aliasKind: "item",
        refKind: "item",
        backendRef: readResultString(payload, "id"),
        label: readResultString(payload, "item"),
      });
      addSameTurnResolvedRef({
        context: input.context,
        result: input.result,
        refs: input.context.legalItemRefs,
        aliasKind: "item",
        refKind: "item",
        backendRef: readResultString(payload, "remainingItemId"),
        label: readResultString(payload, "remainingItem"),
      });
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

  const eventText = typeof input.text === "string" ? input.text : "";
  const textIssue = validatePlayerTurnModelTextFields({
    toolInput: input,
    context,
    pathPrefix,
    fields: ["text", "futureRelevance"],
  });
  if (textIssue) return textIssue;

  if (input.durability !== "durable") {
    return null;
  }

  if (context.scope === "player_turn") {
    return scopedIssue(
      "invalid_durability",
      `${pathPrefix}.durability`,
      "player-turn log_event is scene-local only. Use record_dialogue_outcome or record_world_fact for durable player-known facts, or a concrete state tool for state changes.",
    );
  }

  if (textHasUnsupportedActionClaim(eventText)) {
    return scopedIssue(
      "unsupported_action_claim",
      `${pathPrefix}.text`,
      "player-turn durable log_event cannot commit possession, access, item-use, or completed movement claims; use a concrete backend tool result or record the attempted/failed beat as scene_local.",
    );
  }

  return null;
}

function validateAdvanceTimeGrounding(
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  pathPrefix: string,
): ToolGroundingIssue | null {
  const textIssue = validatePlayerTurnModelTextFields({
    toolInput: input,
    context,
    pathPrefix,
    fields: ["reason"],
  });
  if (textIssue) return textIssue;

  if (context.scope !== "player_turn") return null;
  if (context.authority?.timePassageAllowed === true) return null;

  return scopedIssue(
    "missing_time_semantics",
    pathPrefix,
    "player-turn advance_time requires a typed time_passage or contextual time runtime requirement from GM Read.",
  );
}

function quickActionSourceRefs(context: ToolExecutionContext): Set<string> {
  return mergeSets(
    context.subjectActorRefs,
    context.legalActorRefs,
    context.legalItemRefs,
    context.legalLocationRefs,
    context.legalFactionRefs,
    context.legalMovementRefs,
    context.currentLocationRefs,
    context.currentSceneRefs,
    legacySameTurnResultRefs(context),
    knownFactRefs(context),
  );
}

function validateQuickActionsGrounding(
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  pathPrefix: string,
): ToolGroundingIssue | null {
  if (!Array.isArray(input.actions)) return null;
  const refs = quickActionSourceRefs(context);
  for (const [index, action] of input.actions.entries()) {
    if (!action || typeof action !== "object" || Array.isArray(action)) continue;
    const actionRecord = action as Record<string, unknown>;
    const textIssue = validatePlayerTurnModelTextFields({
      toolInput: actionRecord,
      context,
      pathPrefix: `${pathPrefix}.actions.${index}`,
      fields: ["label", "action"],
    });
    if (textIssue) return textIssue;

    if (!Array.isArray(actionRecord.sourceRefs) || actionRecord.sourceRefs.length === 0) {
      return scopedIssue(
        "invalid_source_ref",
        `${pathPrefix}.actions.${index}.sourceRefs`,
        "quick actions require at least one visible/current sourceRef or player-known fact ref.",
      );
    }

    const sourceIssue = validateRefArray({
      values: actionRecord.sourceRefs,
      refs,
      path: `${pathPrefix}.actions.${index}.sourceRefs`,
      description: "legal visible/current refs or player-known fact refs that justify the quick action",
      code: "invalid_source_ref",
      context,
    });
    if (sourceIssue) return sourceIssue;
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
    legacySameTurnResultRefs(context),
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
    legacySameTurnResultRefs(context),
    sameTurnRefsConsumableBy(context, "record_world_fact"),
    knownFactRefs(context),
  );
}

function canUseClaimSubjectTextFallback(input: {
  claim: Record<string, unknown>;
  refs: ReadonlySet<string>;
  context: ToolExecutionContext;
}): boolean {
  const subjectRef = input.claim.subjectRef;
  if (typeof subjectRef !== "string" || !subjectRef.trim()) return false;
  if (hasRef(input.refs, subjectRef)) return false;
  if (typeof input.claim.subjectText !== "string" || !input.claim.subjectText.trim()) {
    return false;
  }
  if (!strictModelFacingRefs(input.context)) return false;
  return !isUnsafeModelFacingRef(subjectRef)
    && !input.context.backendOnlyRefs?.has(normalizeToolRef(subjectRef));
}

function normalizeClaimsForTextSubjectFallback(input: {
  claims: unknown;
  refs: ReadonlySet<string>;
  context: ToolExecutionContext;
}): { claims: unknown; changed: boolean } {
  if (!Array.isArray(input.claims)) {
    return { claims: input.claims, changed: false };
  }

  let changed = false;
  const claims = input.claims.map((claim) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return claim;
    const record = claim as Record<string, unknown>;
    if (!canUseClaimSubjectTextFallback({ claim: record, refs: input.refs, context: input.context })) {
      return claim;
    }
    const { subjectRef: _subjectRef, ...rest } = record;
    changed = true;
    return rest;
  });

  return { claims, changed };
}

function recordHasAppliedNowStateEffect(input: Record<string, unknown>): boolean {
  const stateEffects = input.stateEffects;
  return Array.isArray(stateEffects)
    && stateEffects.some((effect) =>
      typeof effect === "object"
      && effect !== null
      && !Array.isArray(effect)
      && (effect as Record<string, unknown>).status === "applied_now");
}

function documentStatusClaimTargetsItem(
  claim: Record<string, unknown>,
  context: ToolExecutionContext,
): boolean {
  if (claim.claimKind !== "document_status") return false;
  const subjectRef = claim.subjectRef;
  return typeof subjectRef === "string" && hasRef(context.legalItemRefs, subjectRef);
}

function validateBackendSettledDocumentClaimsHaveStateReceipt(input: {
  toolInput: Record<string, unknown>;
  context: ToolExecutionContext;
  pathPrefix: string;
}): ToolGroundingIssue | null {
  if (input.context.scope !== "player_turn") return null;
  if (input.toolInput.truthStatus !== "settled_by_backend") return null;
  if (recordHasAppliedNowStateEffect(input.toolInput)) return null;
  const claims = input.toolInput.claims;
  if (!Array.isArray(claims)) return null;

  for (const [index, claim] of claims.entries()) {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) continue;
    if (!documentStatusClaimTargetsItem(claim as Record<string, unknown>, input.context)) {
      continue;
    }
    return scopedIssue(
      "missing_structural_claim",
      `${input.pathPrefix}.claims.${index}`,
      "backend-settled document_status for an item requires a prior item-state mutation receipt and record_dialogue_outcome.stateEffects applied_now; use speaker_asserted/unconfirmed for communication-only document observations.",
    );
  }

  return null;
}

export function normalizeToolInputForGrounding(input: {
  toolName: RuntimeToolName;
  toolInput: Record<string, unknown>;
  context: ToolExecutionContext;
}): Record<string, unknown> {
  if (input.toolName !== "record_dialogue_outcome" && input.toolName !== "record_world_fact") {
    return input.toolInput;
  }

  const refs = input.toolName === "record_dialogue_outcome"
    ? dialogueSourceRefs(input.context)
    : worldFactSourceRefs(input.context);
  const normalized = normalizeClaimsForTextSubjectFallback({
    claims: input.toolInput.claims,
    refs,
    context: input.context,
  });
  if (!normalized.changed) return input.toolInput;

  return {
    ...input.toolInput,
    claims: normalized.claims,
  };
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

function generalModelFacingRefs(context: ToolExecutionContext): Set<string> {
  return mergeSets(
    context.subjectActorRefs,
    context.legalActorRefs,
    context.legalItemRefs,
    context.legalLocationRefs,
    context.legalFactionRefs,
    context.legalMovementRefs,
    context.currentLocationRefs,
    context.currentSceneRefs,
    legacySameTurnResultRefs(context),
  );
}

function validatePlayerTurnModelText(input: {
  value: unknown;
  context: ToolExecutionContext;
  path: string;
}): ToolGroundingIssue | null {
  if (!strictModelFacingRefs(input.context)) return null;
  if (typeof input.value !== "string" || !input.value.trim()) return null;
  const backendOnlyRef = findBackendOnlyRefInModelText(input.value, input.context.backendOnlyRefs);
  const unsafePatternRef = findUnsafeBackendRefTokenInText(input.value, {
    isSafeHyphenToken: isNaturalModelFacingProseHyphenToken,
  });
  if (!unsafePatternRef && !backendOnlyRef) return null;
  const refHints = modelFacingRefHints(
    generalModelFacingRefs(input.context),
    input.context.backendOnlyRefs,
  );
  return scopedIssue(
    "invalid_source_ref",
    input.path,
    `${input.path} contains a backend-only ref in model-authored text. Use display names only in prose, helper aliases for refs, or structured ref fields instead.`,
    backendOnlyRef ?? unsafePatternRef ?? input.value,
    refHints,
  );
}

function isModelTextRefChar(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || char === "_"
    || char === "-"
    || char === ":";
}

function findBackendOnlyRefInModelText(
  value: string,
  backendOnlyRefs?: ReadonlySet<string>,
): string | null {
  if (!backendOnlyRefs?.size) return null;
  let token = "";

  const checkToken = () => {
    if (!token) return null;
    const normalized = normalizeToolRef(token);
    token = "";
    return backendOnlyRefs.has(normalized) ? normalized : null;
  };

  for (const char of value) {
    if (isModelTextRefChar(char)) {
      token += char;
      continue;
    }
    const matched = checkToken();
    if (matched) return matched;
  }

  return checkToken();
}

function validatePlayerTurnModelTextFields(input: {
  toolInput: Record<string, unknown>;
  context: ToolExecutionContext;
  pathPrefix: string;
  fields: readonly string[];
}): ToolGroundingIssue | null {
  for (const field of input.fields) {
    const issue = validatePlayerTurnModelText({
      value: input.toolInput[field],
      context: input.context,
      path: `${input.pathPrefix}.${field}`,
    });
    if (issue) return issue;
  }
  return null;
}

function validateClaimModelTextFields(input: {
  claims: unknown;
  context: ToolExecutionContext;
  pathPrefix: string;
}): ToolGroundingIssue | null {
  if (!Array.isArray(input.claims)) return null;
  for (const [index, claim] of input.claims.entries()) {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) continue;
    const record = claim as Record<string, unknown>;
    for (const field of ["subjectText", "summary"] as const) {
      const issue = validatePlayerTurnModelText({
        value: record[field],
        context: input.context,
        path: `${input.pathPrefix}.${index}.${field}`,
      });
      if (issue) return issue;
    }
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

  const textIssue = validatePlayerTurnModelTextFields({
    toolInput: input,
    context,
    pathPrefix,
    fields: ["futureRelevance", "requestedRoleText", "quote", "summary"],
  }) ?? validateClaimModelTextFields({
    claims: input.claims,
    context,
    pathPrefix: `${pathPrefix}.claims`,
  });
  if (textIssue) return textIssue;

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
      if (canUseClaimSubjectTextFallback({
        claim: claim as Record<string, unknown>,
        refs: legalClaimRefs,
        context,
      })) {
        continue;
      }
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

  const documentStateIssue = validateBackendSettledDocumentClaimsHaveStateReceipt({
    toolInput: input,
    context,
    pathPrefix,
  });
  if (documentStateIssue) return documentStateIssue;

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
      if (canUseClaimSubjectTextFallback({
        claim: claim as Record<string, unknown>,
        refs: sourceRefs,
        context,
      })) {
        continue;
      }
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

  const weakEvidenceIssue = validateWorldFactKnownEvidenceStrength(input, context, pathPrefix);
  if (weakEvidenceIssue) return weakEvidenceIssue;

  const textIssue = validatePlayerTurnModelTextFields({
    toolInput: input,
    context,
    pathPrefix,
    fields: ["futureRelevance", "summary"],
  }) ?? validateClaimModelTextFields({
    claims: input.claims,
    context,
    pathPrefix: `${pathPrefix}.claims`,
  });
  if (textIssue) return textIssue;

  return null;
}

function isStrongWorldFactTruthStatus(value: unknown): boolean {
  return value === "observed" || value === "verified";
}

function isWeakKnownFact(fact: BridgeKnownFactSnapshot): boolean {
  return fact.truthStatus !== "observed" && fact.truthStatus !== "verified";
}

function weakKnownFactRefs(context: ToolExecutionContext): Set<string> {
  const refs = new Set<string>();
  for (const fact of context.bridgeLookup?.playerKnownFacts ?? []) {
    if (!isWeakKnownFact(fact)) continue;
    addRefs(refs, [fact.id, ...fact.sourceRefs]);
  }
  return refs;
}

function firstWeakKnownFactRef(input: {
  values: unknown;
  refs: ReadonlySet<string>;
}): string | null {
  if (!Array.isArray(input.values)) return null;
  for (const value of input.values) {
    if (typeof value === "string" && hasRef(input.refs, value)) {
      return value;
    }
  }
  return null;
}

function validateWorldFactKnownEvidenceStrength(
  input: Record<string, unknown>,
  context: ToolExecutionContext,
  pathPrefix: string,
): ToolGroundingIssue | null {
  if (!isStrongWorldFactTruthStatus(input.truthStatus)) return null;
  const weakRefs = weakKnownFactRefs(context);
  if (weakRefs.size === 0) return null;

  const sourceRef = firstWeakKnownFactRef({ values: input.sourceRefs, refs: weakRefs });
  if (sourceRef) {
    return scopedIssue(
      "invalid_source_ref",
      `${pathPrefix}.sourceRefs`,
      "reported, rumored, claimed, believed, or disputed player-known facts cannot be promoted to observed/verified world facts without direct visible or backend authority evidence.",
      sourceRef,
      modelFacingRefHints(worldFactSourceRefs(context), context.backendOnlyRefs),
    );
  }

  const subjectRef = firstWeakKnownFactRef({ values: input.subjectRefs, refs: weakRefs });
  if (subjectRef) {
    return scopedIssue(
      "invalid_source_ref",
      `${pathPrefix}.subjectRefs`,
      "reported, rumored, claimed, believed, or disputed player-known facts cannot be promoted to observed/verified world facts without direct visible or backend authority evidence.",
      subjectRef,
      modelFacingRefHints(worldFactSourceRefs(context), context.backendOnlyRefs),
    );
  }

  if (Array.isArray(input.claims)) {
    for (const [index, claim] of input.claims.entries()) {
      if (!claim || typeof claim !== "object" || Array.isArray(claim)) continue;
      const subject = (claim as Record<string, unknown>).subjectRef;
      if (typeof subject === "string" && hasRef(weakRefs, subject)) {
        return scopedIssue(
          "invalid_source_ref",
          `${pathPrefix}.claims.${index}.subjectRef`,
          "reported, rumored, claimed, believed, or disputed player-known facts cannot be promoted to observed/verified world facts without direct visible or backend authority evidence.",
          subject,
          modelFacingRefHints(worldFactSourceRefs(context), context.backendOnlyRefs),
        );
      }
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
  toolInput: Record<string, unknown>;
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
      `background tool ${input.toolName} requires an authority source entity.`,
    );
  }

  if (!authority.allowedWriteScopes || authority.allowedWriteScopes.length === 0) {
    return scopedIssue(
      "missing_background_write_scope",
      input.pathPrefix,
      `background tool ${input.toolName} requires non-empty allowedWriteScopes.`,
    );
  }
  if (!writeScopesCoveredForToolInput({
    toolName: input.toolName,
    toolInput: input.toolInput,
    allowedWriteScopes: authority.allowedWriteScopes,
    context: input.context,
  })) {
    return scopedIssue(
      "missing_background_write_scope",
      input.pathPrefix,
      `background tool ${input.toolName} is outside the execution context write scopes.`,
    );
  }

  return null;
}

function validateStateBearingWriteScopeGrounding(input: {
  toolName: RuntimeToolName | string;
  toolInput: Record<string, unknown>;
  context: ToolExecutionContext;
  pathPrefix: string;
}): ToolGroundingIssue | null {
  if (!isRuntimeToolName(input.toolName)) return null;
  if (!runtimeToolRequiresExecutionAuthority(input.toolName)) return null;
  const authority = input.context.authority;
  if (!authority?.sourceEntity?.type) {
    return scopedIssue(
      input.context.scope === "background" ? "missing_background_authority" : "missing_write_scope",
      input.pathPrefix,
      `${input.context.scope} tool ${input.toolName} requires execution authority.`,
    );
  }
  if (!authority.allowedWriteScopes || authority.allowedWriteScopes.length === 0) {
    return scopedIssue(
      input.context.scope === "background" ? "missing_background_write_scope" : "missing_write_scope",
      input.pathPrefix,
      `${input.context.scope} tool ${input.toolName} requires non-empty allowedWriteScopes.`,
    );
  }
  if (!writeScopesCoveredForToolInput({
    toolName: input.toolName,
    toolInput: input.toolInput,
    allowedWriteScopes: authority.allowedWriteScopes,
    context: input.context,
  })) {
    return scopedIssue(
      input.context.scope === "background" ? "missing_background_write_scope" : "missing_write_scope",
      input.pathPrefix,
      `${input.context.scope} tool ${input.toolName} is outside the execution context write scopes.`,
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

  const toolSpecificIssue = (() => {
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
    case "advance_time":
      return validateAdvanceTimeGrounding(toolInput, input.context, path);
    case "offer_quick_actions":
      return validateQuickActionsGrounding(toolInput, input.context, path);
    case "add_chronicle_entry":
      if (input.context.scope === "player_turn") {
        return scopedIssue(
          "unsupported_tool_owner",
          path,
          "player_turn cannot author chronicle entries directly; record the concrete event/fact/dialogue receipt and let chronicle projection summarize accepted authoritative state.",
        );
      }
      return validatePlayerTurnModelTextFields({
        toolInput,
        context: input.context,
        pathPrefix: path,
        fields: ["text"],
      });
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
            legacySameTurnResultRefs(input.context),
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
  })();
  if (toolSpecificIssue) return toolSpecificIssue;

  return input.context.scope === "background"
    ? validateBackgroundGrounding({
      toolName: input.toolName,
      toolInput,
      context: input.context,
      pathPrefix: path,
    })
    : validateStateBearingWriteScopeGrounding({
      toolName: input.toolName,
      toolInput,
      context: input.context,
      pathPrefix: path,
    });
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
