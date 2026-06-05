import { z } from "zod";
import {
  assertGmActionChecklistV2,
  gmActionChecklistV2Schema,
  type GmActionChecklistEffectKindV2,
  type GmActionChecklistV2,
  type GmReadChecklistV2,
  type ModelFacingTurnPacketV2,
  type RuntimeCapabilityIdV2,
} from "./contracts.js";
import { capabilityForEffectKindV2 } from "./capability-catalog.js";

const EXECUTABLE_PAYLOAD_KEYS = new Set([
  "args",
  "candidateToolRequest",
  "input",
  "payload",
  "plannedTools",
  "stateDelta",
  "statePatch",
  "tool",
  "toolCall",
  "toolInput",
  "toolName",
  "worldDelta",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(key: string): string {
  return key.replace(/[\s_-]/gu, "").toLowerCase();
}

function executablePayloadPaths(value: unknown): string[] {
  const normalizedForbidden = new Set([...EXECUTABLE_PAYLOAD_KEYS].map(normalizedKey));
  const paths: string[] = [];

  function visit(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      if (EXECUTABLE_PAYLOAD_KEYS.has(key) || normalizedForbidden.has(normalizedKey(key))) {
        paths.push(childPath);
      }
      visit(child, childPath);
    }
  }

  visit(value, "");
  return paths;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function lowerSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export interface ActionChecklistValidationIssueV2 {
  code:
    | "capability_mismatch"
    | "executable_payload"
    | "gm_read_mismatch"
    | "private_term_leak"
    | "schema_invalid"
    | "uncited_ref"
    | "unavailable_capability";
  path: string;
  message: string;
}

export interface ActionChecklistValidationAcceptedV2 {
  status: "accepted";
  checklist: GmActionChecklistV2;
  issues: [];
}

export interface ActionChecklistValidationRejectedV2 {
  status: "rejected";
  checklist: null;
  issues: ActionChecklistValidationIssueV2[];
}

export type ActionChecklistValidationResultV2 =
  | ActionChecklistValidationAcceptedV2
  | ActionChecklistValidationRejectedV2;

function issueFromZod(issue: z.core.$ZodIssue): ActionChecklistValidationIssueV2 {
  return {
    code: "schema_invalid",
    path: issue.path.join(".") || "<root>",
    message: issue.message,
  };
}

function validateRefs(input: {
  checklist: GmActionChecklistV2;
  packet: ModelFacingTurnPacketV2;
}): ActionChecklistValidationIssueV2[] {
  const citable = lowerSet(input.packet.citableRefs);
  const refs = input.checklist.steps.flatMap((step) => [
    step.actorRef,
    ...step.targetRefs,
    ...step.evidenceRefs,
  ]);
  return uniqueStrings(refs)
    .filter((ref) => !citable.has(ref.toLowerCase()))
    .map((ref) => ({
      code: "uncited_ref" as const,
      path: "steps.refs",
      message: `Checklist cited ref "${ref}" that is not in the model-facing packet citable refs.`,
    }));
}

function validateCapabilities(input: {
  checklist: GmActionChecklistV2;
  packet: ModelFacingTurnPacketV2;
}): ActionChecklistValidationIssueV2[] {
  const available = new Set(input.packet.capabilities.map((capability) => capability.capabilityId));
  const issues: ActionChecklistValidationIssueV2[] = [];
  input.checklist.steps.forEach((step, index) => {
    if (!available.has(step.requiredCapabilityId)) {
      issues.push({
        code: "unavailable_capability",
        path: `steps.${index}.requiredCapabilityId`,
        message: `Capability "${step.requiredCapabilityId}" is not exposed in the model-facing packet.`,
      });
    }
    const expectedCapability = capabilityForEffectKindV2(step.intendedEffect.kind);
    if (step.requiredCapabilityId !== expectedCapability) {
      issues.push({
        code: "capability_mismatch",
        path: `steps.${index}.requiredCapabilityId`,
        message: `Effect kind "${step.intendedEffect.kind}" requires capability "${expectedCapability}".`,
      });
    }
  });
  return issues;
}

function validatePrivateTerms(input: {
  checklist: GmActionChecklistV2;
  packet: ModelFacingTurnPacketV2;
}): ActionChecklistValidationIssueV2[] {
  const publicText = JSON.stringify(input.checklist).toLowerCase();
  return input.packet.runtimePrivateGuardTerms
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term) => publicText.includes(term.toLowerCase()))
    .map((term) => ({
      code: "private_term_leak" as const,
      path: "checklist",
      message: `Private guard term "${term}" leaked into the action checklist.`,
    }));
}

function validateGmReadAlignment(input: {
  checklist: GmActionChecklistV2;
  gmRead: GmReadChecklistV2;
}): ActionChecklistValidationIssueV2[] {
  const issues: ActionChecklistValidationIssueV2[] = [];
  if (input.checklist.sourceGmReadPath !== input.gmRead.path) {
    issues.push({
      code: "gm_read_mismatch",
      path: "sourceGmReadPath",
      message: "Checklist sourceGmReadPath must match the accepted GM Read path.",
    });
  }
  if (input.checklist.turnPath !== input.gmRead.checklistRequest.turnPath) {
    issues.push({
      code: "gm_read_mismatch",
      path: "turnPath",
      message: "Checklist turnPath must match GM Read checklistRequest.turnPath.",
    });
  }
  const requestedKinds = new Set(input.gmRead.checklistRequest.requiredEffectKinds);
  input.checklist.steps.forEach((step, index) => {
    if (!requestedKinds.has(step.intendedEffect.kind)) {
      issues.push({
        code: "gm_read_mismatch",
        path: `steps.${index}.intendedEffect.kind`,
        message: `Checklist effect "${step.intendedEffect.kind}" was not requested by GM Read.`,
      });
    }
  });
  return issues;
}

const BACKEND_COMPILED_SIMPLE_EFFECTS = new Set<GmActionChecklistEffectKindV2>([
  "route_check",
  "movement",
  "support_actor_create",
  "entity_tag",
  "item_transfer",
  "condition",
  "time_advance",
  "world_fact",
  "location_reveal",
  "minor_poi_create",
  "scene_beat",
  "dialogue_outcome",
]);

function stateScopeForSimpleEffect(kind: GmActionChecklistEffectKindV2): GmActionChecklistV2["steps"][number]["intendedEffect"]["stateScope"] {
  switch (kind) {
    case "movement":
      return "actor";
    case "support_actor_create":
      return "actor";
    case "condition":
      return "actor";
    case "time_advance":
      return "world";
    case "route_check":
      return "location";
    case "minor_poi_create":
      return "local_scene";
    case "location_reveal":
      return "local_scene";
    case "entity_tag":
      return "item";
    case "item_transfer":
      return "item";
    case "world_fact":
      return "knowledge";
    case "scene_beat":
    case "dialogue_outcome":
      return "local_scene";
    default:
      return "local_scene";
  }
}

function purposeForSimpleEffect(input: {
  kind: GmActionChecklistEffectKindV2;
  gmRead: GmReadChecklistV2;
}): string {
  switch (input.kind) {
    case "movement":
      return "Settle the explicit movement through backend movement authority.";
    case "route_check":
      return "Settle route availability through backend route observation authority.";
    case "support_actor_create":
      return "Settle temporary current-scene support actor creation through backend actor authority.";
    case "minor_poi_create":
      return "Settle a visible current-scene minor point of interest through backend local-scene authority.";
    case "location_reveal":
      return "Settle a source-bounded visible current-scene place handle through backend local-scene authority.";
    case "entity_tag":
      return "Settle the concrete entity tag change through backend tag authority.";
    case "item_transfer":
      return "Settle the concrete item custody, location, or equip-state change through backend item authority.";
    case "condition":
      return "Settle the concrete actor condition or Player HP change through backend condition authority.";
    case "time_advance":
      return "Settle explicit elapsed in-world time through backend clock authority.";
    case "world_fact":
      return "Settle source-bounded player-known knowledge through backend knowledge authority.";
    case "scene_beat":
      return "Settle the local scene beat through backend terminal scene-beat authority.";
    case "dialogue_outcome":
      return "Settle the visible dialogue outcome through backend terminal dialogue authority.";
    default:
      return input.gmRead.checklistRequest.checklistGoal;
  }
}

function expectedVisibleEffectForSimpleEffect(input: {
  kind: GmActionChecklistEffectKindV2;
  targetRefs: readonly string[];
}): string {
  const target = input.targetRefs[0] ?? "the requested target";
  switch (input.kind) {
    case "movement":
      return `Accepted movement receipt for ${target}.`;
    case "route_check":
      return `Accepted route availability receipt for ${target}.`;
    case "support_actor_create":
      return "Accepted temporary support actor creation receipt.";
    case "minor_poi_create":
      return "Accepted visible current-scene minor point of interest creation receipt.";
    case "location_reveal":
      return "Accepted visible current-scene place-handle reveal receipt.";
    case "entity_tag":
      return `Accepted entity tag mutation receipt for ${target}.`;
    case "item_transfer":
      return `Accepted item transfer mutation receipt for ${target}.`;
    case "condition":
      return `Accepted actor condition mutation receipt for ${target}.`;
    case "time_advance":
      return "Accepted elapsed-time receipt for the current scene clock.";
    case "world_fact":
      return "Accepted player-known knowledge mutation receipt.";
    case "scene_beat":
      return "Accepted terminal scene-beat receipt.";
    case "dialogue_outcome":
      return "Accepted terminal dialogue receipt.";
    default:
      return "Accepted backend receipt.";
  }
}

export function compileSimpleGmActionChecklistV2(input: {
  packet: ModelFacingTurnPacketV2;
  gmRead: GmReadChecklistV2;
}): ActionChecklistValidationResultV2 | null {
  const requestedKinds = input.gmRead.checklistRequest.requiredEffectKinds;
  if (requestedKinds.length !== 1) return null;
  const kind = requestedKinds[0];
  if (!BACKEND_COMPILED_SIMPLE_EFFECTS.has(kind)) return null;

  const actorRef = input.gmRead.checklistRequest.actorRefs[0];
  const targetRefs = uniqueStrings(input.gmRead.checklistRequest.targetRefs);
  const evidenceRefs = uniqueStrings(input.gmRead.checklistRequest.evidenceRefs);
  const requiredCapabilityId = capabilityForEffectKindV2(kind) as RuntimeCapabilityIdV2;
  const candidate: GmActionChecklistV2 = {
    version: "gm-action-checklist.v2",
    checklistId: `chk-${input.packet.turnId}-${kind}`,
    campaignId: input.packet.campaignId,
    turnId: input.packet.turnId,
    baseWorldVersion: input.packet.baseWorldVersion,
    sourceGmReadPath: input.gmRead.path,
    turnPath: input.gmRead.checklistRequest.turnPath,
    turnIntent: input.gmRead.actionInterpretation.intent,
    steps: [
      {
        stepId: "step-1",
        purpose: purposeForSimpleEffect({ kind, gmRead: input.gmRead }),
        actorRef,
        targetRefs,
        evidenceRefs,
        requiredCapabilityId,
        intendedEffect: {
          kind,
          summary: input.gmRead.checklistRequest.checklistGoal,
          stateScope: stateScopeForSimpleEffect(kind),
        },
        expectedVisibleEffect: expectedVisibleEffectForSimpleEffect({ kind, targetRefs }),
        dependsOnStepIds: [],
      },
    ],
  };

  return validateGmActionChecklistV2({
    packet: input.packet,
    gmRead: input.gmRead,
    candidate,
  });
}

export function validateGmActionChecklistV2(input: {
  packet: ModelFacingTurnPacketV2;
  gmRead: GmReadChecklistV2;
  candidate: unknown;
}): ActionChecklistValidationResultV2 {
  const issues: ActionChecklistValidationIssueV2[] = [];
  issues.push(...executablePayloadPaths(input.candidate).map((path) => ({
    code: "executable_payload" as const,
    path,
    message: "Action checklist cannot contain executable tool payload fields.",
  })));

  const parsed = gmActionChecklistV2Schema.safeParse(input.candidate);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(issueFromZod));
  } else {
    const checklist = parsed.data;
    if (checklist.campaignId !== input.packet.campaignId) {
      issues.push({
        code: "gm_read_mismatch",
        path: "campaignId",
        message: "Checklist campaignId must match the model-facing packet.",
      });
    }
    if (checklist.turnId !== input.packet.turnId) {
      issues.push({
        code: "gm_read_mismatch",
        path: "turnId",
        message: "Checklist turnId must match the model-facing packet.",
      });
    }
    if (checklist.baseWorldVersion !== input.packet.baseWorldVersion) {
      issues.push({
        code: "gm_read_mismatch",
        path: "baseWorldVersion",
        message: "Checklist baseWorldVersion must match the model-facing packet.",
      });
    }
    issues.push(...validateGmReadAlignment({ checklist, gmRead: input.gmRead }));
    issues.push(...validateRefs({ checklist, packet: input.packet }));
    issues.push(...validateCapabilities({ checklist, packet: input.packet }));
    issues.push(...validatePrivateTerms({ checklist, packet: input.packet }));
  }

  if (issues.length > 0 || !parsed.success) {
    return {
      status: "rejected",
      checklist: null,
      issues,
    };
  }

  return {
    status: "accepted",
    checklist: assertGmActionChecklistV2(parsed.data),
    issues: [],
  };
}
