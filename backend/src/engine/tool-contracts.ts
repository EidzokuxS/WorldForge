import type { RuntimeToolName } from "./runtime-tool-input-schemas.js";
import type { ToolResult } from "./tool-result.js";
import {
  RUNTIME_TOOL_DESCRIPTORS,
  RUNTIME_TOOL_STATE_EFFECT_KINDS,
  type RuntimeToolRole,
  type RuntimeToolStateEffectKind,
} from "./runtime-tool-descriptors.js";
import {
  isDialogueStateReceiptKeyForTool,
  isDialogueStructuralEffectToolName,
  normalizeDialogueStateReceiptKey,
} from "./dialogue-state-receipt-contract.js";

export type RuntimeToolContractRole = RuntimeToolRole;

export interface RuntimeRequirementLike {
  kind: string;
  topicKind?: string;
  durability?: string;
  requiresStructuralEffect?: boolean;
  effectKind?: RuntimeRequirementStateEffectKind;
  effectKinds?: readonly RuntimeRequirementStateEffectKind[];
  beatKind?: RuntimeRequirementSceneBeatKind;
}

export interface RuntimeReceiptPlan {
  primary: RuntimeRequirementLike | null;
  secondary: readonly RuntimeRequirementLike[];
  optionalContextual: readonly RuntimeRequirementLike[];
}

export interface RuntimeReceiptPlanReceipt {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  appliedStructuralEffectProofs?: readonly AppliedStructuralEffectProof[];
}

export interface RuntimeReceiptPlanStatus {
  primarySatisfied: boolean;
  secondarySatisfied: boolean;
  contextualAccepted: boolean;
  acceptedReceiptIndexes: readonly number[];
  complete: boolean;
}

export interface AppliedStructuralEffectProof {
  structuralTool: string;
  targetRef: string;
  stateKey: string;
  stateValue: string;
  stateChangeRef?: string;
  toolResultId?: string;
  resultWorldVersion?: number;
}

export interface RuntimeToolContract {
  toolName: RuntimeToolName;
  roles: RuntimeToolContractRole[];
  terminalKind?: "dialogue_outcome" | "world_fact";
}

export type ProposalTypedToolName = "record_location_event" | "actor_decision";
export type ModelToolName = RuntimeToolName | ProposalTypedToolName;
export const RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS = RUNTIME_TOOL_STATE_EFFECT_KINDS;
export type RuntimeRequirementStateEffectKind = RuntimeToolStateEffectKind;
export type RuntimeRequirementSceneBeatKind =
  | "event_log"
  | "time_passage";

export interface ModelToolContract {
  toolName: ModelToolName;
  roles: RuntimeToolContractRole[];
  terminalKind?: "dialogue_outcome" | "world_fact";
}

export const RUNTIME_TOOL_CONTRACTS: Record<RuntimeToolName, RuntimeToolContract> =
  Object.fromEntries(
    Object.entries(RUNTIME_TOOL_DESCRIPTORS).map(([toolName, descriptor]) => [
      toolName,
      {
        toolName: descriptor.toolName,
        roles: [...descriptor.roles],
        ...(descriptor.terminalKind ? { terminalKind: descriptor.terminalKind } : {}),
      },
    ]),
  ) as Record<RuntimeToolName, RuntimeToolContract>;

export const PROPOSAL_TYPED_TOOL_CONTRACTS: Record<ProposalTypedToolName, ModelToolContract> = {
  record_location_event: {
    toolName: "record_location_event",
    roles: ["state_mutation", "side_effect"],
  },
  actor_decision: {
    toolName: "actor_decision",
    roles: ["state_mutation", "side_effect"],
  },
};

export const MODEL_TOOL_CONTRACTS: Record<ModelToolName, ModelToolContract> = {
  ...RUNTIME_TOOL_CONTRACTS,
  ...PROPOSAL_TYPED_TOOL_CONTRACTS,
};

export function isRuntimeToolName(
  toolName: string | null | undefined,
): toolName is RuntimeToolName {
  return typeof toolName === "string" && Object.hasOwn(RUNTIME_TOOL_CONTRACTS, toolName);
}

export function isModelToolName(
  toolName: string | null | undefined,
): toolName is ModelToolName {
  return typeof toolName === "string" && Object.hasOwn(MODEL_TOOL_CONTRACTS, toolName);
}

export function runtimeToolHasRole(
  toolName: RuntimeToolName,
  role: RuntimeToolContractRole,
): boolean {
  return RUNTIME_TOOL_CONTRACTS[toolName]?.roles.includes(role) ?? false;
}

export function modelToolHasRole(
  toolName: ModelToolName,
  role: RuntimeToolContractRole,
): boolean {
  return MODEL_TOOL_CONTRACTS[toolName]?.roles.includes(role) ?? false;
}

export function modelToolIsSideEffecting(toolName: ModelToolName): boolean {
  return modelToolHasRole(toolName, "state_mutation")
    || modelToolHasRole(toolName, "terminal_receipt")
    || modelToolHasRole(toolName, "time_effect")
    || modelToolHasRole(toolName, "legacy_scene_beat")
    || modelToolHasRole(toolName, "side_effect");
}

export function runtimeToolIsSideEffecting(toolName: RuntimeToolName): boolean {
  return modelToolIsSideEffecting(toolName);
}

export function runtimeToolRequiresExecutionAuthority(toolName: RuntimeToolName): boolean {
  return runtimeToolIsSideEffecting(toolName)
    || runtimeToolHasRole(toolName, "authority_handle");
}

export const RUNTIME_STATE_BEARING_TOOL_NAMES: readonly RuntimeToolName[] =
  (Object.keys(RUNTIME_TOOL_CONTRACTS) as RuntimeToolName[])
    .filter(runtimeToolIsSideEffecting);

export const RUNTIME_EXECUTION_AUTHORITY_TOOL_NAMES: readonly RuntimeToolName[] =
  (Object.keys(RUNTIME_TOOL_CONTRACTS) as RuntimeToolName[])
    .filter(runtimeToolRequiresExecutionAuthority);

const STATE_MUTATION_RECEIPT_OWNER_KINDS = new Set([
  "canonical",
  "delegate",
]);

function runtimeToolsForStateEffectKind(input: {
  effectKind: RuntimeRequirementStateEffectKind;
  ownerKinds: ReadonlySet<string>;
  preparatoryFor?: boolean;
}): RuntimeToolName[] {
  return (Object.keys(RUNTIME_TOOL_DESCRIPTORS) as RuntimeToolName[])
    .filter((toolName) => {
      const effects = RUNTIME_TOOL_DESCRIPTORS[toolName].stateEffects ?? [];
      return effects.some((effect) =>
        effect.effectKind === input.effectKind
        && input.ownerKinds.has(effect.ownerKind)
        && (
          input.preparatoryFor !== true
          || effect.preparatoryFor === input.effectKind
        ));
    });
}

const STATE_MUTATION_RECEIPT_TOOLS = new Set<RuntimeToolName>(
  (Object.keys(RUNTIME_TOOL_DESCRIPTORS) as RuntimeToolName[])
    .filter((toolName) =>
      (RUNTIME_TOOL_DESCRIPTORS[toolName].stateEffects ?? [])
        .some((effect) => STATE_MUTATION_RECEIPT_OWNER_KINDS.has(effect.ownerKind))),
);

function runtimeToolsByStateEffectKind(input: {
  ownerKinds: ReadonlySet<string>;
  preparatoryFor?: boolean;
}): Record<RuntimeRequirementStateEffectKind, readonly RuntimeToolName[]> {
  const result = {} as Record<RuntimeRequirementStateEffectKind, readonly RuntimeToolName[]>;
  for (const effectKind of RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS) {
    result[effectKind] = runtimeToolsForStateEffectKind({
      effectKind,
      ownerKinds: input.ownerKinds,
      preparatoryFor: input.preparatoryFor,
    });
  }
  return result;
}

const STATE_MUTATION_RECEIPT_TOOLS_BY_EFFECT_KIND =
  runtimeToolsByStateEffectKind({ ownerKinds: STATE_MUTATION_RECEIPT_OWNER_KINDS });

const PREPARATORY_STATE_OWNER_KINDS = new Set(["preparatory"]);

const PREPARATORY_STATE_TOOLS_BY_EFFECT_KIND: Partial<Record<
  RuntimeRequirementStateEffectKind,
  readonly RuntimeToolName[]
>> = Object.fromEntries(
  RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS
    .map((effectKind) => [
      effectKind,
      runtimeToolsForStateEffectKind({
        effectKind,
        ownerKinds: PREPARATORY_STATE_OWNER_KINDS,
        preparatoryFor: true,
      }),
    ] as const)
    .filter(([, tools]) => tools.length > 0),
) as Partial<Record<RuntimeRequirementStateEffectKind, readonly RuntimeToolName[]>>;

const CONTEXTUAL_TIME_PASSAGE_RECEIPT: RuntimeRequirementLike = {
  kind: "scene_beat",
  durability: "scene_local",
  beatKind: "time_passage",
};

function isActionableRuntimeRequirement(
  requirement: RuntimeRequirementLike | null | undefined,
): requirement is RuntimeRequirementLike {
  return Boolean(
    requirement
    && requirement.kind !== "none"
    && requirement.kind !== "observation_read",
  );
}

export function buildRuntimeReceiptPlan(
  requirement: RuntimeRequirementLike | null | undefined,
): RuntimeReceiptPlan {
  const primary = isActionableRuntimeRequirement(requirement) ? requirement : null;
  return {
    primary,
    secondary: [],
    optionalContextual: primary?.kind === "state_mutation" || primary?.kind === "dialogue_outcome"
      ? [{ ...CONTEXTUAL_TIME_PASSAGE_RECEIPT }]
      : [],
  };
}

export function runtimeReceiptPlanRequirements(
  plan: RuntimeReceiptPlan,
): readonly RuntimeRequirementLike[] {
  return [
    ...(plan.primary ? [plan.primary] : []),
    ...plan.secondary,
    ...plan.optionalContextual,
  ];
}

export function requiredTerminalToolForRuntimeRequirement(
  requirement: RuntimeRequirementLike | null | undefined,
): RuntimeToolName | null {
  switch (requirement?.kind) {
    case "dialogue_outcome":
      return "record_dialogue_outcome";
    case "world_fact":
      return "record_world_fact";
    default:
      return null;
  }
}

export function canRuntimeToolSatisfyRequirement(
  toolName: RuntimeToolName | null | undefined,
  requirement: RuntimeRequirementLike | null | undefined,
): boolean {
  if (!toolName) return false;

  const requiredTerminalTool = requiredTerminalToolForRuntimeRequirement(requirement);
  if (requiredTerminalTool) return toolName === requiredTerminalTool;

  switch (requirement?.kind) {
    case "observation_read":
      return runtimeToolHasRole(toolName, "helper_observation");
    case "state_mutation":
      return stateMutationToolMatchesEffectKind(toolName, requirement);
    case "scene_beat":
      return legacySceneBeatToolMatchesBeatKind(toolName, requirement)
        || timeEffectToolMatchesBeatKind(toolName, requirement)
        || stateMutationToolMatchesEffectKind(toolName, requirement);
    default:
      return false;
  }
}

export function canRuntimeToolSatisfyReceiptPlan(
  toolName: RuntimeToolName | null | undefined,
  plan: RuntimeReceiptPlan,
): boolean {
  return runtimeReceiptPlanRequirements(plan)
    .some((requirement) => canRuntimeToolSatisfyRequirement(toolName, requirement));
}

export function runtimeRequirementStateMutationTools(
  requirement: RuntimeRequirementLike | null | undefined,
): readonly RuntimeToolName[] {
  if (
    requirement?.kind !== "state_mutation"
    && requirement?.kind !== "scene_beat"
    && requirement?.kind !== "dialogue_outcome"
  ) {
    return [];
  }
  const effectKinds = runtimeRequirementStateEffectKinds(requirement);
  return uniqueRuntimeToolNames(
    effectKinds.flatMap((effectKind) =>
      STATE_MUTATION_RECEIPT_TOOLS_BY_EFFECT_KIND[effectKind] ?? []),
  );
}

export function runtimeRequirementPreparatoryTools(
  requirement: RuntimeRequirementLike | null | undefined,
): readonly RuntimeToolName[] {
  if (
    requirement?.kind !== "state_mutation"
    && requirement?.kind !== "scene_beat"
    && requirement?.kind !== "dialogue_outcome"
  ) {
    return [];
  }
  const effectKinds = runtimeRequirementStateEffectKinds(requirement);
  return uniqueRuntimeToolNames(
    effectKinds.flatMap((effectKind) =>
      PREPARATORY_STATE_TOOLS_BY_EFFECT_KIND[effectKind] ?? []),
  );
}

export function runtimeRequirementStateEffectKinds(
  requirement: RuntimeRequirementLike | null | undefined,
): RuntimeRequirementStateEffectKind[] {
  const kinds: RuntimeRequirementStateEffectKind[] = [];
  if (requirement?.effectKind) kinds.push(requirement.effectKind);
  for (const effectKind of requirement?.effectKinds ?? []) {
    kinds.push(effectKind);
  }
  return [...new Set(kinds)];
}

export type RuntimeRequirementStructuralRoutingStatus =
  | { status: "none" }
  | { status: "missing_structural_owner_kind" }
  | {
      status: "has_structural_owner";
      effectKinds: readonly RuntimeRequirementStateEffectKind[];
      ownerTools: readonly RuntimeToolName[];
      preparatoryTools: readonly RuntimeToolName[];
    };

export function getRuntimeRequirementStructuralRoutingStatus(
  requirement: RuntimeRequirementLike | null | undefined,
): RuntimeRequirementStructuralRoutingStatus {
  if (
    requirement?.kind !== "dialogue_outcome"
    || requirement.requiresStructuralEffect !== true
  ) {
    return { status: "none" };
  }

  const effectKinds = runtimeRequirementStateEffectKinds(requirement);
  if (effectKinds.length === 0) {
    return { status: "missing_structural_owner_kind" };
  }

  return {
    status: "has_structural_owner",
    effectKinds,
    ownerTools: runtimeRequirementStateMutationTools(requirement),
    preparatoryTools: runtimeRequirementPreparatoryTools(requirement),
  };
}

function uniqueRuntimeToolNames(toolNames: readonly RuntimeToolName[]): RuntimeToolName[] {
  return [...new Set(toolNames)];
}

function stateMutationToolMatchesEffectKind(
  toolName: RuntimeToolName,
  requirement: RuntimeRequirementLike,
): boolean {
  return runtimeRequirementStateMutationTools(requirement).includes(toolName);
}

function legacySceneBeatToolMatchesBeatKind(
  toolName: RuntimeToolName,
  requirement: RuntimeRequirementLike,
): boolean {
  return requirement.kind === "scene_beat"
    && requirement.beatKind === "event_log"
    && requirement.durability === "scene_local"
    && runtimeToolHasRole(toolName, "legacy_scene_beat");
}

function timeEffectToolMatchesBeatKind(
  toolName: RuntimeToolName,
  requirement: RuntimeRequirementLike,
): boolean {
  return requirement.kind === "scene_beat"
    && requirement.beatKind === "time_passage"
    && runtimeToolHasRole(toolName, "time_effect");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanField(record: Record<string, unknown>, field: string): boolean | null {
  const value = record[field];
  return typeof value === "boolean" ? value : null;
}

function hasAppliedStructuralEffect(payload: Record<string, unknown>): boolean {
  const stateEffects = payload.stateEffects;
  if (!Array.isArray(stateEffects)) return false;
  return stateEffects.some((effect) => {
    if (!isRecord(effect)) return false;
    const structuralTool = stringField(effect, "structuralTool");
    const stateKey = stringField(effect, "stateKey");
    return stringField(effect, "status") === "applied_now"
      && structuralTool !== null
      && isDialogueStructuralEffectToolName(structuralTool)
      && stringField(effect, "targetRef") !== null
      && stateKey !== null
      && isDialogueStateReceiptKeyForTool(structuralTool, stateKey)
      && stringField(effect, "stateValue") !== null;
  });
}

function hasAppliedStructuralEffectDeclaration(payload: Record<string, unknown>): boolean {
  const stateEffects = payload.stateEffects;
  return Array.isArray(stateEffects)
    && stateEffects.some((effect) =>
      isRecord(effect) && stringField(effect, "status") === "applied_now");
}

function normalizeProofToken(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function structuralEffectProofBacksEffect(
  proof: AppliedStructuralEffectProof,
  effect: Record<string, unknown>,
): boolean {
  const stateChangeRef = stringField(effect, "stateChangeRef") ?? stringField(effect, "stateReceipt");
  if (stateChangeRef) {
    return normalizeProofToken(proof.stateChangeRef ?? "") === normalizeProofToken(stateChangeRef);
  }

  const toolResultId = stringField(effect, "toolResultId");
  if (toolResultId) {
    return normalizeProofToken(proof.toolResultId ?? "") === normalizeProofToken(toolResultId);
  }

  return false;
}

function structuralEffectProofSatisfiesRequirementOwner(
  proof: AppliedStructuralEffectProof,
  requirement: RuntimeRequirementLike | null | undefined,
): boolean {
  if (
    requirement?.kind !== "dialogue_outcome"
    || requirement.requiresStructuralEffect !== true
  ) {
    return true;
  }
  if (!isRuntimeToolName(proof.structuralTool)) return false;
  return runtimeRequirementStateMutationTools(requirement).includes(proof.structuralTool);
}

function appliedStructuralEffectsBackedByProofs(
  payload: Record<string, unknown>,
  proofs: readonly AppliedStructuralEffectProof[] | undefined,
  requirement?: RuntimeRequirementLike | null,
): boolean {
  const stateEffects = payload.stateEffects;
  if (!Array.isArray(stateEffects) || !proofs || proofs.length === 0) return false;
  const appliedEffects = stateEffects.filter((effect): effect is Record<string, unknown> =>
    isRecord(effect) && stringField(effect, "status") === "applied_now");
  return appliedEffects.length > 0
    && appliedEffects.every((effect) =>
      proofs.some((proof) =>
        structuralEffectProofBacksEffect(proof, effect)
        && structuralEffectProofSatisfiesRequirementOwner(proof, requirement)));
}

const NON_APPLIED_DIALOGUE_OUTCOME_KINDS = new Set([
  "refused",
  "silent",
  "redirected",
  "unavailable",
  "no_current_answer",
]);

function hasTypedNonApplicationOutcome(payload: Record<string, unknown>): boolean {
  return NON_APPLIED_DIALOGUE_OUTCOME_KINDS.has(stringField(payload, "outcomeKind") ?? "");
}

function isRuntimeRequirementStateEffectKind(
  value: string | null,
): value is RuntimeRequirementStateEffectKind {
  return value !== null
    && RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS.includes(
      value as RuntimeRequirementStateEffectKind,
    );
}

function nonAppliedStateEffectKinds(
  payload: Record<string, unknown>,
): Set<RuntimeRequirementStateEffectKind> {
  const stateEffects = payload.stateEffects;
  const kinds = new Set<RuntimeRequirementStateEffectKind>();
  if (!Array.isArray(stateEffects)) return kinds;
  for (const effect of stateEffects) {
    if (!isRecord(effect) || stringField(effect, "status") !== "not_applied") continue;
    const effectKind = stringField(effect, "effectKind");
    if (isRuntimeRequirementStateEffectKind(effectKind)) {
      kinds.add(effectKind);
    }
  }
  return kinds;
}

function nonApplicationOutcomeSatisfiesStructuralRequirement(
  payload: Record<string, unknown>,
  requirement: RuntimeRequirementLike | null | undefined,
): boolean {
  if (!hasTypedNonApplicationOutcome(payload)) return false;
  if (requirement?.requiresStructuralEffect !== true) return true;
  const requiredEffectKinds = runtimeRequirementStateEffectKinds(requirement);
  if (requiredEffectKinds.length === 0 || requiredEffectKinds.includes("movement")) {
    return false;
  }
  const nonAppliedKinds = nonAppliedStateEffectKinds(payload);
  return requiredEffectKinds.every((effectKind) => nonAppliedKinds.has(effectKind));
}

export function dialogueOutcomeSatisfiesStructuralRequirement(
  payload: Record<string, unknown> | null,
  options: {
    appliedStructuralEffectProofs?: readonly AppliedStructuralEffectProof[];
    requirement?: RuntimeRequirementLike | null;
  } = {},
): boolean {
  if (!payload) return false;
  return nonApplicationOutcomeSatisfiesStructuralRequirement(payload, options.requirement)
    || appliedStructuralEffectsBackedByProofs(
      payload,
      options.appliedStructuralEffectProofs,
      options.requirement,
    );
}

function isObservationOnlyToolResult(result: ToolResult): boolean {
  return result.observationOnly === true || result.kind === "observation";
}

function payloadSatisfiesDurability(
  payload: Record<string, unknown> | null,
  requiredDurability: string | undefined,
): boolean {
  if (!requiredDurability) return true;
  if (!payload || stringField(payload, "durability") !== requiredDurability) {
    return false;
  }
  return requiredDurability !== "durable" || booleanField(payload, "persisted") === true;
}

function hasAuthoritativeStateDelta(result: ToolResult): boolean {
  return typeof result.authority?.resultWorldVersion === "number"
    && Array.isArray(result.authority.stateDeltaRefs)
    && result.authority.stateDeltaRefs.length > 0;
}

function hasLegacySceneBeatAuthorityReceipt(
  result: ToolResult,
  requirement: RuntimeRequirementLike | null | undefined,
): boolean {
  const authority = result.authority;
  if (!authority?.toolResultId) return false;
  const payload = isRecord(result.result) ? result.result : null;
  const durableEventLog = requirement?.durability === "durable"
    || stringField(payload ?? {}, "durability") === "durable";

  if (durableEventLog) {
    return typeof authority.resultWorldVersion === "number"
      && Array.isArray(authority.eventRefs)
      && authority.eventRefs.length > 0;
  }

  return typeof authority.resultWorldVersion === "number"
    && authority.stateDeltaRefs.includes("world:event");
}

function hasActorMoveToAuthorityReceipt(result: ToolResult): boolean {
  const authority = result.authority;
  if (!authority?.toolResultId || typeof authority.resultWorldVersion !== "number") {
    return false;
  }
  const payload = isRecord(result.result) ? result.result : null;
  const actorId = stringField(payload ?? {}, "actorId");
  const playerId = stringField(payload ?? {}, "playerId");
  const locationId = stringField(payload ?? {}, "locationId");
  if (!actorId || playerId || !locationId) {
    return false;
  }
  if (authority.sourceEntity?.type !== "npc" || authority.sourceEntity.id !== actorId) {
    return false;
  }
  return authority.stateDeltaRefs.includes(`npc:${actorId}:location`)
    && authority.stateDeltaRefs.includes(`location:${locationId}`)
    && !authority.stateDeltaRefs.some((ref) => ref.startsWith("player:"));
}

function hasTerminalAuthorityReceipt(
  toolName: RuntimeToolName,
  result: ToolResult,
  requirement: RuntimeRequirementLike | null | undefined,
): boolean {
  const authority = result.authority;
  if (!authority?.toolResultId) return false;
  const payload = isRecord(result.result) ? result.result : null;
  if (!payload) return false;
  const durableReceipt = requirement?.durability === "durable"
    || stringField(payload ?? {}, "durability") === "durable";
  if (durableReceipt && typeof authority.resultWorldVersion !== "number") {
    return false;
  }

  if (toolName === "record_world_fact") {
    const knowledgeRefs = [
      stringField(payload, "knowledgeId"),
      stringField(payload, "factRef"),
    ].filter((ref): ref is string => Boolean(ref));
    return stringField(payload, "durability") === "durable"
      && booleanField(payload, "persisted") === true
      && typeof authority.resultWorldVersion === "number"
      && authority.stateDeltaRefs.includes("world:fact")
      && knowledgeRefs.length > 0
      && knowledgeRefs.some((ref) => authority.knowledgeOutputs.includes(ref));
  }

  if (toolName === "record_dialogue_outcome") {
    if (!durableReceipt) {
      return typeof authority.resultWorldVersion === "number"
        && authority.stateDeltaRefs.includes("world:dialogue");
    }
    const eventId = stringField(payload, "eventId");
    if (!eventId || !authority.eventRefs.includes(eventId)) return false;
    if (
      !authority.stateDeltaRefs.includes("world:dialogue")
      || !authority.stateDeltaRefs.includes("world:event")
    ) {
      return false;
    }
    const knowledgeRefs = [
      stringField(payload, "knowledgeId"),
      stringField(payload, "factRef"),
    ].filter((ref): ref is string => Boolean(ref));
    if (knowledgeRefs.length > 0 && !authority.stateDeltaRefs.includes("world:fact")) {
      return false;
    }
    return knowledgeRefs.length === 0
      || knowledgeRefs.some((ref) => authority.knowledgeOutputs.includes(ref));
  }

  return false;
}

export function isAcceptedTerminalToolResult(input: {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  requirement: RuntimeRequirementLike | null | undefined;
  appliedStructuralEffectProofs?: readonly AppliedStructuralEffectProof[];
}): boolean {
  if (!input.toolName || !input.result?.success || input.result.status === "failure") {
    return false;
  }

  const requiredTool = requiredTerminalToolForRuntimeRequirement(input.requirement);
  if (!requiredTool || input.toolName !== requiredTool) return false;
  if (!runtimeToolHasRole(input.toolName, "terminal_receipt")) return false;
  if (input.result.contractFailure) return false;
  if (isObservationOnlyToolResult(input.result)) return false;
  if (!hasTerminalAuthorityReceipt(input.toolName, input.result, input.requirement)) return false;

  const payload = isRecord(input.result.result) ? input.result.result : null;
  if (
    input.toolName === "record_dialogue_outcome"
    && payload
    && hasAppliedStructuralEffectDeclaration(payload)
  ) {
    if (!appliedStructuralEffectsBackedByProofs(
      payload,
      input.appliedStructuralEffectProofs,
      input.requirement,
    )) {
      return false;
    }
  }
  const requiredTopicKind = input.requirement?.topicKind;
  if (requiredTopicKind) {
    if (!payload || stringField(payload, "topicKind") !== requiredTopicKind) {
      return false;
    }
  }
  const requiredDurability = input.requirement?.durability;
  if (requiredDurability) {
    if (!payloadSatisfiesDurability(payload, requiredDurability)) {
      return false;
    }
  }
  if (input.requirement?.requiresStructuralEffect === true) {
    if (!dialogueOutcomeSatisfiesStructuralRequirement(payload, {
      appliedStructuralEffectProofs: input.appliedStructuralEffectProofs,
      requirement: input.requirement,
    })) {
      return false;
    }
  }

  return true;
}

export function isAcceptedRuntimeReceipt(input: {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  requirement: RuntimeRequirementLike | null | undefined;
  appliedStructuralEffectProofs?: readonly AppliedStructuralEffectProof[];
}): boolean {
  if (!input.toolName || !input.result?.success || input.result.status === "failure") {
    return false;
  }
  if (input.result.contractFailure) return false;

  if (isAcceptedTerminalToolResult(input)) return true;
  if (isObservationOnlyToolResult(input.result)) return false;

  switch (input.requirement?.kind) {
    case "state_mutation":
      return stateMutationToolMatchesEffectKind(input.toolName, input.requirement)
        && hasAuthoritativeStateDelta(input.result);
    case "scene_beat": {
      if (stateMutationToolMatchesEffectKind(input.toolName, input.requirement)) {
        return hasAuthoritativeStateDelta(input.result);
      }
      if (timeEffectToolMatchesBeatKind(input.toolName, input.requirement)) {
        return hasAuthoritativeStateDelta(input.result);
      }
      if (!legacySceneBeatToolMatchesBeatKind(input.toolName, input.requirement)) {
        return false;
      }
      const payload = isRecord(input.result.result) ? input.result.result : null;
      return payloadSatisfiesDurability(payload, input.requirement?.durability)
        && hasLegacySceneBeatAuthorityReceipt(input.result, input.requirement);
    }
    default:
      return false;
  }
}

export function isAcceptedRuntimeReceiptForTurn(input: {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  requirement: RuntimeRequirementLike | null | undefined;
  appliedStructuralEffectProofs?: readonly AppliedStructuralEffectProof[];
}): boolean {
  if (input.requirement) {
    return isAcceptedRuntimeReceipt(input);
  }
  if (
    input.toolName
    && input.result
    && input.result.success
    && input.result.status !== "failure"
    && !input.result.contractFailure
    && !isObservationOnlyToolResult(input.result)
    && STATE_MUTATION_RECEIPT_TOOLS.has(input.toolName)
    && hasAuthoritativeStateDelta(input.result)
  ) {
    return true;
  }
  return (
    (input.toolName && runtimeToolHasRole(input.toolName, "legacy_scene_beat")
      ? isAcceptedRuntimeReceipt({
        toolName: input.toolName,
        result: input.result,
        requirement: { kind: "scene_beat", durability: "scene_local", beatKind: "event_log" },
        appliedStructuralEffectProofs: input.appliedStructuralEffectProofs,
      })
      : false)
    || (input.toolName && runtimeToolHasRole(input.toolName, "time_effect")
      ? isAcceptedRuntimeReceipt({
        toolName: input.toolName,
        result: input.result,
        requirement: { kind: "scene_beat", beatKind: "time_passage" },
        appliedStructuralEffectProofs: input.appliedStructuralEffectProofs,
      })
      : false)
    || isAcceptedTerminalToolResult({
      toolName: input.toolName,
      result: input.result,
      requirement: { kind: "dialogue_outcome" },
      appliedStructuralEffectProofs: input.appliedStructuralEffectProofs,
    })
    || isAcceptedTerminalToolResult({
      toolName: input.toolName,
      result: input.result,
      requirement: { kind: "world_fact" },
      appliedStructuralEffectProofs: input.appliedStructuralEffectProofs,
    })
  );
}

export function isAcceptedRuntimeReceiptForActorProcess(input: {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  requirement?: RuntimeRequirementLike | null | undefined;
  appliedStructuralEffectProofs?: readonly AppliedStructuralEffectProof[];
}): boolean {
  if (
    input.toolName === "move_to"
    && input.result?.success === true
    && input.result.status !== "failure"
    && !input.result.contractFailure
    && !isObservationOnlyToolResult(input.result)
  ) {
    return hasActorMoveToAuthorityReceipt(input.result);
  }
  if (
    input.toolName === "log_event"
    && input.result?.success === true
    && input.result.status !== "failure"
    && !input.result.contractFailure
    && !isObservationOnlyToolResult(input.result)
  ) {
    const payload = isRecord(input.result.result) ? input.result.result : null;
    if (stringField(payload ?? {}, "durability") === "durable") {
      return payloadSatisfiesDurability(payload, "durable")
        && hasLegacySceneBeatAuthorityReceipt(input.result, {
          kind: "scene_beat",
          durability: "durable",
          beatKind: "event_log",
        });
    }
  }
  return isAcceptedRuntimeReceiptForTurn({
    toolName: input.toolName,
    result: input.result,
    requirement: input.requirement ?? null,
    appliedStructuralEffectProofs: input.appliedStructuralEffectProofs,
  });
}

export function isAcceptedRuntimeReceiptForPlan(input: {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  plan: RuntimeReceiptPlan;
  appliedStructuralEffectProofs?: readonly AppliedStructuralEffectProof[];
}): boolean {
  return Boolean(
    input.plan.primary
    && isAcceptedRuntimeReceipt({
      toolName: input.toolName,
      result: input.result,
      requirement: input.plan.primary,
      appliedStructuralEffectProofs: input.appliedStructuralEffectProofs,
    }),
  );
}

export function isRuntimeReceiptAllowedByPlan(input: {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  plan: RuntimeReceiptPlan;
  appliedStructuralEffectProofs?: readonly AppliedStructuralEffectProof[];
}): boolean {
  return runtimeReceiptPlanRequirements(input.plan)
    .some((requirement) =>
      isAcceptedRuntimeReceipt({
        toolName: input.toolName,
        result: input.result,
        requirement,
        appliedStructuralEffectProofs: input.appliedStructuralEffectProofs,
      }));
}

export function evaluateRuntimeReceiptPlanStatus(input: {
  plan: RuntimeReceiptPlan;
  receipts: readonly RuntimeReceiptPlanReceipt[];
}): RuntimeReceiptPlanStatus {
  const acceptedReceiptIndexes = new Set<number>();
  let primarySatisfied = input.plan.primary === null;
  let primaryAcceptedIndex: number | null = null;
  let contextualAccepted = false;
  const secondarySatisfiedIndexes = new Set<number>();

  input.receipts.forEach((receipt, index) => {
    if (
      input.plan.primary
      && isAcceptedRuntimeReceipt({
        toolName: receipt.toolName,
        result: receipt.result,
        requirement: input.plan.primary,
        appliedStructuralEffectProofs: receipt.appliedStructuralEffectProofs,
      })
    ) {
      primarySatisfied = true;
      if (primaryAcceptedIndex === null) {
        primaryAcceptedIndex = index;
        acceptedReceiptIndexes.add(index);
      }
    }

    input.plan.secondary.forEach((requirement, requirementIndex) => {
      if (isAcceptedRuntimeReceipt({
        toolName: receipt.toolName,
        result: receipt.result,
        requirement,
        appliedStructuralEffectProofs: receipt.appliedStructuralEffectProofs,
      })) {
        secondarySatisfiedIndexes.add(requirementIndex);
        acceptedReceiptIndexes.add(index);
      }
    });
  });

  if (primarySatisfied) {
    input.receipts.forEach((receipt, index) => {
      if (acceptedReceiptIndexes.has(index)) return;
      const acceptedContextual = input.plan.optionalContextual.some((requirement) =>
        isAcceptedRuntimeReceipt({
          toolName: receipt.toolName,
          result: receipt.result,
          requirement,
          appliedStructuralEffectProofs: receipt.appliedStructuralEffectProofs,
        }));
      if (acceptedContextual) {
        contextualAccepted = true;
        acceptedReceiptIndexes.add(index);
      }
    });
  }

  const secondarySatisfied = secondarySatisfiedIndexes.size === input.plan.secondary.length;
  return {
    primarySatisfied,
    secondarySatisfied,
    contextualAccepted,
    acceptedReceiptIndexes: [...acceptedReceiptIndexes].sort((a, b) => a - b),
    complete: primarySatisfied && secondarySatisfied,
  };
}
