import { z } from "zod";
import {
  assertGmReadOracleV2,
  assertGmReadChecklistV2,
  assertGmReadNoMutationV2,
  gmReadChecklistV2Schema,
  gmReadOracleV2Schema,
  gmReadNoMutationV2Schema,
  type GmReadChecklistV2,
  type GmReadOracleV2,
  type GmReadNoMutationV2,
  type ModelFacingTurnPacketV2,
} from "./contracts.js";

const EXECUTABLE_PAYLOAD_KEYS = new Set([
  "args",
  "candidateToolRequest",
  "input",
  "payload",
  "plannedTools",
  "tool",
  "toolCall",
  "toolInput",
  "toolName",
]);
const NORMALIZED_EXECUTABLE_PAYLOAD_KEYS = new Set(
  [...EXECUTABLE_PAYLOAD_KEYS].map(normalizedKey),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function executablePayloadPaths(value: unknown): string[] {
  const offenders: string[] = [];

  function visit(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      if (EXECUTABLE_PAYLOAD_KEYS.has(key) || NORMALIZED_EXECUTABLE_PAYLOAD_KEYS.has(normalizedKey(key))) {
        offenders.push(childPath);
      }
      visit(child, childPath);
    }
  }

  visit(value, "");
  return offenders;
}

function normalizeGmReadCandidateDiscriminatorV2(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const normalized: Record<string, unknown> = { ...candidate };
  const path = typeof normalized.path === "string" ? normalized.path.trim() : "";
  const turnNeed = typeof normalized.turnNeed === "string" ? normalized.turnNeed.trim() : "";

  if (path === "tool_plan" || turnNeed === "backend_action_checklist") {
    normalized.path = "tool_plan";
    normalized.turnNeed = "backend_action_checklist";
    return normalized;
  }

  if (path === "roll_oracle" || turnNeed === "oracle_uncertainty") {
    normalized.path = "roll_oracle";
    normalized.turnNeed = "oracle_uncertainty";
    return normalized;
  }

  return normalized;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function refSet(packet: ModelFacingTurnPacketV2): Set<string> {
  return new Set(packet.citableRefs.map((ref) => ref.trim().toLowerCase()));
}

function unsupportedRefs(read: GmReadNoMutationV2, packet: ModelFacingTurnPacketV2): string[] {
  const legalRefs = refSet(packet);
  return uniqueStrings([
    ...read.focalActorRefs,
    ...read.evidenceRefs,
    ...read.actionInterpretation.targetRefs,
  ]).filter((ref) => !legalRefs.has(ref.toLowerCase()));
}

function unsupportedOracleRefs(read: GmReadOracleV2, packet: ModelFacingTurnPacketV2): string[] {
  const legalRefs = refSet(packet);
  return uniqueStrings([
    ...read.focalActorRefs,
    ...read.evidenceRefs,
    ...read.actionInterpretation.targetRefs,
  ]).filter((ref) => !legalRefs.has(ref.toLowerCase()));
}

function unsupportedChecklistRefs(read: GmReadChecklistV2, packet: ModelFacingTurnPacketV2): string[] {
  const legalRefs = refSet(packet);
  return uniqueStrings([
    ...read.focalActorRefs,
    ...read.evidenceRefs,
    ...read.actionInterpretation.targetRefs,
  ]).filter((ref) => !legalRefs.has(ref.toLowerCase()));
}

export interface GmReadValidationIssueV2 {
  code:
    | "schema_invalid"
    | "executable_payload"
    | "uncited_ref"
    | "unsupported_path";
  path: string;
  message: string;
}

export interface GmReadValidationAcceptedV2 {
  status: "accepted";
  read: GmReadNoMutationV2;
  issues: [];
}

export interface GmReadValidationFallbackV2 {
  status: "fallback_clarification";
  read: GmReadNoMutationV2;
  issues: GmReadValidationIssueV2[];
}

export type GmReadValidationResultV2 =
  | GmReadValidationAcceptedV2
  | GmReadValidationFallbackV2;

export interface GmReadOracleValidationAcceptedV2 {
  status: "accepted";
  read: GmReadOracleV2;
  issues: [];
}

export interface GmReadOracleValidationFallbackV2 {
  status: "fallback_clarification";
  read: GmReadNoMutationV2;
  issues: GmReadValidationIssueV2[];
}

export type GmReadOracleValidationResultV2 =
  | GmReadOracleValidationAcceptedV2
  | GmReadOracleValidationFallbackV2;

export interface GmReadChecklistValidationAcceptedV2 {
  status: "accepted";
  read: GmReadChecklistV2;
  issues: [];
}

export interface GmReadChecklistValidationFallbackV2 {
  status: "fallback_clarification";
  read: GmReadNoMutationV2;
  issues: GmReadValidationIssueV2[];
}

export type GmReadChecklistValidationResultV2 =
  | GmReadChecklistValidationAcceptedV2
  | GmReadChecklistValidationFallbackV2;

export interface GmReadAnyValidationAcceptedV2 {
  status: "accepted";
  read: GmReadNoMutationV2 | GmReadOracleV2 | GmReadChecklistV2;
  issues: [];
}

export type GmReadAnyValidationResultV2 =
  | GmReadAnyValidationAcceptedV2
  | GmReadValidationFallbackV2;

function issueFromZod(issue: z.core.$ZodIssue): GmReadValidationIssueV2 {
  return {
    code: "schema_invalid",
    path: issue.path.join(".") || "<root>",
    message: issue.message,
  };
}

export function buildFallbackClarificationReadV2(input: {
  packet: ModelFacingTurnPacketV2;
  reason: string;
}): GmReadNoMutationV2 {
  const playerRef = input.packet.citableRefs.includes("Player")
    ? "Player"
    : input.packet.citableRefs[0] ?? "Player";
  const sceneRef =
    input.packet.scene.currentScene.ref
    ?? input.packet.scene.currentLocation.ref
    ?? playerRef;

  return assertGmReadNoMutationV2({
    version: "gm-read.v2",
    path: "clarification",
    situationSummary: "The player action needs clarification before the GM can resolve it.",
    sceneQuestion: "What exactly does the player intend to do?",
    focalActorRefs: [playerRef],
    evidenceRefs: uniqueStrings([playerRef, sceneRef]),
    actionInterpretation: {
      intent: input.packet.playerAction,
      method: null,
      targetRefs: [],
    },
    turnNeed: "clarification_needed",
    rationale: input.reason,
    noMutationReason: "No state changes are accepted until the ambiguous action is clarified.",
    clarificationPrompt: "Please clarify the action with a concrete target or method.",
  });
}

export function validateGmReadNoMutationV2(input: {
  packet: ModelFacingTurnPacketV2;
  candidate: unknown;
}): GmReadValidationResultV2 {
  const issues: GmReadValidationIssueV2[] = [];
  const executablePaths = executablePayloadPaths(input.candidate);
  issues.push(...executablePaths.map((path) => ({
    code: "executable_payload" as const,
    path,
    message: "GM Read v2 cannot contain executable tool payload fields.",
  })));

  const parsed = gmReadNoMutationV2Schema.safeParse(input.candidate);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(issueFromZod));
  } else {
    const refs = unsupportedRefs(parsed.data, input.packet);
    issues.push(...refs.map((ref) => ({
      code: "uncited_ref" as const,
      path: "refs",
      message: `GM Read cited ref "${ref}" that is not in the model-facing packet citable refs.`,
    })));
    if (parsed.data.path !== "direct" && parsed.data.path !== "continue" && parsed.data.path !== "clarification") {
      issues.push({
        code: "unsupported_path",
        path: "path",
        message: "This slice accepts only direct, continue, and clarification GM Read paths.",
      });
    }
  }

  if (issues.length > 0 || !parsed.success) {
    return {
      status: "fallback_clarification",
      read: buildFallbackClarificationReadV2({
        packet: input.packet,
        reason: issues[0]?.message ?? "GM Read v2 failed validation.",
      }),
      issues,
    };
  }

  return {
    status: "accepted",
    read: parsed.data,
    issues: [],
  };
}

export function validateGmReadOracleV2(input: {
  packet: ModelFacingTurnPacketV2;
  candidate: unknown;
}): GmReadOracleValidationResultV2 {
  const issues: GmReadValidationIssueV2[] = [];
  const executablePaths = executablePayloadPaths(input.candidate);
  issues.push(...executablePaths.map((path) => ({
    code: "executable_payload" as const,
    path,
    message: "GM Read v2 cannot contain executable tool payload fields.",
  })));

  const parsed = gmReadOracleV2Schema.safeParse(input.candidate);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(issueFromZod));
  } else {
    const refs = unsupportedOracleRefs(parsed.data, input.packet);
    issues.push(...refs.map((ref) => ({
      code: "uncited_ref" as const,
      path: "refs",
      message: `GM Read cited ref "${ref}" that is not in the model-facing packet citable refs.`,
    })));
  }

  if (issues.length > 0 || !parsed.success) {
    return {
      status: "fallback_clarification",
      read: buildFallbackClarificationReadV2({
        packet: input.packet,
        reason: issues[0]?.message ?? "GM Read Oracle v2 failed validation.",
      }),
      issues,
    };
  }

  return {
    status: "accepted",
    read: assertGmReadOracleV2(parsed.data),
    issues: [],
  };
}

export function validateGmReadChecklistV2(input: {
  packet: ModelFacingTurnPacketV2;
  candidate: unknown;
}): GmReadChecklistValidationResultV2 {
  const issues: GmReadValidationIssueV2[] = [];
  const executablePaths = executablePayloadPaths(input.candidate);
  issues.push(...executablePaths.map((path) => ({
    code: "executable_payload" as const,
    path,
    message: "GM Read v2 cannot contain executable tool payload fields.",
  })));

  const parsed = gmReadChecklistV2Schema.safeParse(input.candidate);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(issueFromZod));
  } else {
    const refs = unsupportedChecklistRefs(parsed.data, input.packet);
    issues.push(...refs.map((ref) => ({
      code: "uncited_ref" as const,
      path: "refs",
      message: `GM Read cited ref "${ref}" that is not in the model-facing packet citable refs.`,
    })));
  }

  if (issues.length > 0 || !parsed.success) {
    return {
      status: "fallback_clarification",
      read: buildFallbackClarificationReadV2({
        packet: input.packet,
        reason: issues[0]?.message ?? "GM Read checklist v2 failed validation.",
      }),
      issues,
    };
  }

  return {
    status: "accepted",
    read: assertGmReadChecklistV2(parsed.data),
    issues: [],
  };
}

export function validateGmReadV2(input: {
  packet: ModelFacingTurnPacketV2;
  candidate: unknown;
}): GmReadAnyValidationResultV2 {
  const candidate = normalizeGmReadCandidateDiscriminatorV2(input.candidate);
  const path = isRecord(candidate) && typeof candidate.path === "string"
    ? candidate.path.trim()
    : "";
  if (path === "roll_oracle") {
    return validateGmReadOracleV2({ ...input, candidate });
  }
  if (path === "tool_plan") {
    return validateGmReadChecklistV2({ ...input, candidate });
  }
  return validateGmReadNoMutationV2({ ...input, candidate });
}
