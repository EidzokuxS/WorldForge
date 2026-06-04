import { z } from "zod";
import {
  assertGmActionChecklistV2,
  gmActionChecklistV2Schema,
  type GmActionChecklistV2,
  type GmReadChecklistV2,
  type ModelFacingTurnPacketV2,
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
