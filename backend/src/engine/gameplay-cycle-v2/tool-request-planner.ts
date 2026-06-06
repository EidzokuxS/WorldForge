import { z } from "zod";
import {
  assertGameplayToolRequestV2,
  gameplayToolRequestV2Schema,
  type GameplayToolIdV2,
  type GameplayToolRequestV2,
  type GmActionChecklistV2,
  type GmActionChecklistStepV2,
  type ModelFacingTurnPacketV2,
  type RuntimeCapabilityIdV2,
} from "./contracts.js";
import { capabilityForEffectKindV2, getRuntimeCapabilityDefinitionV2 } from "./capability-catalog.js";

const FORBIDDEN_TOOL_REQUEST_KEYS = new Set([
  "args",
  "candidateToolRequest",
  "input",
  "payload",
  "plannedTools",
  "receipt",
  "result",
  "stateDelta",
  "statePatch",
  "tool",
  "toolCall",
  "toolInput",
  "toolName",
  "worldDelta",
]);

const LEGACY_TOOL_SURFACE_VALUES = new Set([
  "move_to",
  "move_actor",
  "spawn_npc",
  "log_event",
  "record_dialogue_outcome",
  "record_world_fact",
  "add_tag",
  "transfer_item",
  "check_route",
  "create_scene_extra",
  "plannedTools",
  "candidateToolRequest",
  "toolName",
]);

const TOOL_BY_CAPABILITY: Partial<Record<RuntimeCapabilityIdV2, GameplayToolIdV2>> = {
  route_check: "route.check.v2",
  movement: "actor.move.v2",
  dialogue_record: "dialogue.record.v2",
  world_fact_record: "world_fact.record.v2",
  support_actor_create: "support_actor.create.v2",
  entity_tag: "entity.tag.v2",
  item_transfer: "item.transfer.v2",
  condition_set: "actor.condition_set.v2",
  time_advance: "time.advance.v2",
  scene_beat_record: "scene_beat.record.v2",
  location_reveal: "location.reveal.v2",
  minor_poi_create: "minor_poi.create.v2",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(key: string): string {
  return key.replace(/[\s_-]/gu, "").toLowerCase();
}

function lowerSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizedActorLabel(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/gu, " ").toLowerCase();
}

function forbiddenPayloadPaths(value: unknown): string[] {
  const normalizedForbidden = new Set([...FORBIDDEN_TOOL_REQUEST_KEYS].map(normalizedKey));
  const paths: string[] = [];

  function visit(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      if (
        FORBIDDEN_TOOL_REQUEST_KEYS.has(key)
        || normalizedForbidden.has(normalizedKey(key))
      ) {
        paths.push(childPath);
      }
      visit(child, childPath);
    }
  }

  visit(value, "");
  return paths;
}

function legacySurfacePaths(value: unknown): string[] {
  const paths: string[] = [];

  function visit(node: unknown, path: string): void {
    if (typeof node === "string" && LEGACY_TOOL_SURFACE_VALUES.has(node.trim())) {
      paths.push(path || "<root>");
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      visit(child, path ? `${path}.${key}` : key);
    }
  }

  visit(value, "");
  return paths;
}

function collectModelRefs(value: unknown): string[] {
  const refs: string[] = [];

  function visit(node: unknown, key: string): void {
    if (typeof node === "string") {
      if (key.endsWith("Ref")) refs.push(node);
      return;
    }
    if (Array.isArray(node)) {
      if (key.endsWith("Refs")) {
        for (const entry of node) {
          if (typeof entry === "string") refs.push(entry);
        }
        return;
      }
      node.forEach((entry) => visit(entry, key));
      return;
    }
    if (!isRecord(node)) return;
    for (const [childKey, child] of Object.entries(node)) {
      visit(child, childKey);
    }
  }

  visit(value, "");
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
}

function issueFromZod(issue: z.core.$ZodIssue): ToolRequestPlannerIssueV2 {
  return {
    code: "schema_invalid",
    path: issue.path.join(".") || "<root>",
    message: issue.message,
  };
}

function stepRefs(step: GmActionChecklistStepV2): string[] {
  return [
    step.actorRef,
    ...step.targetRefs,
    ...step.evidenceRefs,
  ];
}

export interface ToolRequestPlannerIssueV2 {
  code:
    | "capability_mismatch"
    | "executable_payload"
    | "legacy_tool_surface"
    | "private_term_leak"
    | "schema_invalid"
    | "step_mismatch"
    | "uncited_ref"
    | "unavailable_capability";
  path: string;
  message: string;
}

export interface ToolRequestPlannerAcceptedV2 {
  status: "accepted";
  request: GameplayToolRequestV2;
  issues: [];
}

export interface ToolRequestPlannerRejectedV2 {
  status: "rejected";
  request: null;
  issues: ToolRequestPlannerIssueV2[];
}

export type ToolRequestPlannerResultV2 =
  | ToolRequestPlannerAcceptedV2
  | ToolRequestPlannerRejectedV2;

export function toolIdForCapabilityV2(
  capabilityId: RuntimeCapabilityIdV2,
): GameplayToolIdV2 | null {
  return TOOL_BY_CAPABILITY[capabilityId] ?? null;
}

export function buildDeterministicSimpleToolRequestV2(input: {
  packet: ModelFacingTurnPacketV2;
  step: GmActionChecklistStepV2;
}): GameplayToolRequestV2 | null {
  const destinationRef = input.step.targetRefs[0];
  const evidenceRefs = uniqueStrings([
    input.step.actorRef,
    ...input.step.evidenceRefs,
    ...input.step.targetRefs,
  ]);

  if (input.step.requiredCapabilityId === "route_check" && destinationRef) {
    return assertGameplayToolRequestV2({
      version: "gameplay-tool-request.v2",
      requestId: `req-${input.packet.turnId}-${input.step.stepId}`,
      stepId: input.step.stepId,
      capabilityId: "route_check",
      toolId: "route.check.v2",
      effectBinding: {
        actorRef: input.step.actorRef,
        destinationRef,
        evidenceRefs,
      },
    });
  }

  if (input.step.requiredCapabilityId === "movement" && destinationRef) {
    return assertGameplayToolRequestV2({
      version: "gameplay-tool-request.v2",
      requestId: `req-${input.packet.turnId}-${input.step.stepId}`,
      stepId: input.step.stepId,
      capabilityId: "movement",
      toolId: "actor.move.v2",
      effectBinding: {
        actorRef: input.step.actorRef,
        destinationRef,
        travelMode: "walk",
        evidenceRefs,
      },
    });
  }

  return null;
}

export function validateGameplayToolRequestV2(input: {
  packet: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  stepId: string;
  candidate: unknown;
}): ToolRequestPlannerResultV2 {
  const issues: ToolRequestPlannerIssueV2[] = [];

  issues.push(...forbiddenPayloadPaths(input.candidate).map((path) => ({
    code: "executable_payload" as const,
    path,
    message: "Tool request cannot contain legacy executable payload/result/state fields.",
  })));
  issues.push(...legacySurfacePaths(input.candidate).map((path) => ({
    code: "legacy_tool_surface" as const,
    path,
    message: "Tool request must use clean gameplay-cycle-v2 tool ids, not old runtime tool names.",
  })));

  const parsed = gameplayToolRequestV2Schema.safeParse(input.candidate);
  const step = input.checklist.steps.find((candidateStep) =>
    candidateStep.stepId === input.stepId);

  if (
    isRecord(input.candidate)
    && typeof input.candidate.stepId === "string"
    && input.candidate.stepId !== input.stepId
  ) {
    issues.push({
      code: "step_mismatch",
      path: "stepId",
      message: "Tool request stepId must match the selected checklist step.",
    });
  }
  if (!step) {
    issues.push({
      code: "step_mismatch",
      path: "stepId",
      message: `Checklist does not contain requested stepId "${input.stepId}".`,
    });
  }
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(issueFromZod));
  }

  if (parsed.success && step) {
    const request = parsed.data;
    const availableCapabilities = new Set(
      input.packet.capabilities.map((capability) => capability.capabilityId),
    );
    const capabilityDefinition = getRuntimeCapabilityDefinitionV2(request.capabilityId);
    const expectedCapability = capabilityForEffectKindV2(step.intendedEffect.kind);
    const expectedToolId = toolIdForCapabilityV2(step.requiredCapabilityId);

    if (request.stepId !== input.stepId || request.stepId !== step.stepId) {
      issues.push({
        code: "step_mismatch",
        path: "stepId",
        message: "Tool request stepId must match exactly one selected checklist step.",
      });
    }
    if (!availableCapabilities.has(request.capabilityId)) {
      issues.push({
        code: "unavailable_capability",
        path: "capabilityId",
        message: `Capability "${request.capabilityId}" is not exposed in the model-facing packet.`,
      });
    }
    if (capabilityDefinition.plannerSurface !== "tool_request") {
      issues.push({
        code: "unavailable_capability",
        path: "capabilityId",
        message: `Capability "${request.capabilityId}" is not a tool-request planning surface.`,
      });
    }
    if (
      request.capabilityId !== step.requiredCapabilityId
      || step.requiredCapabilityId !== expectedCapability
    ) {
      issues.push({
        code: "capability_mismatch",
        path: "capabilityId",
        message: `Tool request capability must match checklist effect "${step.intendedEffect.kind}".`,
      });
    }
    if (expectedToolId !== request.toolId) {
      issues.push({
        code: "capability_mismatch",
        path: "toolId",
        message: `Capability "${step.requiredCapabilityId}" requires toolId "${expectedToolId}".`,
      });
    }
    if (request.toolId === "support_actor.create.v2") {
      const requestedLabels = [
        request.effectBinding.displayName,
        request.effectBinding.roleLabel,
      ].map(normalizedActorLabel).filter(Boolean);
      const existingActorLabels = new Set(input.packet.scene.actors
        .map((actor) => normalizedActorLabel(actor.label))
        .filter(Boolean));
      const existingActorRefs = new Set(input.packet.scene.actors
        .map((actor) => normalizedActorLabel(actor.ref))
        .filter(Boolean));
      if (requestedLabels.some((label) => existingActorLabels.has(label) || existingActorRefs.has(label))) {
        issues.push({
          code: "capability_mismatch",
          path: "effectBinding.displayName",
          message: "support_actor.create.v2 can create only new non-player support actors; it cannot duplicate Player or any already modeled scene actor.",
        });
      }
    }

    const citableRefs = lowerSet(input.packet.citableRefs);
    const allowedStepRefs = lowerSet(stepRefs(step));
    for (const ref of collectModelRefs(request.effectBinding)) {
      const lowered = ref.toLowerCase();
      if (!citableRefs.has(lowered) || !allowedStepRefs.has(lowered)) {
        issues.push({
          code: "uncited_ref",
          path: "effectBinding",
          message: `Tool request cited ref "${ref}" outside the selected checklist step refs.`,
        });
      }
    }

    const publicRequestText = JSON.stringify(request).toLowerCase();
    for (const term of input.packet.runtimePrivateGuardTerms) {
      if (term.trim() && publicRequestText.includes(term.trim().toLowerCase())) {
        issues.push({
          code: "private_term_leak",
          path: "request",
          message: `Private guard term "${term}" leaked into the tool request.`,
        });
      }
    }
  }

  if (issues.length > 0 || !parsed.success) {
    return {
      status: "rejected",
      request: null,
      issues,
    };
  }

  return {
    status: "accepted",
    request: assertGameplayToolRequestV2(parsed.data),
    issues: [],
  };
}
