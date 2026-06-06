import { z } from "zod";
import {
  assertGmJudgeV2,
  assertPublicGmJudgeProjectionV2,
  gmJudgeV2Schema,
  type GmJudgeChecklistV2,
  type GmJudgeOracleV2,
  type GmJudgeV2,
  type GmReadV2,
  type ModelFacingTurnPacketV2,
  type PublicGmJudgeProjectionV2,
} from "./contracts.js";
import { formatModelFacingTurnPacketForPromptV2 } from "./projection.js";

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
  if (input.judge.lane !== expectedLane && input.judge.lane !== "clarification") {
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
  issues.push(...refsAreSubset({
    role: "targetRefs",
    values: input.judge.targetRefs,
    allowed: [
      ...input.gmRead.actionInterpretation.targetRefs,
      ...input.gmRead.evidenceRefs,
    ],
  }));

  if (input.judge.lane === "roll_oracle") {
    if (input.gmRead.path !== "roll_oracle") {
      issues.push({
        code: "gm_read_mismatch",
        path: "oracleAdmission",
        message: "Oracle admission requires an accepted roll_oracle GM Read source.",
      });
    }
    issues.push(...refsAreSubset({
      role: "oracleAdmission.actorRef",
      values: [input.judge.oracleAdmission.actorRef],
      allowed: input.judge.actorRefs,
    }));
    issues.push(...refsAreSubset({
      role: "oracleAdmission.targetRefs",
      values: input.judge.oracleAdmission.targetRefs,
      allowed: input.judge.targetRefs,
    }));
    issues.push(...refsAreSubset({
      role: "oracleAdmission.evidenceRefs",
      values: input.judge.oracleAdmission.evidenceRefs,
      allowed: input.judge.evidenceRefs,
    }));
  }

  if (input.judge.lane === "action_checklist") {
    if (input.gmRead.path !== "tool_plan") {
      issues.push({
        code: "gm_read_mismatch",
        path: "checklistAdmission",
        message: "Checklist admission requires an accepted tool_plan GM Read source.",
      });
    }
    const effectKinds = input.judge.checklistAdmission.requiredEffectKinds;
    if (new Set(effectKinds).size !== effectKinds.length) {
      issues.push({
        code: "gm_read_mismatch",
        path: "checklistAdmission.requiredEffectKinds",
        message: "Checklist admission requiredEffectKinds must be unique.",
      });
    }
    issues.push(...refsAreSubset({
      role: "checklistAdmission.actorRefs",
      values: input.judge.checklistAdmission.actorRefs,
      allowed: input.judge.actorRefs,
    }));
    issues.push(...refsAreSubset({
      role: "checklistAdmission.targetRefs",
      values: input.judge.checklistAdmission.targetRefs,
      allowed: input.judge.targetRefs,
    }));
    issues.push(...refsAreSubset({
      role: "checklistAdmission.evidenceRefs",
      values: input.judge.checklistAdmission.evidenceRefs,
      allowed: input.judge.evidenceRefs,
    }));
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

export function buildGmJudgeSystemPromptV2(): string {
  return [
    "You are the WorldForge GM Judge layer for gameplay-cycle-v2.",
    "Return only gm-judge.v2 JSON.",
    "Judge is an admission record only. Do not narrate, mutate, emit tool names, emit tool inputs, create checklist steps, create receipts, or decide final consequences.",
    "Use the accepted GM Read only as interpretation/source context. Judge owns the next runtime lane, physical possibility, check need, and bounded Oracle/checklist admission.",
    "Allowed lanes are direct, continue, clarification, roll_oracle, action_checklist, and combat_transition.",
    "Use roll_oracle only for true uncertainty requiring a roll. Oracle settles uncertainty only; it is not movement, discovery, item state, NPC private knowledge, world fact, or mutation authority.",
    "Use action_checklist only when backend runtime receipts must settle route checks, movement, dialogue outcomes, support actors, minor POIs, location reveal, entity tags, item transfer, conditions, time advance, world facts, or scene beats.",
    "For action_checklist, checkNeed must be exactly backend_action_checklist.",
    "For roll_oracle, checkNeed must be exactly oracle_uncertainty. For direct/continue, checkNeed must be exactly no_check. For clarification, checkNeed must be exactly clarification_needed.",
    "For action_checklist, create checklistAdmission with turnPath, requiredEffectKinds, actorRefs, targetRefs, evidenceRefs, and checklistGoal. This is admission only, not checklist steps or tool payload.",
    "For explicit travel to a connected visible destination, use action_checklist with turnPath=mutating and requiredEffectKinds=[\"movement\"].",
    "For route availability checks without travel, use action_checklist with turnPath=procedural and requiredEffectKinds=[\"route_check\"].",
    "For visible dialogue outcomes, use action_checklist with turnPath=procedural and requiredEffectKinds=[\"dialogue_outcome\"].",
    "For temporary current-scene service/witness/helper/vendor/guard/attendant/crowd support actors, use requiredEffectKinds=[\"support_actor_create\"].",
    "Do not use support_actor_create for player identity, already modeled scene actors, or questions about who is currently visible/nearby. Current visible actor roster questions are direct no-mutation observations from SceneFrame truth unless the player explicitly asks to introduce a new ordinary support NPC.",
    "For ordinary visible current-scene POIs, use requiredEffectKinds=[\"minor_poi_create\"].",
    "For source-bounded visible current-scene place handles, use requiredEffectKinds=[\"location_reveal\"].",
    "For concrete tags/marks/labels on visible/current/inventory entities, use requiredEffectKinds=[\"entity_tag\"].",
    "For modeled item custody/location/equip changes, use requiredEffectKinds=[\"item_transfer\"].",
    "For visible actor conditions or Player HP changes, use requiredEffectKinds=[\"condition\"].",
    "For explicit elapsed in-world time in the current scene, use requiredEffectKinds=[\"time_advance\"].",
    "For source-bounded player-known knowledge from accepted same-turn sources, use requiredEffectKinds=[\"world_fact\"].",
    "For local posture or scene beat without structural state change, use requiredEffectKinds=[\"scene_beat\"].",
    "Use direct or continue only for no-check/no-mutation turns that can be answered from current settled truth.",
    "Use clarification when the action is underspecified or asks for unsupported hidden/offscreen/private/combat behavior.",
    "Response-language/style directives in the player action are UI/output preferences, not in-world evidence. Do not admit clarification, refusal, Oracle uncertainty, or dialogue consequences from an alleged foreign language, translation issue, dialect barrier, or NPC comprehension limit unless the model-facing packet exposes that barrier as citable current-scene truth.",
    "Cite only citableRefs from the model-facing packet and refs already cited by the accepted GM Read.",
    "Never include executable payload keys such as toolName, toolId, toolInput, input, payload, args, toolCall, plannedTools, or candidateToolRequest.",
  ].join("\n");
}

export function buildGmJudgePromptV2(input: {
  packet: ModelFacingTurnPacketV2;
  gmRead: GmReadV2;
  deterministicAdmission?: GmJudgeV2 | null;
}): string {
  return JSON.stringify({
    task: "Admit the next gameplay-cycle-v2 lane from the accepted GM Read. Return exactly one bounded gm-judge.v2 admission.",
    outputContract: {
      laneToCheckNeed: {
        action_checklist: "backend_action_checklist",
        roll_oracle: "oracle_uncertainty",
        direct: "no_check",
        continue: "no_check",
        clarification: "clarification_needed",
      },
      actionChecklist: {
        requiredTopLevel: ["lane", "physicalPossibility", "checkNeed", "checklistAdmission"],
        exactCheckNeed: "backend_action_checklist",
      },
    },
    packet: formatModelFacingTurnPacketForPromptV2(input.packet),
    acceptedGmRead: input.gmRead,
    backendDeterministicAdmission: input.deterministicAdmission
      ? {
        rule: "If and only if this matches the accepted GM Read interpretation, emit this exact Judge admission.",
        admission: input.deterministicAdmission,
      }
      : null,
    forbidden: [
      "narration",
      "mutation",
      "tool names",
      "tool inputs",
      "checklist steps",
      "receipts",
      "hidden facts",
      "private/offscreen knowledge",
      "final consequences",
    ],
  }, null, 2);
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
