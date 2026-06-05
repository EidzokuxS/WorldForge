import { z } from "zod";
import {
  assertGmJudgeV2,
  assertPublicGmJudgeProjectionV2,
  type GmJudgeChecklistV2,
  type GmJudgeOracleV2,
  type GmJudgeV2,
  type GmReadV2,
  type ModelFacingTurnPacketV2,
  type PublicGmJudgeProjectionV2,
} from "./contracts.js";
import { gmJudgeV2Schema } from "./contracts.js";

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

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function citableRefSet(packet: ModelFacingTurnPacketV2): Set<string> {
  return new Set(packet.citableRefs.map((ref) => ref.trim().toLowerCase()));
}

function legacyLaneForGmRead(read: GmReadV2): GmJudgeV2["lane"] {
  if (read.path === "tool_plan") return "action_checklist";
  return read.path;
}

function unsupportedRefs(judge: GmJudgeV2, packet: ModelFacingTurnPacketV2): string[] {
  const legalRefs = citableRefSet(packet);
  const refs = uniqueStrings([
    ...judge.actorRefs,
    ...judge.targetRefs,
    ...judge.evidenceRefs,
    ...(judge.lane === "roll_oracle" ? [
      judge.oracleAdmission.actorRef,
      ...judge.oracleAdmission.targetRefs,
      ...judge.oracleAdmission.evidenceRefs,
    ] : []),
    ...(judge.lane === "action_checklist" ? [
      ...judge.checklistAdmission.actorRefs,
      ...judge.checklistAdmission.targetRefs,
      ...judge.checklistAdmission.evidenceRefs,
    ] : []),
  ]);
  return refs.filter((ref) => !legalRefs.has(ref.toLowerCase()));
}

function stripOraclePostRoute(
  admission: GmJudgeOracleV2["oracleAdmission"],
): Omit<GmJudgeOracleV2["oracleAdmission"], "postOracleRoute"> {
  const { postOracleRoute: _postOracleRoute, ...request } = admission;
  return request;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function refsAreSubset(input: {
  role: string;
  values: readonly string[];
  allowed: readonly string[];
}): GmJudgeValidationIssueV2[] {
  const allowed = new Set(input.allowed.map((ref) => ref.toLowerCase()));
  return uniqueStrings(input.values)
    .filter((ref) => !allowed.has(ref.toLowerCase()))
    .map((ref) => ({
      code: "gm_read_mismatch" as const,
      path: input.role,
      message: `GM Judge ${input.role} ref "${ref}" is not admitted by the accepted GM Read.`,
    }));
}

function alignmentIssues(input: {
  judge: GmJudgeV2;
  gmRead: GmReadV2;
}): GmJudgeValidationIssueV2[] {
  const issues: GmJudgeValidationIssueV2[] = [];
  const expectedLane = legacyLaneForGmRead(input.gmRead);
  if (input.judge.lane !== expectedLane) {
    issues.push({
      code: "gm_read_mismatch",
      path: "lane",
      message: `GM Judge lane "${input.judge.lane}" does not match accepted GM Read path "${input.gmRead.path}".`,
    });
  }
  issues.push(...refsAreSubset({
    role: "actorRefs",
    values: input.judge.actorRefs,
    allowed: input.gmRead.focalActorRefs,
  }));
  issues.push(...refsAreSubset({
    role: "evidenceRefs",
    values: input.judge.evidenceRefs,
    allowed: input.gmRead.evidenceRefs,
  }));

  if (input.judge.lane === "roll_oracle") {
    if (input.gmRead.path !== "roll_oracle") {
      issues.push({
        code: "gm_read_mismatch",
        path: "oracleAdmission",
        message: "Oracle admission requires an accepted roll_oracle GM Read source.",
      });
    } else if (canonicalJson(stripOraclePostRoute(input.judge.oracleAdmission)) !== canonicalJson(input.gmRead.oracleRequest)) {
      issues.push({
        code: "gm_read_mismatch",
        path: "oracleAdmission",
        message: "Oracle admission must match the accepted GM Read oracleRequest during compatibility migration.",
      });
    }
  }

  if (input.judge.lane === "action_checklist") {
    if (input.gmRead.path !== "tool_plan") {
      issues.push({
        code: "gm_read_mismatch",
        path: "checklistAdmission",
        message: "Checklist admission requires an accepted tool_plan GM Read source.",
      });
    } else if (canonicalJson(input.judge.checklistAdmission) !== canonicalJson(input.gmRead.checklistRequest)) {
      issues.push({
        code: "gm_read_mismatch",
        path: "checklistAdmission",
        message: "Checklist admission must match the accepted GM Read checklistRequest during compatibility migration.",
      });
    }
  }

  return issues;
}

export interface GmJudgeValidationIssueV2 {
  code:
    | "schema_invalid"
    | "executable_payload"
    | "uncited_ref"
    | "gm_read_mismatch";
  path: string;
  message: string;
}

export interface GmJudgeValidationAcceptedV2 {
  status: "accepted";
  judge: GmJudgeV2;
  issues: [];
}

export interface GmJudgeValidationRejectedV2 {
  status: "rejected";
  judge: null;
  issues: GmJudgeValidationIssueV2[];
}

export type GmJudgeValidationResultV2 =
  | GmJudgeValidationAcceptedV2
  | GmJudgeValidationRejectedV2;

function issueFromZod(issue: z.core.$ZodIssue): GmJudgeValidationIssueV2 {
  return {
    code: "schema_invalid",
    path: issue.path.join(".") || "<root>",
    message: issue.message,
  };
}

export function validateGmJudgeV2(input: {
  packet: ModelFacingTurnPacketV2;
  gmRead: GmReadV2;
  candidate: unknown;
}): GmJudgeValidationResultV2 {
  const issues: GmJudgeValidationIssueV2[] = [];
  issues.push(...executablePayloadPaths(input.candidate).map((path) => ({
    code: "executable_payload" as const,
    path,
    message: "GM Judge v2 cannot contain executable tool payload fields.",
  })));

  const parsed = gmJudgeV2Schema.safeParse(input.candidate);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(issueFromZod));
  } else {
    issues.push(...unsupportedRefs(parsed.data, input.packet).map((ref) => ({
      code: "uncited_ref" as const,
      path: "refs",
      message: `GM Judge cited ref "${ref}" that is not in the model-facing packet citable refs.`,
    })));
    issues.push(...alignmentIssues({
      judge: parsed.data,
      gmRead: input.gmRead,
    }));
  }

  if (issues.length > 0 || !parsed.success) {
    return {
      status: "rejected",
      judge: null,
      issues,
    };
  }

  return {
    status: "accepted",
    judge: assertGmJudgeV2(parsed.data),
    issues: [],
  };
}

export function buildCompatGmJudgeFromLegacyGmReadV2(input: {
  gmRead: GmReadV2;
}): GmJudgeV2 {
  const read = input.gmRead;
  if (read.path === "roll_oracle") {
    return assertGmJudgeV2({
      version: "gm-judge.v2",
      lane: "roll_oracle",
      physicalPossibility: "uncertain",
      checkNeed: "oracle_uncertainty",
      actorRefs: [read.oracleRequest.actorRef],
      targetRefs: read.oracleRequest.targetRefs,
      evidenceRefs: read.oracleRequest.evidenceRefs,
      rationale: read.rationale,
      oracleAdmission: {
        ...read.oracleRequest,
        postOracleRoute: "settle_visible_outcome_only",
      },
    });
  }

  if (read.path === "tool_plan") {
    return assertGmJudgeV2({
      version: "gm-judge.v2",
      lane: "action_checklist",
      physicalPossibility: "possible",
      checkNeed: "backend_action_checklist",
      actorRefs: read.checklistRequest.actorRefs,
      targetRefs: read.checklistRequest.targetRefs,
      evidenceRefs: read.checklistRequest.evidenceRefs,
      rationale: read.rationale,
      checklistAdmission: read.checklistRequest,
    });
  }

  if (read.path === "clarification") {
    return assertGmJudgeV2({
      version: "gm-judge.v2",
      lane: "clarification",
      physicalPossibility: "underspecified",
      checkNeed: "clarification_needed",
      actorRefs: read.focalActorRefs,
      targetRefs: read.actionInterpretation.targetRefs,
      evidenceRefs: read.evidenceRefs,
      rationale: read.rationale,
      clarificationPrompt: read.clarificationPrompt ?? "Please clarify the action.",
    });
  }

  return assertGmJudgeV2({
    version: "gm-judge.v2",
    lane: read.path,
    physicalPossibility: "possible",
    checkNeed: "no_check",
    actorRefs: read.focalActorRefs,
    targetRefs: read.actionInterpretation.targetRefs,
    evidenceRefs: read.evidenceRefs,
    rationale: read.rationale,
    noMutationReason: read.noMutationReason,
  });
}

export function buildPublicGmJudgeProjectionV2(input: {
  gmJudge: GmJudgeV2;
  settlementBasis: PublicGmJudgeProjectionV2["settlementBasis"];
}): PublicGmJudgeProjectionV2 {
  const requiredEffectKinds =
    input.gmJudge.lane === "action_checklist"
      ? input.gmJudge.checklistAdmission.requiredEffectKinds
      : [];

  return assertPublicGmJudgeProjectionV2({
    version: "public-gm-judge-projection.v2",
    lane: input.gmJudge.lane,
    physicalPossibility: input.gmJudge.physicalPossibility,
    checkNeed: input.gmJudge.checkNeed,
    actorRefs: input.gmJudge.actorRefs,
    evidenceRefs: input.gmJudge.evidenceRefs,
    targetRefs: input.gmJudge.targetRefs,
    requiredEffectKinds,
    settlementBasis: input.settlementBasis,
  });
}

export function assertChecklistGmJudgeV2(judge: GmJudgeV2): GmJudgeChecklistV2 {
  if (judge.lane !== "action_checklist") {
    throw new Error("Expected an action_checklist GM Judge admission.");
  }
  return judge;
}

export function assertOracleGmJudgeV2(judge: GmJudgeV2): GmJudgeOracleV2 {
  if (judge.lane !== "roll_oracle") {
    throw new Error("Expected a roll_oracle GM Judge admission.");
  }
  return judge;
}
