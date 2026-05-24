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
  return runtimeToolIsSideEffecting(toolName);
}

export const RUNTIME_STATE_BEARING_TOOL_NAMES: readonly RuntimeToolName[] =
  (Object.keys(RUNTIME_TOOL_CONTRACTS) as RuntimeToolName[])
    .filter(runtimeToolRequiresExecutionAuthority);

const STATE_MUTATION_RECEIPT_OWNER_KINDS = new Set([
  "canonical",
  "delegate",
  "legacy",
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
    optionalContextual: primary?.kind === "state_mutation"
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

const NON_APPLIED_DIALOGUE_OUTCOME_KINDS = new Set([
  "refused",
  "silent",
  "redirected",
  "unavailable",
  "no_current_answer",
]);

function hasTypedNonApplicationOutcome(payload: Record<string, unknown>): boolean {
  const stateEffects = payload.stateEffects;
  const hasTypedNonApplicationEffect = Array.isArray(stateEffects)
    && stateEffects.some((effect) =>
      isRecord(effect) && stringField(effect, "status") === "not_applied");
  return hasTypedNonApplicationEffect
    || NON_APPLIED_DIALOGUE_OUTCOME_KINDS.has(stringField(payload, "outcomeKind") ?? "");
}

export function dialogueOutcomeSatisfiesStructuralRequirement(
  payload: Record<string, unknown> | null,
  options: { appliedStructuralEffectsBacked?: boolean } = {},
): boolean {
  if (!payload) return false;
  return hasTypedNonApplicationOutcome(payload)
    || (
      options.appliedStructuralEffectsBacked === true
      && hasAppliedStructuralEffect(payload)
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

  return (Array.isArray(authority.eventRefs) && authority.eventRefs.length > 0)
    || (Array.isArray(authority.stateDeltaRefs) && authority.stateDeltaRefs.length > 0)
    || (Array.isArray(authority.knowledgeOutputs) && authority.knowledgeOutputs.length > 0);
}

function hasTerminalAuthorityReceipt(
  result: ToolResult,
  requirement: RuntimeRequirementLike | null | undefined,
): boolean {
  const authority = result.authority;
  if (!authority?.toolResultId) return false;
  const hasRefs = authority.stateDeltaRefs.length > 0
    || authority.eventRefs.length > 0
    || authority.knowledgeOutputs.length > 0;
  if (!hasRefs) return false;
  const payload = isRecord(result.result) ? result.result : null;
  const durableReceipt = requirement?.durability === "durable"
    || stringField(payload ?? {}, "durability") === "durable";
  if (!durableReceipt) return true;
  return typeof authority.resultWorldVersion === "number";
}

export function isAcceptedTerminalToolResult(input: {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  requirement: RuntimeRequirementLike | null | undefined;
  appliedStructuralEffectsBacked?: boolean;
}): boolean {
  if (!input.toolName || !input.result?.success || input.result.status === "failure") {
    return false;
  }

  const requiredTool = requiredTerminalToolForRuntimeRequirement(input.requirement);
  if (!requiredTool || input.toolName !== requiredTool) return false;
  if (!runtimeToolHasRole(input.toolName, "terminal_receipt")) return false;
  if (input.result.contractFailure) return false;
  if (isObservationOnlyToolResult(input.result)) return false;
  if (!hasTerminalAuthorityReceipt(input.result, input.requirement)) return false;

  const payload = isRecord(input.result.result) ? input.result.result : null;
  if (
    input.toolName === "record_dialogue_outcome"
    && payload
    && hasAppliedStructuralEffectDeclaration(payload)
  ) {
    if (
      input.appliedStructuralEffectsBacked !== true
      || !hasAppliedStructuralEffect(payload)
    ) {
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
      appliedStructuralEffectsBacked: input.appliedStructuralEffectsBacked === true,
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
  appliedStructuralEffectsBacked?: boolean;
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
  appliedStructuralEffectsBacked?: boolean;
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
        requirement: { kind: "scene_beat", beatKind: "event_log" },
        appliedStructuralEffectsBacked: input.appliedStructuralEffectsBacked,
      })
      : false)
    || (input.toolName && runtimeToolHasRole(input.toolName, "time_effect")
      ? isAcceptedRuntimeReceipt({
        toolName: input.toolName,
        result: input.result,
        requirement: { kind: "scene_beat", beatKind: "time_passage" },
        appliedStructuralEffectsBacked: input.appliedStructuralEffectsBacked,
      })
      : false)
    || isAcceptedTerminalToolResult({
      toolName: input.toolName,
      result: input.result,
      requirement: { kind: "dialogue_outcome" },
      appliedStructuralEffectsBacked: input.appliedStructuralEffectsBacked,
    })
    || isAcceptedTerminalToolResult({
      toolName: input.toolName,
      result: input.result,
      requirement: { kind: "world_fact" },
      appliedStructuralEffectsBacked: input.appliedStructuralEffectsBacked,
    })
  );
}

export function isAcceptedRuntimeReceiptForPlan(input: {
  toolName: RuntimeToolName | null | undefined;
  result: ToolResult | null | undefined;
  plan: RuntimeReceiptPlan;
  appliedStructuralEffectsBacked?: boolean;
}): boolean {
  return runtimeReceiptPlanRequirements(input.plan)
    .some((requirement) =>
      isAcceptedRuntimeReceipt({
        toolName: input.toolName,
        result: input.result,
        requirement,
        appliedStructuralEffectsBacked: input.appliedStructuralEffectsBacked,
      }));
}
