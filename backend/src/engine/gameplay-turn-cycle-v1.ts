import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText } from "../ai/raindrop-workshop.js";
import { createModel } from "../ai/provider-registry.js";
import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { appendChatMessages, advanceCampaignTick, getChatHistory, readCampaignConfig } from "../campaign/index.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  runRequiredActorDecisionPass,
  type RunRequiredActorDecisionPassResult,
} from "./actor-tools.js";
import { attachStructuralStateReceiptsToToolResult } from "./dialogue-state-receipt.js";
import { callOracle, type OraclePayload, type OracleResult } from "./oracle.js";
import {
  executeBridgeCandidateTool,
  isBridgeLookupToolName,
} from "./bridge-candidate-tools.js";
import { buildSceneFrame, type SceneActor, type SceneFrame } from "./scene-frame.js";
import { runGmRead, type GmRead } from "./gm-turn-read.js";
import { readWorldClock, syncWorldClockTurnBoundary } from "./living-world-authority.js";
import type { ExecutedScenePlanActionResult } from "./scene-plan-executor.js";
import { executeToolCall, type ToolResult } from "./tool-executor.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  createPlayerTurnToolExecutionContext,
  type DialogueAddressedTargetInput,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import { isRuntimeToolName } from "./tool-contracts.js";
import {
  RUNTIME_TOOL_DESCRIPTORS,
  RUNTIME_TOOL_STATE_EFFECT_KINDS,
} from "./runtime-tool-descriptors.js";
import {
  runtimeToolInputSchemas,
  type RuntimeToolName,
} from "./runtime-tool-input-schemas.js";
import {
  buildScopedForecastExcerpt,
  loadWorldTrajectoryForecast,
  type ScopedForecastExcerpt,
} from "./world-forecast.js";
import {
  durableEventIdsFromPacketV1,
  markSettledTurnProjectedV1,
  persistSettledTurnPacketV1,
  readSettledTurnPacketV1,
  recordNarrationAttemptFailedV1,
  recordNarrationAttemptStartedV1,
  recordNarrationAttemptSucceededV1,
} from "./settled-turn-packet-v1-store.js";
import type {
  HiddenTurnSummary,
  TurnEvent,
  TurnOptions,
  TurnSummary,
} from "./turn-processor.js";

type GmReadPath = GmRead["path"];

const GM_ACTION_CHECKLIST_VERSION_V1 = "gm-action-checklist.v1";
const TOOL_REQUEST_VERSION_V1 = "gm-tool-request.v1";
const GM_ACTION_CHECKLIST_MAX_STEPS_V1 = 4;
const GM_TOOL_LOOP_MAX_EXECUTIONS_V1 = 4;
const NARRATOR_PRIVATE_TERM_PLACEHOLDER = "[private]";
const log = createLogger("gameplay-turn-cycle-v1");

const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as [
  RuntimeToolName,
  ...RuntimeToolName[],
];

const gmChecklistStepV1Schema = z
  .object({
    stepId: z.string().trim().min(1).max(40),
    purpose: z.string().trim().min(1).max(400),
    evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
    dependsOnStepIds: z.array(z.string().trim().min(1).max(40)).max(4).default([]),
    expectedVisibleEffect: z.string().trim().min(1).max(500),
    requiredAction: z.enum([
      "backend_tool",
      "oracle_already_resolved",
      "narration_constraint",
      "skip",
    ]),
    settlementPolicy: z.enum(["required", "optional"]).default("required"),
    toolNeed: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

function validateChecklistStepGraphV1(
  steps: readonly z.infer<typeof gmChecklistStepV1Schema>[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (seen.has(step.stepId)) {
      ctx.addIssue({
        code: "custom",
        path: ["steps", index, "stepId"],
        message: `Duplicate checklist stepId ${step.stepId}.`,
      });
    }
    for (const dependency of step.dependsOnStepIds) {
      if (!seen.has(dependency)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "dependsOnStepIds"],
          message: `Checklist dependency ${dependency} must refer to an earlier step.`,
        });
      }
    }
    seen.add(step.stepId);
  }
}

export const gmActionChecklistV1Schema = z
  .unknown()
  .superRefine((value, ctx) => {
    const offenders = executablePayloadPaths(value);
    for (const path of offenders) {
      ctx.addIssue({
        code: "custom",
        path: path.split(".").filter(Boolean),
        message: "GM Action Checklist v1 must not contain executable tool payload fields.",
      });
    }
  })
  .pipe(z.object({
    version: z.literal(GM_ACTION_CHECKLIST_VERSION_V1).default(GM_ACTION_CHECKLIST_VERSION_V1),
    turnPath: z.enum(["mutating", "combat", "oracle_consequence"]),
    steps: z.array(gmChecklistStepV1Schema).min(1).max(GM_ACTION_CHECKLIST_MAX_STEPS_V1),
  }).strict().superRefine((value, ctx) => validateChecklistStepGraphV1(value.steps, ctx)));

const gmBackendToolChecklistStepV1Schema = gmChecklistStepV1Schema.extend({
  requiredAction: z.literal("backend_tool"),
  toolNeed: z.string().trim().min(1).max(80),
});

export const mutatingGmActionChecklistV1Schema = z
  .unknown()
  .superRefine((value, ctx) => {
    const offenders = executablePayloadPaths(value);
    for (const path of offenders) {
      ctx.addIssue({
        code: "custom",
        path: path.split(".").filter(Boolean),
        message: "GM Action Checklist v1 must not contain executable tool payload fields.",
      });
    }
  })
  .pipe(z.object({
    version: z.literal(GM_ACTION_CHECKLIST_VERSION_V1).default(GM_ACTION_CHECKLIST_VERSION_V1),
    turnPath: z.enum(["mutating", "combat"]),
    steps: z.array(gmBackendToolChecklistStepV1Schema).min(1).max(GM_ACTION_CHECKLIST_MAX_STEPS_V1),
  }).strict().superRefine((value, ctx) => validateChecklistStepGraphV1(value.steps, ctx)));

export type GmActionChecklistV1 = z.infer<typeof gmActionChecklistV1Schema>;
export type GmChecklistStepV1 = GmActionChecklistV1["steps"][number];

const gmToolRequestV1Schema = z
  .object({
    version: z.literal(TOOL_REQUEST_VERSION_V1).default(TOOL_REQUEST_VERSION_V1),
    stepId: z.string().trim().min(1).max(40),
    toolName: z.enum(runtimeToolNames),
    input: z.record(z.string(), z.unknown()),
    evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  })
  .strict();

type GmToolRequestV1 = z.infer<typeof gmToolRequestV1Schema>;

export const GM_TOOL_REQUEST_SYSTEM_PROMPT_V1 = [
  "You select exactly one backend tool request for one checklist step.",
  "Return JSON only. Use one allowed tool and only visible/current refs from the scene.",
  "The only legal toolName values are listed in allowedToolNames. Never use any other tool.",
  "Match every model-authored prose input field to responseLanguage/toolInputLanguageContract. Preserve exact refs, names, item labels, place labels, and canon terms as written.",
  "For input refs such as sourceRefs, subjectRefs, evidenceRefs, speakerRef, addresseeRefs, actorRef, entityName, and destinationRef, use only model-safe visible labels/current aliases from scene or acceptedContext.",
  "Never copy backend-only refs like knowledge:*, actor:*, npc:*, item:*, location:*, event:*, tool-result:*, or UUIDs into tool input refs; replace them with a visible label such as Player/master clerk/damaged field ledger/current_location or omit them.",
  "If moving an actor, destinationRef and evidenceRefs must copy the same exact connected movement candidate ref.",
  "Never send empty strings for optional fields; omit the field entirely unless you have a non-empty value.",
  "For record_dialogue_outcome, futureUseKind must be one of route_choice|permission_check|evidence|safety|obligation|npc_memory|relationship|other; proof is topicKind only, so documentary/proof later use maps to futureUseKind=evidence, never futureUseKind=proof.",
  "For record_dialogue_outcome claims[].claimKind must be one of requirement|permission|prohibition|office|route_status|warning|lead|document_status|other; if the claim is a procedure step, document, authority, policy, office, access path, or category not represented exactly, use other rather than inventing a new enum.",
  "For record_dialogue_outcome, requestedRoleText is only for unavailable/no_current_answer or an explicit GM Read prose_role/no_visible_authority binding; otherwise omit it, never send requestedRoleText:\"\".",
  "For record_dialogue_outcome stateEffects, omit the field unless acceptedContext exposes a prior stateReceipts[].stateReceipt alias. If you use applied_now, every stateEffects entry must include effectId, status:\"applied_now\", stateReceipt copied exactly from acceptedContext, and summary.",
  "If gmRead.runtimeRequirement.speakerBinding.kind is prose_role or no_visible_authority, record_dialogue_outcome input must include requestedRoleText copied exactly from that binding.",
  "If gmRead.runtimeRequirement.speakerBinding.kind is visible_actor, record_dialogue_outcome speakerRef must copy that visible speakerRef; do not create or use a composed responder name for multiple already-visible actors.",
  "If a previous create_scene_extra result provides a responder name, use that model-safe name as speakerRef and still preserve requestedRoleText from GM Read.",
  "Do not narrate. Do not add extra steps. Do not invent backend IDs.",
].join(" ");

export function toolRequestSchemaForAllowedToolsV1(allowedToolNames: readonly RuntimeToolName[]) {
  const names = allowedToolNames.length > 0 ? allowedToolNames : runtimeToolNames;
  const variants = names.map((toolName) =>
    z.object({
      version: z.literal(TOOL_REQUEST_VERSION_V1).default(TOOL_REQUEST_VERSION_V1),
      stepId: z.string().trim().min(1).max(40),
      toolName: z.literal(toolName),
      input: runtimeToolInputSchemas[toolName],
      evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
    }).strict(),
  );

  return variants.length === 1
    ? variants[0]!
    : z.discriminatedUnion(
        "toolName",
        variants as [
          (typeof variants)[number],
          (typeof variants)[number],
          ...(typeof variants)[number][],
        ],
      );
}

export type GmToolStepStatusV1 =
  | "accepted"
  | "skipped"
  | "failed";

export interface GmToolStepSettlementV1 {
  stepId: string;
  purpose: string;
  status: GmToolStepStatusV1;
  toolName?: RuntimeToolName;
  input?: Record<string, unknown>;
  result?: ToolResult;
  reason?: string;
}

export interface AcceptedActorResultV1 {
  settlementId: string;
  actorId: string;
  actorLabel: string;
  toolName: RuntimeToolName;
  input: Record<string, unknown>;
  result: ToolResult;
  visibleFact?: string;
}

export interface LocalActorConsequenceSettlementV1 {
  settlementId: string;
  actorId: string;
  actorLabel: string;
  scheduleReason: string;
  status: "accepted" | "no_action_accepted" | "skipped" | "failed";
  visibleToPlayer: boolean;
  actionResults: AcceptedActorResultV1[];
  visibleFacts: string[];
  durableEventIds: string[];
  authorityRefs: string[];
}

export interface LocalConsequenceResultV1 {
  version: "local-consequence-result.v1";
  runId: string;
  stage: "local_actor_reactions";
  trigger: {
    gmReadPath: GmReadPath;
    acceptedGmStepIds: string[];
    acceptedToolResultRefs: string[];
  };
  baseWorldVersion: number;
  frameWorldVersion: number;
  resultWorldVersion: number;
  route: "required_before_packet" | "none" | "queued_after_done";
  actorSettlements: LocalActorConsequenceSettlementV1[];
  queuedSimulationProposalRefs: string[];
  skipped: Array<{ reason: string; actorId?: string; scheduleRef?: string }>;
  failed: Array<{ reason: string; actorId?: string; scheduleRef?: string }>;
}

export interface GameplayFrameEnvelopeV1 {
  version: "gameplay-frame-envelope.v1";
  turnId: string;
  campaignId: string;
  baseTick: number;
  baseWorldVersion: number;
  frame: SceneFrame;
  scopedForecastExcerpt: ScopedForecastExcerpt | null;
}

export interface SettledTurnPacketV1 {
  version: "settled-turn-packet.v1";
  packetId: string;
  turnId: string;
  campaignId: string;
  baseWorldVersion: number;
  resultWorldVersion: number;
  tick: number;
  playerAction: string;
  gmRead: {
    path: GmReadPath;
    situationSummary: string;
    sceneQuestion: string;
    actionInterpretation: GmRead["actionInterpretation"];
    rationale: string;
    evidenceRefs: string[];
    narrationGuardrails: string[];
  };
  oracleResult: OracleResult | null;
  visibleFacts: string[];
  skippedSteps: Array<{ stage: string; reason: string }>;
  failedSteps: Array<{ stage: string; reason: string }>;
  checklist: GmActionChecklistV1 | null;
  stepSettlements: GmToolStepSettlementV1[];
  acceptedToolResults: Array<{
    stepId: string;
    toolName: RuntimeToolName;
    input: Record<string, unknown>;
    result: ToolResult;
  }>;
  localConsequenceResult: LocalConsequenceResultV1 | null;
  acceptedActorResults: AcceptedActorResultV1[];
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
  privateGuardTerms: string[];
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function sceneActorRefs(actor: SceneActor): string[] {
  return uniqueStrings([
    actor.id,
    actor.actorId,
    actor.label,
    actor.locationId,
    actor.sceneScopeId,
    ...(actor.tags ?? []),
  ]);
}

export function buildSceneFrameForecastRefsV1(frame: SceneFrame): string[] {
  return uniqueStrings([
    frame.campaignId,
    frame.playerActorId,
    frame.currentLocationId,
    frame.currentSceneScopeId,
    frame.currentLocationName,
    frame.currentSceneScopeName,
    ...frame.roster.active.flatMap(sceneActorRefs),
    ...frame.roster.support.flatMap(sceneActorRefs),
    ...frame.roster.background.flatMap(sceneActorRefs),
    ...frame.movementCandidates.flatMap((candidate) => [
      candidate.id,
      candidate.locationId,
      candidate.label,
      ...(candidate.path ?? []),
    ]),
    ...frame.targetCandidates.flatMap((candidate) => [
      candidate.id,
      candidate.actorId,
      candidate.itemId,
      candidate.locationId,
      candidate.factionId,
      candidate.label,
      ...(candidate.tags ?? []),
    ]),
  ]);
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
      if (EXECUTABLE_PAYLOAD_KEYS.has(key)) {
        offenders.push(childPath);
      }
      visit(child, childPath);
    }
  }

  visit(value, "");
  return offenders;
}

export async function buildGameplayFrameEnvelopeV1(
  options: TurnOptions,
  turnId: string = randomUUID(),
): Promise<GameplayFrameEnvelopeV1> {
  const campaign = readCampaignConfig(options.campaignId);
  const clock = readWorldClock(options.campaignId);
  const baseTick = Math.max(campaign.currentTick ?? 0, clock.currentTick, clock.worldTimeMinutes);
  const frame = await buildSceneFrame({
    campaignId: options.campaignId,
    tick: baseTick,
    playerAction: options.playerAction,
    intent: options.intent,
    method: options.method,
    elapsedWorldTimeMinutes: 0,
    runActorExposureCatchup: false,
  });
  const forecast = loadWorldTrajectoryForecast(options.campaignId);
  const scopedForecastExcerpt = forecast
    ? buildScopedForecastExcerpt({
        forecast,
        localRefs: buildSceneFrameForecastRefsV1(frame),
      })
    : null;

  return {
    version: "gameplay-frame-envelope.v1",
    turnId,
    campaignId: options.campaignId,
    baseTick,
    baseWorldVersion: clock.worldVersion,
    frame,
    scopedForecastExcerpt,
  };
}

export function assertNoExecutableGmReadPayloadV1(read: GmRead): void {
  const offenders = executablePayloadPaths(read);
  if (offenders.length > 0) {
    throw new Error(`GM Read v1 crossed into execution payload ownership: ${offenders.join(", ")}`);
  }
}

function recentConversation(campaignId: string): Array<{ role: string; content: string }> {
  return getChatHistory(campaignId)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-8)
    .map((message) => ({ role: message.role, content: message.content }));
}

function playerActor(frame: SceneFrame): SceneActor | null {
  return frame.roster.active.find((actor) => actor.id === frame.playerActorId || actor.actorId === frame.playerActorId)
    ?? frame.roster.active.find((actor) => actor.type === "player")
    ?? null;
}

function targetTagsForOracle(frame: SceneFrame, read: Extract<GmRead, { path: "roll_oracle" }>): string[] {
  const targetRef = read.rollRequest.targetRef;
  if (!targetRef) return [];
  const normalized = targetRef.toLowerCase();
  const candidate = frame.targetCandidates.find((item) =>
    [item.id, item.actorId, item.itemId, item.locationId, item.factionId, item.label]
      .filter(Boolean)
      .some((value) => value!.toLowerCase() === normalized),
  );
  return candidate?.tags ?? [];
}

function buildOraclePayloadV1(
  envelope: GameplayFrameEnvelopeV1,
  read: Extract<GmRead, { path: "roll_oracle" }>,
): OraclePayload {
  const actor = playerActor(envelope.frame);
  return {
    intent: read.rollRequest.question,
    method: read.rollRequest.stakes,
    actorTags: actor?.tags ?? [],
    targetTags: targetTagsForOracle(envelope.frame, read),
    environmentTags: uniqueStrings([
      envelope.frame.currentLocationName,
      envelope.frame.currentSceneScopeName,
    ]),
    sceneContext: [
      envelope.frame.currentSceneScopeDescription,
      envelope.frame.currentLocationDescription,
      read.situationSummary,
      read.rollRequest.stakes,
    ].filter(Boolean).join("\n"),
  };
}

export function visibleFactsFromRead(read: GmRead, oracleResult: OracleResult | null): string[] {
  const facts: string[] = [];
  if (read.path === "direct") facts.push(read.directResolutionNotes);
  if (read.path === "continue") facts.push(read.continuationGuidance);
  if (read.path === "clarification") facts.push(read.clarificationPrompt);
  if (read.path === "roll_oracle" && oracleResult) {
    facts.push(`Oracle outcome: ${oracleResult.outcome}. ${oracleResult.reasoning}`);
  }
  return uniqueStrings(facts);
}

function visibleFactFromToolSettlement(settlement: GmToolStepSettlementV1): string | null {
  if (settlement.status !== "accepted" || !settlement.result?.success) return null;
  return summarizeToolSettlementForNarration(settlement, false);
}

function acceptedToolResultsFromSettlementsV1(
  settlements: readonly GmToolStepSettlementV1[],
): SettledTurnPacketV1["acceptedToolResults"] {
  return settlements
    .filter((settlement): settlement is GmToolStepSettlementV1 & {
      toolName: RuntimeToolName;
      input: Record<string, unknown>;
      result: ToolResult;
    } => settlement.status === "accepted" && Boolean(settlement.toolName && settlement.input && settlement.result))
    .map((settlement) => ({
      stepId: settlement.stepId,
      toolName: settlement.toolName,
      input: settlement.input,
      result: settlement.result,
    }));
}

function acceptedToolResultRefsV1(
  acceptedToolResults: readonly SettledTurnPacketV1["acceptedToolResults"][number][],
): string[] {
  return uniqueStrings(acceptedToolResults.flatMap((accepted) => [
    accepted.result.authority?.toolResultId,
    `${accepted.stepId}:${accepted.toolName}`,
  ]));
}

function durableEventIdsFromToolResultV1(result: ToolResult): string[] {
  const resultEventId = isRecord(result.result)
    ? result.result.eventId
    : null;
  return uniqueStrings([
    ...(result.authority?.eventRefs ?? []),
    typeof resultEventId === "string" ? resultEventId : null,
  ]);
}

function acceptedGmWriteScopesV1(
  acceptedToolResults: readonly SettledTurnPacketV1["acceptedToolResults"][number][],
): string[] {
  return uniqueStrings(acceptedToolResults.flatMap((accepted) =>
    accepted.result.authority?.stateDeltaRefs ?? [],
  ));
}

function visibleFactFromActorResultV1(
  actionResult: ExecutedScenePlanActionResult,
  actorLabel: string,
): string | null {
  if (!isRuntimeToolName(actionResult.toolName) || !actionResult.result.success) return null;
  return summarizeToolSettlementForNarration({
    stepId: actionResult.actionRef,
    purpose: `Local actor reaction by ${actorLabel}.`,
    status: "accepted",
    toolName: actionResult.toolName,
    input: actionResult.input,
    result: actionResult.result,
  }, false);
}

function acceptedActorResultFromActionV1(input: {
  settlementId: string;
  actorId: string;
  actorLabel: string;
  actionResult: ExecutedScenePlanActionResult;
}): AcceptedActorResultV1 | null {
  const { actionResult } = input;
  if (!isRuntimeToolName(actionResult.toolName) || actionResult.result.success !== true) {
    return null;
  }
  return {
    settlementId: input.settlementId,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    toolName: actionResult.toolName,
    input: actionResult.input,
    result: actionResult.result,
    visibleFact: visibleFactFromActorResultV1(actionResult, input.actorLabel) ?? undefined,
  };
}

export function buildLocalConsequenceResultFromActorPassV1(input: {
  envelope: GameplayFrameEnvelopeV1;
  read: GmRead;
  acceptedToolResults: SettledTurnPacketV1["acceptedToolResults"];
  refreshedFrame: SceneFrame;
  actorPass: RunRequiredActorDecisionPassResult;
  resultWorldVersion: number;
}): LocalConsequenceResultV1 {
  const actorSettlements = input.actorPass.decisions.map((decision, index): LocalActorConsequenceSettlementV1 => {
    const settlementId = `local-actor:${decision.schedule.actorId}:${index + 1}`;
    const acceptedResults = decision.actionResults
      .map((actionResult) => acceptedActorResultFromActionV1({
        settlementId,
        actorId: decision.schedule.actorId,
        actorLabel: decision.schedule.actorName,
        actionResult,
      }))
      .filter((result): result is AcceptedActorResultV1 => Boolean(result));
    const failedAction = decision.actionResults.find((actionResult) =>
      actionResult.result.success !== true || !isRuntimeToolName(actionResult.toolName),
    );
    const visibleFacts = uniqueStrings(acceptedResults.map((result) => result.visibleFact));
    const durableEventIds = uniqueStrings(acceptedResults.flatMap((result) =>
      durableEventIdsFromToolResultV1(result.result),
    ));
    const authorityRefs = uniqueStrings(acceptedResults.flatMap((result) => [
      result.result.authority?.toolResultId,
      ...(result.result.authority?.stateDeltaRefs ?? []),
    ]));

    return {
      settlementId,
      actorId: decision.schedule.actorId,
      actorLabel: decision.schedule.actorName,
      scheduleReason: decision.schedule.reason,
      status: acceptedResults.length > 0
        ? "accepted"
        : failedAction
          ? "failed"
          : "no_action_accepted",
      visibleToPlayer: visibleFacts.length > 0,
      actionResults: acceptedResults,
      visibleFacts,
      durableEventIds,
      authorityRefs,
    };
  });
  const partialFailures = input.actorPass.decisions.flatMap((decision) => {
    const acceptedRuntimeReceipt = decision.actionResults.some((actionResult) =>
      actionResult.result.success === true && isRuntimeToolName(actionResult.toolName),
    );
    if (!acceptedRuntimeReceipt) return [];
    return decision.actionResults
      .filter((actionResult) =>
        actionResult.result.success !== true || !isRuntimeToolName(actionResult.toolName),
      )
      .map((actionResult) => ({
        reason: `Actor extra tool rejected after accepted local reaction: ${actionResult.toolName}.`,
        actorId: decision.schedule.actorId,
        scheduleRef: decision.schedule.reason,
      }));
  });

  return {
    version: "local-consequence-result.v1",
    runId: randomUUID(),
    stage: "local_actor_reactions",
    trigger: {
      gmReadPath: input.read.path,
      acceptedGmStepIds: input.acceptedToolResults.map((result) => result.stepId),
      acceptedToolResultRefs: acceptedToolResultRefsV1(input.acceptedToolResults),
    },
    baseWorldVersion: input.envelope.baseWorldVersion,
    frameWorldVersion: input.refreshedFrame.worldVersion,
    resultWorldVersion: input.resultWorldVersion,
    route: "required_before_packet",
    actorSettlements,
    queuedSimulationProposalRefs: [],
    skipped: [
      ...input.actorPass.schedule.decisions
        .filter((decision) => decision.route !== "required_before_done")
        .map((decision) => ({
          reason: `Actor decision routed ${decision.route}; not settled before packet.`,
          actorId: decision.actorId,
          scheduleRef: decision.reason,
        })),
      ...partialFailures,
    ],
    failed: actorSettlements
      .filter((settlement) => settlement.status === "failed")
      .map((settlement) => ({
        reason: "Required local actor reaction did not produce accepted runtime receipts.",
        actorId: settlement.actorId,
        scheduleRef: settlement.scheduleReason,
      })),
  };
}

export function emptyLocalConsequenceResultV1(input: {
  envelope: GameplayFrameEnvelopeV1;
  read: GmRead;
  resultWorldVersion?: number;
}): LocalConsequenceResultV1 {
  return {
    version: "local-consequence-result.v1",
    runId: randomUUID(),
    stage: "local_actor_reactions",
    trigger: {
      gmReadPath: input.read.path,
      acceptedGmStepIds: [],
      acceptedToolResultRefs: [],
    },
    baseWorldVersion: input.envelope.baseWorldVersion,
    frameWorldVersion: input.envelope.frame.worldVersion,
    resultWorldVersion: input.resultWorldVersion ?? input.envelope.baseWorldVersion,
    route: "none",
    actorSettlements: [],
    queuedSimulationProposalRefs: [],
    skipped: [],
    failed: [],
  };
}

export function assertLocalConsequencePassAcceptedV1(result: LocalConsequenceResultV1): void {
  if (result.route !== "required_before_packet") return;
  const failed = result.failed[0];
  if (failed) {
    throw new Error(
      `Required local actor consequence failed before settled packet persistence: ${failed.reason}`,
    );
  }
}

async function runLocalConsequencePassV1(input: {
  options: TurnOptions;
  envelope: GameplayFrameEnvelopeV1;
  read: GmRead;
  acceptedToolResults: SettledTurnPacketV1["acceptedToolResults"];
}): Promise<LocalConsequenceResultV1> {
  if (input.acceptedToolResults.length === 0) {
    const clock = readWorldClock(input.options.campaignId);
    return emptyLocalConsequenceResultV1({
      envelope: input.envelope,
      read: input.read,
      resultWorldVersion: clock.worldVersion,
    });
  }

  const clockBeforeFrame = readWorldClock(input.options.campaignId);
  const elapsedWorldTimeMinutes = Math.max(
    0,
    clockBeforeFrame.worldTimeMinutes - input.envelope.baseTick,
  );
  const refreshedFrame = await buildSceneFrame({
    campaignId: input.options.campaignId,
    tick: Math.max(input.envelope.baseTick, clockBeforeFrame.currentTick, clockBeforeFrame.worldTimeMinutes),
    playerAction: input.options.playerAction,
    intent: input.options.intent,
    method: input.options.method,
    elapsedWorldTimeMinutes,
    runActorExposureCatchup: false,
  });
  const actorPass = await runRequiredActorDecisionPass({
    campaignId: input.options.campaignId,
    tick: refreshedFrame.tick,
    provider: input.options.judgeProvider,
    sceneFrame: refreshedFrame,
    playerAction: input.options.playerAction,
    playerLocationId: refreshedFrame.currentLocationId,
    playerSceneScopeId: refreshedFrame.currentSceneScopeId,
    elapsedWorldTimeMinutes,
    maxOutputTokens: input.options.storytellerMaxTokens,
    blockedWriteScopes: acceptedGmWriteScopesV1(input.acceptedToolResults),
    presentActorReactionRoute: "required_before_done",
    legalTools: refreshedFrame.allowedTools,
  });
  const resultClock = readWorldClock(input.options.campaignId);
  const result = buildLocalConsequenceResultFromActorPassV1({
    envelope: input.envelope,
    read: input.read,
    acceptedToolResults: input.acceptedToolResults,
    refreshedFrame,
    actorPass,
    resultWorldVersion: resultClock.worldVersion,
  });
  assertLocalConsequencePassAcceptedV1(result);
  return result;
}

function buildSettledTurnPacketV1(input: {
  envelope: GameplayFrameEnvelopeV1;
  read: GmRead;
  oracleResult: OracleResult | null;
  resultWorldVersion: number;
  checklist: GmActionChecklistV1 | null;
  stepSettlements: GmToolStepSettlementV1[];
  localConsequenceResult: LocalConsequenceResultV1 | null;
}): SettledTurnPacketV1 {
  const skippedSteps = input.stepSettlements
    .filter((settlement) => settlement.status === "skipped")
    .map((settlement) => ({
      stage: settlement.stepId,
      reason: settlement.reason ?? "Step skipped.",
    }));
  const failedSteps = input.stepSettlements
    .filter((settlement) => settlement.status === "failed")
    .map((settlement) => ({
      stage: settlement.stepId,
      reason: settlement.reason ?? settlement.result?.error ?? "Step failed.",
    }));
  const acceptedToolResults = acceptedToolResultsFromSettlementsV1(input.stepSettlements);
  const acceptedActorResults = input.localConsequenceResult?.actorSettlements.flatMap((settlement) =>
    settlement.actionResults,
  ) ?? [];
  const durableEventIds = durableEventIdsFromPacketV1({ acceptedToolResults, acceptedActorResults });

  return {
    version: "settled-turn-packet.v1",
    packetId: randomUUID(),
    turnId: input.envelope.turnId,
    campaignId: input.envelope.campaignId,
    baseWorldVersion: input.envelope.baseWorldVersion,
    resultWorldVersion: input.resultWorldVersion,
    tick: input.envelope.baseTick,
    playerAction: input.envelope.frame.playerAction,
    gmRead: {
      path: input.read.path,
      situationSummary: input.read.situationSummary,
      sceneQuestion: input.read.sceneQuestion,
      actionInterpretation: input.read.actionInterpretation,
      rationale: input.read.rationale,
      evidenceRefs: input.read.evidenceRefs,
      narrationGuardrails: input.read.narrationGuardrails,
    },
    oracleResult: input.oracleResult,
    visibleFacts: uniqueStrings([
      ...visibleFactsFromRead(input.read, input.oracleResult),
      ...input.stepSettlements.map(visibleFactFromToolSettlement),
      ...(input.localConsequenceResult?.actorSettlements.flatMap((settlement) => settlement.visibleFacts) ?? []),
    ]),
    skippedSteps,
    failedSteps,
    checklist: input.checklist,
    stepSettlements: input.stepSettlements,
    acceptedToolResults,
    localConsequenceResult: input.localConsequenceResult,
    acceptedActorResults,
    acceptedDurableEventIds: durableEventIds,
    producedDurableEventIds: durableEventIds,
    privateGuardTerms: input.envelope.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
  };
}

function responseLanguageForAction(playerAction: string): "ru" | "en" {
  return /[а-яё]/iu.test(playerAction) ? "ru" : "en";
}

function stripPrivateTerms(value: string, privateTerms: readonly string[]): string {
  let result = value;
  for (const term of privateTerms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    result = result.replaceAll(trimmed, NARRATOR_PRIVATE_TERM_PLACEHOLDER);
  }
  return result;
}

function acceptedNarrationEvidence(packet: SettledTurnPacketV1): string[] {
  const russian = responseLanguageForAction(packet.playerAction) === "ru";
  return uniqueStrings([
    ...packet.visibleFacts,
    ...packet.acceptedToolResults.map((entry) => summarizeToolSettlementForNarration({
      stepId: entry.stepId,
      purpose: entry.stepId,
      status: "accepted",
      toolName: entry.toolName,
      input: entry.input,
      result: entry.result,
    }, russian)),
    ...packet.acceptedActorResults.map((entry) => entry.visibleFact ?? summarizeToolSettlementForNarration({
      stepId: entry.settlementId,
      purpose: `Local actor reaction by ${entry.actorLabel}.`,
      status: "accepted",
      toolName: entry.toolName,
      input: entry.input,
      result: entry.result,
    }, russian)),
  ]).map((entry) => stripPrivateTerms(entry, packet.privateGuardTerms));
}

function narratorLanguageContractV1(language: "ru" | "en"): string {
  if (language === "ru") {
    return [
      "Write in Russian.",
      "All ordinary prose words, connectors, articles, transitions, and explanatory phrases must be Russian.",
      "Keep acceptedEvidence proper nouns, character names, item names, place names, and canon/franchise terms exactly as written.",
      "An English word is allowed only when it is an exact accepted label/name/canon term from acceptedEvidence; otherwise translate it into Russian.",
      "Do not introduce unrelated non-Russian scripts such as Chinese, Japanese, Korean, Arabic, Vietnamese, or mixed-script fragments into ordinary Russian prose unless that exact text appears as an accepted label/name/canon term.",
      "Do not create mixed-language phrases by attaching English common adjectives/nouns to Russian grammar, such as requisite поля.",
      "Do not leave English connective words such as and/or/nor/reveals/openness in Russian prose unless they are part of an accepted proper noun.",
    ].join(" ");
  }
  return "Write in English.";
}

export function toolInputLanguageContractV1(language: "ru" | "en"): string {
  if (language === "ru") {
    return [
      "For model-authored prose fields in tool input, write ordinary prose in Russian.",
      "This includes quote, summary, futureRelevance, reason, claims[].summary, stateEffects[].summary, and other explanatory fields.",
      "Preserve exact visible refs, character names, item names, place names, document labels, and canon terms as written.",
      "Do not put English ordinary phrases into dialogue quotes unless the phrase is an exact accepted source label or proper noun.",
      "Do not introduce unrelated non-turn scripts such as Chinese, Japanese, Korean, Arabic, Vietnamese, or mixed-script fragments into ordinary prose unless exact accepted source text contains them.",
      "Do not use English schema/internal words as Russian prose, such as durable, official, stamped, proof, procedure, or applied_now; translate them unless they are exact accepted labels.",
      "Do not mix Latin and Cyrillic inside one ordinary Russian word, such as procedурные.",
    ].join(" ");
  }
  return "For model-authored prose fields in tool input, write ordinary prose in English.";
}

export function buildNarratorPromptFromSettledPacketV1(packet: SettledTurnPacketV1): {
  system: string;
  prompt: string;
} {
  const language = responseLanguageForAction(packet.playerAction);
  const acceptedEvidence = acceptedNarrationEvidence(packet);
  const system = [
    "You are the player-facing narrator for WorldForge.",
    "Write only prose for the player. Do not output JSON, markdown, bullet lists, tool names, ids, schemas, logs, or diagnostics.",
    "Use only acceptedEvidence, gmRead, and oracleResult. Do not invent new consequences, locations, items, injuries, NPC actions, permissions, or world changes.",
    "When acceptedEvidence contains a concrete resolved outcome, narrate that outcome as authoritative and let it override any looser setup in gmRead.",
    "When acceptedEvidence says movement completed or names the current scene after movement, narrate the completed arrival; do not describe the choice as still pending.",
    "A route-check acceptedEvidence entry is route availability only; never narrate travel, arrival, or location change from check_route unless a separate move_actor/move_to acceptedEvidence entry says movement completed.",
    "Candidate lookup acceptedEvidence supports only the returned labels and explicit returned details. Do not infer object contents, markings, text, serial/registration numbers, addresses, hidden contents, or absence of such details from candidate labels.",
    "Never narrate failedSteps, skippedSteps, privateGuardTerms, backend ids, hidden facts, or planned-but-unaccepted effects.",
    narratorLanguageContractV1(language),
  ].join(" ");
  return {
    system,
    prompt: JSON.stringify({
      contract: {
        output: "player-facing prose only",
        language,
        languageContract: language === "ru"
          ? "Russian prose; preserve accepted proper nouns exactly; English only for exact accepted labels/names/canon terms; translate all other common words."
          : "English prose.",
        allowedSources: ["acceptedEvidence", "gmRead", "oracleResult"],
        forbidden: [
          "new consequences",
          "failed/skipped step effects",
          "tool names",
          "backend ids",
          "private guard terms",
          "JSON",
          "markdown",
        ],
      },
      playerAction: packet.playerAction,
      gmRead: packet.gmRead,
      oracleResult: packet.oracleResult,
      acceptedEvidence,
      auditOnlyNotNarratorEvidence: {
        failedStepCount: packet.failedSteps.length,
        skippedStepCount: packet.skippedSteps.length,
        failedLocalConsequenceCount: packet.localConsequenceResult?.failed.length ?? 0,
        skippedLocalConsequenceCount: packet.localConsequenceResult?.skipped.length ?? 0,
      },
    }, null, 2),
  };
}

export function assertNarrationRespectsSettledPacketV1(
  narration: string,
  packet: SettledTurnPacketV1,
): void {
  const trimmed = narration.trim();
  if (!trimmed) {
    throw new Error("Narrator returned empty narration.");
  }
  if (/^\s*[{[]/u.test(trimmed)) {
    throw new Error("Narrator returned structured data instead of prose.");
  }
  const lower = trimmed.toLowerCase();
  const forbiddenMarkers = [
    "toolName",
    "acceptedToolResults",
    "failedSteps",
    "skippedSteps",
    "privateGuardTerms",
    "[hidden]",
    NARRATOR_PRIVATE_TERM_PLACEHOLDER,
  ];
  const leakedMarker = forbiddenMarkers.find((marker) => lower.includes(marker.toLowerCase()));
  if (leakedMarker) {
    throw new Error(`Narrator leaked non-player-facing marker: ${leakedMarker}`);
  }
  const leakedPrivateTerm = packet.privateGuardTerms.find((term) =>
    term.trim().length > 0 && lower.includes(term.trim().toLowerCase()),
  );
  if (leakedPrivateTerm) {
    throw new Error("Narrator leaked private forecast guard term.");
  }
}

async function narrateSettledTurnPacketV1(
  packet: SettledTurnPacketV1,
  options: TurnOptions,
): Promise<string> {
  const { system, prompt } = buildNarratorPromptFromSettledPacketV1(packet);
  const result = await withRole("storyteller", () =>
    generateText({
      model: createModel(options.storytellerProvider, { role: "storyteller" }),
      system,
      prompt,
      temperature: options.storytellerTemperature,
      maxOutputTokens: Math.max(256, Math.min(options.storytellerMaxTokens, 1_200)),
    }),
  );
  assertNarrationRespectsSettledPacketV1(result.text, packet);
  return result.text.trim();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readLabelList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value
    .slice(0, limit)
    .map((entry) => readRecord(entry)?.label)
    .filter((label): label is string => typeof label === "string" && label.trim().length > 0));
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim()));
}

function readVisibleTargetLabels(input: {
  value: unknown;
  limit: number;
  carried: boolean;
}): string[] {
  if (!Array.isArray(input.value)) return [];
  const labels: string[] = [];
  for (const entry of input.value.slice(0, input.limit)) {
    const record = readRecord(entry);
    const label = typeof record?.label === "string" && record.label.trim().length > 0
      ? record.label.trim()
      : null;
    const type = typeof record?.type === "string" ? record.type : null;
    const tags = readStringList(record?.visibleTags).map((tag) => tag.toLowerCase());
    const isCarried = type === "item" && tags.some((tag) =>
      tag === "equipped" || tag === "carried" || tag === "starting-loadout"
    );
    if (label && isCarried === input.carried) labels.push(label);
  }
  return uniqueStrings(labels);
}

function summarizeToolSettlementForNarration(
  settlement: GmToolStepSettlementV1,
  russian: boolean,
): string | null {
  if (settlement.status !== "accepted" || !settlement.result?.success) return null;
  const payload = readRecord(settlement.result.result);
  if (!payload) {
    return russian
      ? "Действие принято системой мира."
      : "The action was accepted by the world state.";
  }

  if (settlement.toolName === "list_navigation_options") {
    const current = readRecord(payload.current);
    const location = typeof current?.locationName === "string"
      ? current.locationName
      : typeof current?.sceneName === "string"
        ? current.sceneName
        : null;
    const routes = readLabelList(payload.candidates, 8);
    if (russian) {
      return [
        location ? `Ты сверяешь доступные маршруты из места: ${location}.` : "Ты сверяешь доступные маршруты.",
        routes.length ? `Доступные направления: ${routes.join(", ")}.` : null,
      ].filter(Boolean).join(" ");
    }
    return [
      location ? `You check available routes from ${location}.` : "You check available routes.",
      routes.length ? `Open routes: ${routes.join(", ")}.` : null,
    ].filter(Boolean).join(" ");
  }

  if (settlement.toolName === "find_object_candidates"
    || settlement.toolName === "find_actor_candidates"
    || settlement.toolName === "find_location_candidates"
    || settlement.toolName === "find_poi_candidates") {
    const labels = readLabelList(payload.candidates, 8);
    if (labels.length > 0) {
      if (settlement.toolName === "find_object_candidates") {
        if (russian) {
          return [
            `Подходящие видимые предметы: ${labels.join(", ")}.`,
            "Эта проверка подтверждает только совпавшие видимые предметы и явно возвращенные детали; она не подтверждает содержимое, внешние marks, текст, серийные или регистрационные номера, адреса или отсутствие деталей, которых нет в результате.",
          ].join(" ");
        }
        return [
          `Matching visible objects: ${labels.join(", ")}.`,
          "This lookup confirms only matching visible objects and explicitly returned details; it does not confirm contents, external marks, text, serial or registration numbers, addresses, or absence of details not returned.",
        ].join(" ");
      }
      if (russian) {
        return `Подходящие видимые варианты: ${labels.join(", ")}.`;
      }
      return `Matching visible options: ${labels.join(", ")}.`;
    }
    switch (settlement.toolName) {
      case "find_object_candidates":
        return russian
          ? "Совпавшие видимые предметы этим lookup не подтверждены. Это не проверяет видимых людей, маршруты, учреждения или точки интереса и не доказывает их отсутствие."
          : "No matching visible objects are confirmed by this lookup. This does not check visible people, routes, offices, or points of interest and does not prove their absence.";
      case "find_actor_candidates":
        return russian
          ? "Совпавшие видимые люди или акторы этим lookup не подтверждены. Это не проверяет предметы, маршруты, учреждения или точки интереса и не доказывает их отсутствие."
          : "No matching visible people or actors are confirmed by this lookup. This does not check objects, routes, offices, or points of interest and does not prove their absence.";
      case "find_location_candidates":
        return russian
          ? "Совпавшие видимые или достижимые локации этим lookup не подтверждены. Это не проверяет людей, предметы или другие категории и не доказывает их отсутствие."
          : "No matching visible or reachable locations are confirmed by this lookup. This does not check people, objects, or other categories and does not prove their absence.";
      case "find_poi_candidates":
        return russian
          ? "Совпавшие видимые точки интереса этим lookup не подтверждены. Это не проверяет все возможные предметы, людей или маршруты и не доказывает их отсутствие."
          : "No matching visible points of interest are confirmed by this lookup. This does not check every possible object, person, or route and does not prove their absence.";
    }
  }

  if (settlement.toolName === "start_search") {
    const query = typeof payload.query === "string" && payload.query.trim().length > 0
      ? payload.query.trim()
      : null;
    if (russian) {
      return [
        query ? `Поиск начат: ${query}.` : "Поиск начат.",
        "Конкретная находка, доказательство, номер, адрес или отметка этим шагом не подтверждены; это не доказывает их отсутствие.",
      ].join(" ");
    }
    return [
      query ? `Search started: ${query}.` : "Search started.",
      "No concrete discovery, proof, number, address, or mark is confirmed by this step; that does not prove absence.",
    ].join(" ");
  }

  if (settlement.toolName === "inspect_known_fact") {
    const facts = readLabelList(payload.facts, 8);
    const candidates = readLabelList(payload.candidates, 8);
    const matches = uniqueStrings([...facts, ...candidates]);
    const query = typeof payload.query === "string" && payload.query.trim().length > 0
      ? payload.query.trim()
      : typeof settlement.input?.query === "string" && settlement.input.query.trim().length > 0
        ? settlement.input.query.trim()
        : typeof settlement.input?.ref === "string" && settlement.input.ref.trim().length > 0
          ? settlement.input.ref.trim()
          : null;
    if (matches.length > 0) {
      return russian
        ? `Проверка известных игроку фактов подтвердила совпадения: ${matches.join(", ")}.`
        : `Player-known fact lookup confirmed matches: ${matches.join(", ")}.`;
    }
    return russian
      ? [
        query ? `Проверка известных игроку фактов по запросу "${query}" выполнена.` : "Проверка известных игроку фактов выполнена.",
        "Совпавший видимый или уже известный игроку факт не подтверждён; это не подтверждает запрошенную деталь и не является общим осмотром сцены.",
      ].join(" ")
      : [
        query ? `Player-known fact lookup for "${query}" completed.` : "Player-known fact lookup completed.",
        "No matching player-visible or player-known fact is confirmed; this does not confirm the requested detail and is not a general scene look-around.",
      ].join(" ");
  }

  if (settlement.toolName === "check_route") {
    const current = readRecord(payload.current);
    const currentLabel = typeof current?.locationName === "string" && current.locationName.trim().length > 0
      ? current.locationName.trim()
      : typeof current?.sceneName === "string" && current.sceneName.trim().length > 0
        ? current.sceneName.trim()
        : null;
    const destination = readRecord(payload.destination);
    const destinationLabel = typeof destination?.label === "string" && destination.label.trim().length > 0
      ? destination.label.trim()
      : null;
    const routeStatus = typeof payload.routeStatus === "string" && payload.routeStatus.trim().length > 0
      ? payload.routeStatus.trim()
      : null;
    const pathLabels = readLabelList(payload.path, 8)
      .filter((label) => label !== "current_location");
    if (russian) {
      const routeSentence = routeStatus === "legal" && destinationLabel
        ? `Проверка маршрута подтвердила доступность направления: ${destinationLabel}.`
        : destinationLabel
          ? `Проверка маршрута к ${destinationLabel} выполнена; доступность направления не подтверждена.`
          : "Проверка маршрута завершена.";
      return [
        currentLabel ? `Проверка маршрута выполнена из текущей сцены: ${currentLabel}.` : null,
        routeSentence,
        routeStatus ? `Статус маршрута: ${routeStatus}.` : null,
        pathLabels.length ? `Маршрут: ${pathLabels.join(" -> ")}.` : null,
        currentLabel
          ? `Этот результат не перемещает игрока и не меняет текущую сцену; текущая сцена остаётся: ${currentLabel}. Если текст игрока называл другую исходную локацию, она не является авторитетной.`
          : "Этот результат не перемещает игрока и не меняет текущую сцену.",
      ].filter(Boolean).join(" ");
    }
    const routeSentence = routeStatus === "legal" && destinationLabel
      ? `Route check confirmed route availability for: ${destinationLabel}.`
      : destinationLabel
        ? `Route check to ${destinationLabel} completed; route availability is not confirmed.`
        : "Route check completed.";
    return [
      currentLabel ? `Route check was performed from the current scene: ${currentLabel}.` : null,
      routeSentence,
      routeStatus ? `Route status: ${routeStatus}.` : null,
      pathLabels.length ? `Path: ${pathLabels.join(" -> ")}.` : null,
      currentLabel
        ? `This result does not move the player or change the current scene; the current scene remains: ${currentLabel}. If the player text named a different origin, that origin is not authoritative.`
        : "This result does not move the player or change the current scene.",
    ].filter(Boolean).join(" ");
  }

  if (settlement.toolName === "move_actor" || settlement.toolName === "move_to") {
    const locationName = typeof payload.locationName === "string" && payload.locationName.trim().length > 0
      ? payload.locationName.trim()
      : typeof payload.destinationRef === "string" && payload.destinationRef.trim().length > 0
        ? payload.destinationRef.trim()
        : null;
    const pathLabels = readLabelList(payload.path, 8);
    if (russian) {
      return [
        locationName
          ? `Перемещение завершено: текущая сцена теперь ${locationName}.`
          : "Перемещение завершено.",
        pathLabels.length ? `Пройденный путь: ${pathLabels.join(" -> ")}.` : null,
      ].filter(Boolean).join(" ");
    }
    return [
      locationName
        ? `Movement completed: current scene is now ${locationName}.`
        : "Movement completed.",
      pathLabels.length ? `Travel path: ${pathLabels.join(" -> ")}.` : null,
    ].filter(Boolean).join(" ");
  }

  if (settlement.result.observationOnly || settlement.toolName === "list_visible_affordances") {
    const current = readRecord(payload.current);
    const location = typeof current?.locationName === "string"
      ? current.locationName
      : typeof current?.sceneName === "string"
        ? current.sceneName
        : null;
    const actors = readLabelList(payload.visibleActors, 5);
    const movement = readLabelList(payload.legalMovement, 5);
    const carriedTargets = readVisibleTargetLabels({
      value: payload.legalTargets,
      limit: 8,
      carried: true,
    });
    const targets = readVisibleTargetLabels({
      value: payload.legalTargets,
      limit: 8,
      carried: false,
    })
      .filter((label) => !actors.includes(label));
    if (russian) {
      return [
        location ? `Ты осматриваешься в месте: ${location}.` : "Ты осматриваешься вокруг.",
        actors.length ? `Рядом заметны: ${actors.join(", ")}.` : null,
        carriedTargets.length ? `При тебе: ${carriedTargets.join(", ")}.` : null,
        targets.length ? `В поле внимания есть: ${targets.join(", ")}.` : null,
        movement.length ? `Доступные направления: ${movement.join(", ")}.` : null,
      ].filter(Boolean).join(" ");
    }

    return [
      location ? `You look around at ${location}.` : "You look around.",
      actors.length ? `Visible nearby: ${actors.join(", ")}.` : null,
      carriedTargets.length ? `You are carrying: ${carriedTargets.join(", ")}.` : null,
      targets.length ? `You can focus on: ${targets.join(", ")}.` : null,
      movement.length ? `Open routes: ${movement.join(", ")}.` : null,
    ].filter(Boolean).join(" ");
  }

  const payloadText = typeof payload.text === "string" && payload.text.trim().length > 0
    ? payload.text.trim()
    : null;
  if (payloadText) return payloadText;

  const payloadSummary = typeof payload.summary === "string" && payload.summary.trim().length > 0
    ? payload.summary.trim()
    : null;
  if (payloadSummary) return payloadSummary;

  const acceptedLogEventText = settlement.toolName === "log_event"
    && typeof settlement.input?.text === "string"
    && settlement.input.text.trim().length > 0
    ? settlement.input.text.trim()
    : null;
  if (acceptedLogEventText) return acceptedLogEventText;

  const resultText = typeof settlement.result.result === "string"
    ? settlement.result.result
    : null;
  if (resultText) return resultText;
  return russian
    ? "Мир принял результат действия."
    : "The world accepted the action result.";
}

function checklistTurnPath(read: GmRead): GmActionChecklistV1["turnPath"] | null {
  if (read.path === "tool_plan") return "mutating";
  if (read.path === "combat_transition") return "combat";
  if (read.path === "roll_oracle") return "oracle_consequence";
  return null;
}

function modelSafeSceneSummary(frame: SceneFrame): Record<string, unknown> {
  return {
    tick: frame.tick,
    currentLocation: frame.currentLocationName ?? frame.currentLocationId,
    currentScene: frame.currentSceneScopeName ?? frame.currentSceneScopeId,
    allowedTools: frame.allowedTools,
    visibleActors: [...frame.roster.active, ...frame.roster.support].map((actor) => ({
      ref: actor.label,
      type: actor.type,
      awareness: actor.awareness,
      tags: actor.tags ?? [],
    })),
    movementCandidates: frame.movementCandidates.map((candidate) => ({
      ref: candidate.label,
      connected: candidate.connected,
      travelCost: candidate.travelCost,
    })),
    targetCandidates: frame.targetCandidates.map((candidate) => ({
      ref: candidate.label,
      type: candidate.type,
      tags: candidate.tags ?? [],
    })),
  };
}

export function toolContractHint(toolName: RuntimeToolName): Record<string, unknown> {
  const descriptor = RUNTIME_TOOL_DESCRIPTORS[toolName];
  switch (toolName) {
    case "list_visible_affordances":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          scope: "optional current_scene|current_location|visible|known",
          maxResults: "optional integer 1-8; prefer 4-6",
        },
      };
    case "list_navigation_options":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          actorRef: "optional exact visible actor label; omit for player",
          fromLocationRef: "optional exact current location label",
          maxResults: "optional integer 1-8; prefer 4-6; never exceed 8",
        },
      };
    case "find_location_candidates":
    case "find_object_candidates":
    case "find_actor_candidates":
    case "find_poi_candidates":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          query: "short fuzzy player-facing words to match against visible/legal candidates",
          scope: "optional current_scene|current_location|visible|known",
          tags: ["optional 0-6 short tags"],
          maxResults: "optional integer 1-8; prefer 3-4; never exceed 8",
        },
      };
    case "inspect_known_fact":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          query: "optional short player-visible/player-known fact query",
          ref: "optional exact visible/current ref; query or ref is required",
          scope: "optional current_scene|current_location|visible|known",
          maxResults: "optional integer 1-8; prefer 2-4; never exceed 8",
        },
      };
    case "move_to":
      return {
        toolName,
        roles: descriptor.roles,
        input: { targetLocationName: "exact connected destination label" },
      };
    case "move_actor":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          actorRef: "optional exact visible actor label; omit for player",
          destinationRef: "exact connected destination ref from scene.movementCandidates",
          mode: "walk|travel|follow_route|unknown",
          intentSummary: "brief reason",
          evidenceRefs: ["same exact connected movement candidate ref"],
        },
      };
    case "log_event":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          text: "concrete event description",
          importance: "1-10",
          participants: ["clear local/current actor names"],
          durability: "scene_local|durable",
          futureRelevance: "required when durable",
        },
      };
    case "record_player_intent":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          actorRef: "optional Player/current_player",
          intentType: "seek|ask|claim|avoid|follow|inspect|negotiate|travel|other",
          targetHint: "optional visible target",
          stance: "intends|claims|suspects|asks|refuses|offers|unknown",
          summary: "brief summary",
        },
      };
    case "start_search":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          actorRef: "optional Player/current_player; omit for player",
          query: "specific unconfirmed detail or thing being searched for",
          scope: "current_scene|current_location|visible",
          method: "look|ask|inspect|listen|track|browse",
          intentSummary: "brief reason; do not claim the detail was found",
        },
        notes: [
          "Use when the player searches, reads, checks, or inspects for a specific unconfirmed detail that no lookup result can actually return.",
          "This records an active search with targetTruth=unconfirmed and found=false; it must not be narrated as proof that the detail is absent.",
        ],
      };
    case "transfer_item":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          itemName: "exact existing item label",
          targetName: "exact receiving actor/player/NPC/location label; never a container item label",
          targetType: "character|npc|player|actor|location; never item",
          equipState: "optional carried|equipped only for actor/player/NPC targets",
          equippedSlot: "optional non-empty slot only when equipState=equipped",
          transferredItemName: "optional only for partial payment/deposit/split",
          remainingItemName: "optional only for partial payment/deposit/split",
        },
        notes: [
          "Use only for real custody/owner/location/equip-state changes.",
          "Do not use when the player merely keeps, pockets, hides, carries, or stows an item already in their inventory/current possession.",
          "Do not use for ordinary small/unmodeled currency unless the money exists as a visible/current/inventory item ref in the SceneFrame.",
        ],
      };
    case "record_world_fact":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          sourceKind: "direct_observation|public_record|report_message|rumor|claim|comparison|memory|other",
          truthStatus: "observed|verified|reported|rumored|claimed|believed|disputed|unknown",
          factKind: "public_record|procedure|route_status|permission_boundary|warning|lead|status|contradiction|gap|other",
          topicKind: "social|procedure|permission|proof|route|safety|trade|status|other",
          durability: "durable|scene_local",
          futureUseKind: "required when durable; route_choice|permission_check|evidence|safety|obligation|npc_memory|relationship|other",
          futureRelevance: "required when durable",
          summary: "brief fact summary",
          claims: [{
            claimKind: "public_record|requirement|permission_boundary|prohibition|office|route_status|warning|lead|status|contradiction|gap|other",
            polarity: "allows|denies|requires|redirects|unknown|states",
            subjectRef: "optional exact visible/current ref only; never knowledge:* or backend id",
            subjectText: "free text when not an exact visible ref",
            summary: "claim summary",
          }],
          subjectRefs: ["optional exact visible/current refs only; never knowledge:* or backend ids"],
          sourceRefs: ["exact visible/current refs only; never knowledge:* or backend ids; prefer Player/master clerk/damaged field ledger/current_location"],
        },
      };
    case "create_scene_extra":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          locationRef: "current_scene|current_location",
          role: "service|witness|crowd|support|vendor|courier|clerk|porter",
          roleText: "optional exact addressed role text from GM Read/player action",
          name: "optional temporary visible name",
          tags: ["0-6 short tags"],
          persistence: "temporary",
          visibility: "visible",
          reason: "why the current scene/location plausibly contains this temporary support extra",
        },
        forbiddenInputKeys: ["locationId", "roleLabel", "type", "description"],
      };
    case "record_dialogue_outcome":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          speakerRef: "exact visible actor/model-safe ref; omit only for unavailable/no_current_answer",
          addresseeRefs: ["Player"],
          outcomeKind: "answered|refused|silent|gestured|warned|redirected|unavailable|no_current_answer",
          topicKind: "social|procedure|permission|proof|route|safety|trade|status|other",
          authorityKind: "role_authority|public_service|witness|hearsay|not_authorized|no_visible_authority|unknown",
          truthStatus: "settled_by_backend|speaker_asserted|unconfirmed|contested|conflicting",
          durability: "durable|scene_local",
          futureUseKind: "required when durable; exact enum route_choice|permission_check|evidence|safety|obligation|npc_memory|relationship|other; use evidence for proof/documentary value, never proof",
          futureRelevance: "required when durable",
          requestedRoleText: "optional non-empty string; required only for unavailable/no_current_answer and GM Read prose_role/no_visible_authority bindings; omit otherwise, never empty string",
          quote: "direct speech when answered/warned/redirected and durable",
          summary: "brief outcome summary",
          claims: [{
            claimKind: "exact enum requirement|permission|prohibition|office|route_status|warning|lead|document_status|other; use other for procedure/document/authority/policy categories that do not exactly fit",
            polarity: "allows|denies|requires|redirects|unknown|states",
            subjectText: "free text when not an exact visible ref",
            summary: "claim summary",
          }],
          stateEffects: [{
            effectId: "optional stable short id; omit stateEffects unless linking prior accepted structural state",
            status: "applied_now|not_applied|asserted_only",
            stateReceipt: "required for applied_now; exact prior acceptedContext.stateReceipts[].stateReceipt",
            summary: "required human-readable effect summary",
          }],
          sourceRefs: ["exact visible/current refs only"],
        },
      };
    case "advance_time":
      return {
        toolName,
        roles: descriptor.roles,
        input: {
          minutes: "integer minutes elapsed",
          reason: "source-grounded reason",
        },
      };
    default:
      return {
        toolName,
        roles: descriptor.roles,
        input: "Use only the runtime schema for this exact tool and visible/current refs.",
      };
  }
}

function allowedToolHints(frame: SceneFrame): Record<string, unknown>[] {
  return frame.allowedTools
    .filter((toolName) => isRuntimeToolName(toolName))
    .map((toolName) => toolContractHint(toolName));
}

function toolRequestExampleForStepV1(
  step: GmChecklistStepV1,
  read: GmRead,
  frame: SceneFrame,
  allowedToolNames: readonly RuntimeToolName[],
): Record<string, unknown> | null {
  const requestedRoleText = gmReadRequestedRoleTextV1(read);
  if (
    step.toolNeed === "create_scene_extra"
    || allowedToolNames.length === 1 && allowedToolNames.includes("create_scene_extra")
  ) {
    return {
      version: TOOL_REQUEST_VERSION_V1,
      stepId: step.stepId,
      toolName: "create_scene_extra",
      input: {
        locationRef: "current_scene",
        role: "clerk",
        roleText: requestedRoleText ?? "archival clerk",
        name: "Archive Clerk",
        tags: ["temporary", "service"],
        persistence: "temporary",
        visibility: "visible",
        reason: "The current public counter plausibly has an ordinary temporary clerk to answer routine questions.",
      },
      evidenceRefs: step.evidenceRefs.slice(0, 3),
    };
  }
  if (
    step.toolNeed === "record_dialogue_outcome"
    || step.toolNeed === "dialogue_outcome"
    || allowedToolNames.length === 1 && allowedToolNames.includes("record_dialogue_outcome")
  ) {
    const visibleSpeaker = frame.roster.support[0]?.label ?? frame.roster.active.find((actor) => actor.type !== "player")?.label;
    return {
      version: TOOL_REQUEST_VERSION_V1,
      stepId: step.stepId,
      toolName: "record_dialogue_outcome",
      input: {
        ...(visibleSpeaker ? { speakerRef: visibleSpeaker } : {}),
        addresseeRefs: ["Player"],
        outcomeKind: visibleSpeaker ? "answered" : "no_current_answer",
        topicKind: "procedure",
        authorityKind: visibleSpeaker ? "public_service" : "no_visible_authority",
        truthStatus: visibleSpeaker ? "speaker_asserted" : "unconfirmed",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The answer or lack of answer changes what the player can try next.",
        ...(requestedRoleText || !visibleSpeaker
          ? { requestedRoleText: requestedRoleText ?? "requested local responder" }
          : {}),
        ...(visibleSpeaker ? { quote: "Check the public ledger first, then bring the stamped slip back to this counter." } : {}),
        summary: "The current responder gives a concrete procedural answer.",
        claims: [{
          claimKind: "requirement",
          polarity: "requires",
          subjectText: "public ledger and stamped slip",
          summary: "The responder says the public ledger and stamped slip matter next.",
        }],
        sourceRefs: visibleSpeaker ? [visibleSpeaker, "Player"] : ["Player"],
      },
      evidenceRefs: step.evidenceRefs.slice(0, 3),
    };
  }
  if (
    step.toolNeed === "list_navigation_options"
    || allowedToolNames.length === 1 && allowedToolNames.includes("list_navigation_options")
  ) {
    return {
      version: TOOL_REQUEST_VERSION_V1,
      stepId: step.stepId,
      toolName: "list_navigation_options",
      input: {
        actorRef: "Player",
        maxResults: 6,
      },
      evidenceRefs: step.evidenceRefs.slice(0, 3),
    };
  }
  if (step.toolNeed !== "movement") return null;
  const destination = frame.movementCandidates.find((candidate) => candidate.connected)
    ?? frame.movementCandidates[0];
  if (!destination) return null;
  if (allowedToolNames.includes("move_to")) {
    return {
      version: TOOL_REQUEST_VERSION_V1,
      stepId: step.stepId,
      toolName: "move_to",
      input: { targetLocationName: destination.label },
      evidenceRefs: [destination.label],
    };
  }
  if (allowedToolNames.includes("move_actor")) {
    return {
      version: TOOL_REQUEST_VERSION_V1,
      stepId: step.stepId,
      toolName: "move_actor",
      input: {
        destinationRef: destination.label,
        mode: "walk",
        intentSummary: step.purpose,
        evidenceRefs: [destination.label],
      },
      evidenceRefs: [destination.label],
    };
  }
  return null;
}

function addressedTargetFromGmReadV1(read: GmRead): DialogueAddressedTargetInput | null {
  const binding = read.runtimeRequirement?.kind === "dialogue_outcome"
    ? read.runtimeRequirement.speakerBinding
    : null;
  if (!binding) return null;
  if (binding.kind === "visible_actor") {
    return { kind: "visible_ref", ref: binding.speakerRef };
  }
  if (binding.kind === "prose_role") {
    return { kind: "prose_role", roleText: binding.requestedRoleText };
  }
  return { kind: "no_visible_authority", roleText: binding.requestedRoleText };
}

function gmReadRequestedRoleTextV1(read: GmRead): string | null {
  const binding = read.runtimeRequirement?.kind === "dialogue_outcome"
    ? read.runtimeRequirement.speakerBinding
    : null;
  if (!binding) return null;
  if (binding.kind === "visible_actor") return null;
  return binding.requestedRoleText;
}

export function acceptedStepContextV1(
  settlements: readonly GmToolStepSettlementV1[],
): Record<string, unknown>[] {
  return settlements
    .filter((settlement) => settlement.status === "accepted" && settlement.result?.success === true)
    .map((settlement) => ({
      stepId: settlement.stepId,
      toolName: settlement.toolName ?? null,
      observationOnly: settlement.result?.observationOnly ?? false,
      modelSafeRefs: settlement.result?.modelSafeRefs ?? [],
      authority: settlement.result?.authority
        ? {
            toolResultId: settlement.result.authority.toolResultId,
            sourceEntity: settlement.result.authority.sourceEntity,
            stateDeltaRefs: settlement.result.authority.stateDeltaRefs,
            eventRefs: settlement.result.authority.eventRefs,
          }
        : null,
      stateReceipts: settlement.result?.stateReceipts?.map((receipt) => ({
        stateReceipt: receipt.stateReceipt,
      })) ?? [],
      resultPreview: settlement.result?.result && typeof settlement.result.result === "object"
        ? settlement.result.result
        : typeof settlement.result?.result === "string"
          ? settlement.result.result.slice(0, 240)
          : null,
    }));
}

export function gmActionChecklistSystemPromptV1(): string {
  return [
    "You create a GM Action Checklist for one player turn.",
    "Return one JSON object only.",
    "Return exactly these top-level keys: version, turnPath, steps.",
    `Return between 1 and ${GM_ACTION_CHECKLIST_MAX_STEPS_V1} steps.`,
    "Each step must use exactly these keys: stepId, purpose, evidenceRefs, dependsOnStepIds, expectedVisibleEffect, requiredAction, settlementPolicy, toolNeed.",
    "The checklist is NOT execution. Do not include toolName, input, args, payload, candidateToolRequest, plannedTools, state deltas, or narration.",
    "Do not wrap the object in a key named checklist. Do not use checklistVersion, stage, action, description, or requiredOutcome.",
    "Each backend_tool step says what needs to become true; a later backend stage will choose and validate the concrete tool.",
    "Use settlementPolicy=required for consequences required by the player action. Use optional only for nice-to-have helper/context steps.",
    "Dependencies must refer only to earlier stepId values.",
    "toolNeed must be either a known state-effect kind or an exact runtime tool name.",
    "If one player action contains multiple backend-owned consequences, create one required step per consequence.",
    "If the player marks, labels, flags, tags, annotates, or otherwise physically changes a visible/current object, create a separate required backend_tool step with toolNeed=entity_tag before any dependent dialogue/procedure step.",
    "Do not fold player-applied physical marks or annotations into record_dialogue_outcome; dialogue records only the responder outcome.",
    "Do not create transfer_item or any item-state step when the player merely keeps, pockets, hides, carries, holds, readies, secures, or stows an item already in playerInventory/current possession; that is narration detail unless ownership, location, or equip state actually changes.",
    "Do not create transfer_item for ordinary small/unmodeled currency, coins, fees, tips, bribes, or prices unless that money exists as a visible/current/inventory item in the SceneFrame. For a paid answer, sold hint, named price, refusal, or bargain with no modeled currency item, use one record_dialogue_outcome step.",
    "Use toolNeed=create_scene_extra when an ordinary temporary current-scene responder must be materialized.",
    "Never use toolNeed=create_scene_extra for actor labels already present in gmRead.actionInterpretation.targetRefs, gmRead.evidenceRefs, or scene.visibleActors. If the player addresses multiple visible actors, record one dialogue outcome from an existing primary speaker and cite the other visible actors as evidence/source refs.",
    "Use toolNeed=record_dialogue_outcome when an NPC/source answer, refusal, warning, redirect, unavailable role, or no-current-answer must be recorded.",
    "Use toolNeed=find_object_candidates only when the needed result is which visible/current/inventory object labels match the player's words.",
    "If the player asks for a mixed current-scene affordance such as a visible person/trader/porter/guard plus signs/objects/points of interest, use list_visible_affordances or separate matching find_actor_candidates/find_object_candidates/find_poi_candidates steps. Never satisfy a visible-person search with only find_object_candidates.",
    "Use toolNeed=start_search when the player checks, reads, searches, or inspects visible/current/inventory objects in order to find a specific unconfirmed detail such as markings, text, contents, serial numbers, registration numbers, addresses, hidden compartments, or proof that current lookup tools cannot return.",
    "A start_search step records that the search target is unconfirmed; it must not assert the searched detail exists or is absent.",
    "Use toolNeed=inspect_known_fact only for player-known facts or canon claims, not for locating visible/current/inventory objects.",
    "Use toolNeed=list_navigation_options when the player asks which routes or movement options are available.",
  ].join(" ");
}

async function runGmActionChecklistV1(input: {
  envelope: GameplayFrameEnvelopeV1;
  read: GmRead;
  oracleResult: OracleResult | null;
  provider: TurnOptions["judgeProvider"];
}): Promise<GmActionChecklistV1 | null> {
  const turnPath = checklistTurnPath(input.read);
  if (!turnPath || turnPath === "oracle_consequence" && !input.oracleResult) {
    return null;
  }
  if (input.read.path === "roll_oracle") {
    return {
      version: GM_ACTION_CHECKLIST_VERSION_V1,
      turnPath,
      steps: [{
        stepId: "oracle-1",
        purpose: "Carry the already-resolved Oracle result into settled narration.",
        evidenceRefs: input.read.rollRequest.evidenceRefs,
        dependsOnStepIds: [],
        expectedVisibleEffect: input.oracleResult?.outcome ?? "Oracle result is available.",
        requiredAction: "oracle_already_resolved",
        settlementPolicy: "optional",
      }],
    };
  }

  const model = createModel(input.provider, { role: "judge" });
  const system = gmActionChecklistSystemPromptV1();
  const { object } = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: mutatingGmActionChecklistV1Schema,
      system,
      prompt: JSON.stringify({
        requiredVersion: GM_ACTION_CHECKLIST_VERSION_V1,
        requiredTurnPath: turnPath,
        requiredStepAction: "backend_tool",
        playerAction: input.envelope.frame.playerAction,
        gmRead: input.read,
        scene: modelSafeSceneSummary(input.envelope.frame),
        allowedRequiredActions: ["backend_tool"],
        exactOutputExample: {
          version: GM_ACTION_CHECKLIST_VERSION_V1,
          turnPath,
          steps: [{
            stepId: "step-1",
            purpose: "One concise backend-owned consequence to resolve now.",
            evidenceRefs: input.read.evidenceRefs.slice(0, 3),
            dependsOnStepIds: [],
            expectedVisibleEffect: "One visible effect after backend validation, not narration.",
            requiredAction: "backend_tool",
            settlementPolicy: "required",
            toolNeed: "movement",
          }],
        },
        reminder: "No executable payloads in checklist. No narration.",
      }, null, 2),
      temperature: 0,
      maxOutputTokens: 1_400,
      retries: 1,
    }),
  );

  const checklist = normalizeChecklistForGmReadV1(object, input.read, input.envelope.frame);

  log.event("gm-action-checklist.v1", {
    turnPath: checklist.turnPath,
    stepCount: checklist.steps.length,
    requiredActions: checklist.steps.map((step) => step.requiredAction),
    toolNeeds: checklist.steps.map((step) => step.toolNeed ?? null),
  });

  return checklist;
}

export function selectAllowedToolNamesForStepV1(
  step: Pick<GmChecklistStepV1, "toolNeed">,
  frame: Pick<SceneFrame, "allowedTools">,
): RuntimeToolName[] {
  const toolNeed = step.toolNeed?.trim();
  if (toolNeed === "inspect_known_fact" && frame.allowedTools.includes("inspect_known_fact")) {
    const lookupTools: RuntimeToolName[] = [
      "inspect_known_fact",
      "find_object_candidates",
      "find_location_candidates",
      "find_actor_candidates",
      "find_poi_candidates",
    ];
    const allowedLookupTools = lookupTools.filter((toolName) => frame.allowedTools.includes(toolName));
    return allowedLookupTools.length > 0 ? allowedLookupTools : ["inspect_known_fact"];
  }
  if (toolNeed && isRuntimeToolName(toolNeed) && frame.allowedTools.includes(toolNeed)) {
    return [toolNeed];
  }
  if (
    toolNeed === "actor_creation"
    || toolNeed === "scene_extra"
    || toolNeed === "temporary_actor"
    || toolNeed === "temporary_responder"
  ) {
    const createExtraTools = frame.allowedTools.filter((toolName) => toolName === "create_scene_extra");
    return createExtraTools.length > 0 ? createExtraTools : [...frame.allowedTools];
  }
  if (
    toolNeed === "dialogue_recording"
    || toolNeed === "dialogue_record"
    || toolNeed === "record_dialogue"
    || toolNeed === "dialogue_outcome_recording"
  ) {
    const dialogueTools = frame.allowedTools.filter((toolName) => toolName === "record_dialogue_outcome");
    return dialogueTools.length > 0 ? dialogueTools : [...frame.allowedTools];
  }
  if (toolNeed === "dialogue_outcome") {
    return frame.allowedTools.filter((toolName) =>
      RUNTIME_TOOL_DESCRIPTORS[toolName]?.terminalKind === "dialogue_outcome",
    );
  }
  if (toolNeed === "world_fact") {
    return frame.allowedTools.filter((toolName) =>
      RUNTIME_TOOL_DESCRIPTORS[toolName]?.terminalKind === "world_fact",
    );
  }
  if (toolNeed === "route_check") {
    const routeTools = frame.allowedTools.filter((toolName) => toolName === "check_route");
    return routeTools.length > 0 ? routeTools : [...frame.allowedTools];
  }
  const isKnownStateEffect = RUNTIME_TOOL_STATE_EFFECT_KINDS.some((effectKind) => effectKind === toolNeed);
  if (!isKnownStateEffect) {
    return [...frame.allowedTools];
  }

  const compatibleTools = frame.allowedTools.filter((toolName) =>
    RUNTIME_TOOL_DESCRIPTORS[toolName]?.stateEffects?.some((effect) =>
      effect.effectKind === toolNeed && effect.ownerKind !== "preparatory",
    ),
  );
  return compatibleTools.length > 0 ? compatibleTools : [...frame.allowedTools];
}

export function normalizeChecklistForGmReadV1(
  checklist: GmActionChecklistV1,
  read: GmRead,
  frame: SceneFrame,
): GmActionChecklistV1 {
  const binding = read.runtimeRequirement?.kind === "dialogue_outcome"
    ? read.runtimeRequirement.speakerBinding
    : null;
  if (binding?.kind === "visible_actor") {
    const invalidResponderStepIds = new Set(checklist.steps
      .filter((step) =>
        step.requiredAction === "backend_tool"
        && selectAllowedToolNamesForStepV1(step, frame).includes("create_scene_extra")
      )
      .map((step) => step.stepId));
    if (invalidResponderStepIds.size > 0) {
      const steps = checklist.steps
        .filter((step) => !invalidResponderStepIds.has(step.stepId))
        .map((step) => ({
          ...step,
          dependsOnStepIds: step.dependsOnStepIds.filter((stepId) => !invalidResponderStepIds.has(stepId)),
        }));
      if (steps.length > 0) {
        return mutatingGmActionChecklistV1Schema.parse({
          ...checklist,
          steps,
        });
      }
    }
  }
  if (binding?.kind !== "prose_role") return checklist;
  if (!frame.allowedTools.includes("create_scene_extra")) return checklist;
  if (checklist.steps.some((step) =>
    step.requiredAction === "backend_tool"
    && selectAllowedToolNamesForStepV1(step, frame).includes("create_scene_extra")
  )) {
    return checklist;
  }
  if (checklist.steps.length >= GM_ACTION_CHECKLIST_MAX_STEPS_V1) return checklist;

  const existingStepIds = new Set(checklist.steps.map((step) => step.stepId));
  let responderStepId = "prose-role-responder";
  let suffix = 1;
  while (existingStepIds.has(responderStepId)) {
    suffix += 1;
    responderStepId = `prose-role-responder-${suffix}`;
  }

  const responderStep: GmChecklistStepV1 = {
    stepId: responderStepId,
    purpose: `Materialize the addressed temporary responder for "${binding.requestedRoleText}".`,
    evidenceRefs: read.evidenceRefs.slice(0, 6),
    dependsOnStepIds: [],
    expectedVisibleEffect: `A current-scene support responder matching "${binding.requestedRoleText}" is available for the dialogue outcome.`,
    requiredAction: "backend_tool",
    settlementPolicy: "required",
    toolNeed: "create_scene_extra",
  };

  const steps = [
    responderStep,
    ...checklist.steps.map((step) => {
      if (
        step.requiredAction !== "backend_tool"
        || !selectAllowedToolNamesForStepV1(step, frame).includes("record_dialogue_outcome")
      ) {
        return step;
      }
      return {
        ...step,
        dependsOnStepIds: Array.from(new Set([responderStepId, ...step.dependsOnStepIds])),
      };
    }),
  ];

  return mutatingGmActionChecklistV1Schema.parse({
    ...checklist,
    steps,
  });
}

export function validateAndNormalizeToolRequestV1(
  request: GmToolRequestV1,
  frame: SceneFrame,
  step: GmChecklistStepV1,
): { input: Record<string, unknown>; failure: string | null } {
  if (request.stepId !== step.stepId) {
    return {
      input: request.input,
      failure: `Tool request stepId=${request.stepId} does not match checklist stepId=${step.stepId}.`,
    };
  }
  if (!frame.allowedTools.includes(request.toolName)) {
    return {
      input: request.input,
      failure: `${request.toolName} is not exposed in this SceneFrame allowedTools.`,
    };
  }
  const allowedForStep = selectAllowedToolNamesForStepV1(step, frame);
  if (!allowedForStep.includes(request.toolName)) {
    return {
      input: request.input,
      failure: `${request.toolName} does not satisfy checklist toolNeed=${step.toolNeed ?? "unspecified"}.`,
    };
  }
  const parsed = runtimeToolInputSchemas[request.toolName].safeParse(request.input);
  if (!parsed.success) {
    return {
      input: request.input,
      failure: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; "),
    };
  }
  return { input: parsed.data as Record<string, unknown>, failure: null };
}

function applyToolRequestContextDefaultsV1(
  toolName: RuntimeToolName,
  input: Record<string, unknown>,
  read: GmRead,
): Record<string, unknown> {
  if (toolName !== "record_dialogue_outcome") return input;
  if (typeof input.requestedRoleText === "string" && input.requestedRoleText.trim()) return input;
  const requestedRoleText = gmReadRequestedRoleTextV1(read);
  if (!requestedRoleText) return input;
  return {
    ...input,
    requestedRoleText,
  };
}

export function attachStateReceiptsToToolStepResultV1(input: {
  toolName: RuntimeToolName;
  toolInput: Record<string, unknown>;
  result: ToolResult;
  previousSettlements: readonly GmToolStepSettlementV1[];
}): ToolResult {
  if (!input.result.success) return input.result;
  return attachStructuralStateReceiptsToToolResult({
    toolName: input.toolName,
    candidateInput: input.toolInput,
    result: input.result,
    prefix: `state_receipt_${input.previousSettlements.length + 1}`,
  });
}

async function proposeToolRequestV1(input: {
  envelope: GameplayFrameEnvelopeV1;
  read: GmRead;
  step: GmChecklistStepV1;
  provider: TurnOptions["judgeProvider"];
  previousSettlements?: readonly GmToolStepSettlementV1[];
  validationFeedback?: string;
}): Promise<GmToolRequestV1> {
  const model = createModel(input.provider, { role: "judge" });
  const allowedToolNames = selectAllowedToolNamesForStepV1(input.step, input.envelope.frame);
  const responseLanguage = responseLanguageForAction(input.envelope.frame.playerAction);
  const { object } = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: toolRequestSchemaForAllowedToolsV1(allowedToolNames),
      system: GM_TOOL_REQUEST_SYSTEM_PROMPT_V1,
      prompt: JSON.stringify({
        requiredVersion: TOOL_REQUEST_VERSION_V1,
        allowedToolNames,
        responseLanguage,
        toolInputLanguageContract: toolInputLanguageContractV1(responseLanguage),
        playerAction: input.envelope.frame.playerAction,
        gmRead: input.read,
        checklistStep: input.step,
        acceptedContext: acceptedStepContextV1(input.previousSettlements ?? []),
        scene: modelSafeSceneSummary(input.envelope.frame),
        toolContracts: allowedToolHints({
          ...input.envelope.frame,
          allowedTools: allowedToolNames,
        }),
        exactOutputExample: toolRequestExampleForStepV1(
          input.step,
          input.read,
          input.envelope.frame,
          allowedToolNames,
        ),
        validationFeedback: input.validationFeedback ?? null,
      }, null, 2),
      temperature: 0,
      maxOutputTokens: 1_200,
      retries: 1,
    }),
  );
  return object;
}

export function bridgeLookupRepairFeedbackV1(
  request: Pick<GmToolRequestV1, "toolName" | "input">,
  result: Pick<ToolResult, "success" | "error" | "contractFailure">,
): string | null {
  if (result.success || result.contractFailure?.retryable || !isBridgeLookupToolName(request.toolName)) {
    return null;
  }
  if (request.toolName !== "inspect_known_fact") return null;

  const error = result.error ?? "";
  if (!error.includes("no_player_visible_or_known_fact")) return null;

  return [
    "inspect_known_fact found no player-visible/player-known fact for this query/ref.",
    "If the player is checking, reading, searching, or inspecting a visible/current/inventory object, use find_object_candidates with exact visible words from scene.targetCandidates or playerInventory.",
    "If the player is asking about a visible actor, location, or point of interest, use the matching find_*_candidates lookup tool.",
    "Keep maxResults between 1 and 8.",
  ].join("\n");
}

async function executeToolStepV1(input: {
  envelope: GameplayFrameEnvelopeV1;
  read: GmRead;
  step: GmChecklistStepV1;
  provider: TurnOptions["judgeProvider"];
  context: ToolExecutionContext;
  previousSettlements: readonly GmToolStepSettlementV1[];
}): Promise<GmToolStepSettlementV1> {
  let request: GmToolRequestV1;
  try {
    request = await proposeToolRequestV1(input);
  } catch (error) {
    return {
      stepId: input.step.stepId,
      purpose: input.step.purpose,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  let validation = validateAndNormalizeToolRequestV1(request, input.envelope.frame, input.step);
  if (validation.failure) {
    try {
      request = await proposeToolRequestV1({
        ...input,
        validationFeedback: validation.failure,
      });
    } catch (error) {
      return {
        stepId: input.step.stepId,
        purpose: input.step.purpose,
        status: "failed",
        toolName: request.toolName,
        input: request.input,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    validation = validateAndNormalizeToolRequestV1(request, input.envelope.frame, input.step);
  }

  if (validation.failure) {
    log.event("gm-tool-request.v1.rejected", {
      stepId: input.step.stepId,
      toolName: request.toolName,
      reason: validation.failure,
    });
    return {
      stepId: input.step.stepId,
      purpose: input.step.purpose,
      status: "failed",
      toolName: request.toolName,
      input: request.input,
      reason: validation.failure,
    };
  }

  const normalizedInput = applyToolRequestContextDefaultsV1(
    request.toolName,
    validation.input,
    input.read,
  );
  const rawResult = isBridgeLookupToolName(request.toolName)
    ? executeBridgeCandidateTool(request.toolName, normalizedInput, input.context)
    : await executeToolCall(
        input.envelope.campaignId,
        request.toolName,
        normalizedInput,
        input.envelope.baseTick,
        undefined,
        input.context,
      );
  const result = attachStateReceiptsToToolStepResultV1({
    toolName: request.toolName,
    toolInput: normalizedInput,
    result: rawResult,
    previousSettlements: input.previousSettlements,
  });
  const retryFeedback = result.contractFailure?.retryable
    ? [
        result.contractFailure.message,
        result.contractFailure.refHints?.length
          ? `Legal refs/hints: ${result.contractFailure.refHints.join(", ")}`
          : null,
      ].filter(Boolean).join("\n")
    : bridgeLookupRepairFeedbackV1(request, result);
  if (!result.success && retryFeedback) {
    let retryRequest: GmToolRequestV1 | null = null;
    try {
      retryRequest = await proposeToolRequestV1({
        ...input,
        validationFeedback: retryFeedback,
      });
    } catch {
      retryRequest = null;
    }
    if (retryRequest) {
      const retryValidation = validateAndNormalizeToolRequestV1(retryRequest, input.envelope.frame, input.step);
      if (!retryValidation.failure) {
        const retryInput = applyToolRequestContextDefaultsV1(
          retryRequest.toolName,
          retryValidation.input,
          input.read,
        );
        const rawRetryResult = isBridgeLookupToolName(retryRequest.toolName)
          ? executeBridgeCandidateTool(retryRequest.toolName, retryInput, input.context)
          : await executeToolCall(
              input.envelope.campaignId,
              retryRequest.toolName,
              retryInput,
              input.envelope.baseTick,
              undefined,
              input.context,
            );
        const retryResult = attachStateReceiptsToToolStepResultV1({
          toolName: retryRequest.toolName,
          toolInput: retryInput,
          result: rawRetryResult,
          previousSettlements: input.previousSettlements,
        });
        if (retryResult.success) {
          applySuccessfulToolObservationToExecutionContext({
            toolName: retryRequest.toolName,
            toolInput: retryInput,
            result: retryResult,
            context: input.context,
          });
        }
        log.event("gm-tool-step.v1.settled", {
          stepId: input.step.stepId,
          toolName: retryRequest.toolName,
          success: retryResult.success,
          error: retryResult.success ? null : retryResult.error ?? "Backend rejected the retry tool request.",
          retried: true,
        });
        return {
          stepId: input.step.stepId,
          purpose: input.step.purpose,
          status: retryResult.success ? "accepted" : "failed",
          toolName: retryRequest.toolName,
          input: retryInput,
          result: retryResult,
          reason: retryResult.success ? undefined : retryResult.error ?? "Backend rejected the retry tool request.",
        };
      }
    }
  }
  if (result.success) {
    applySuccessfulToolObservationToExecutionContext({
      toolName: request.toolName,
      toolInput: normalizedInput,
      result,
      context: input.context,
    });
  }
  log.event("gm-tool-step.v1.settled", {
    stepId: input.step.stepId,
    toolName: request.toolName,
    success: result.success,
    error: result.success ? null : result.error ?? "Backend rejected the tool request.",
  });

  return {
    stepId: input.step.stepId,
    purpose: input.step.purpose,
    status: result.success ? "accepted" : "failed",
    toolName: request.toolName,
    input: normalizedInput,
    result,
    reason: result.success ? undefined : result.error ?? "Backend rejected the tool request.",
  };
}

async function settleChecklistV1(input: {
  envelope: GameplayFrameEnvelopeV1;
  read: GmRead;
  checklist: GmActionChecklistV1 | null;
  provider: TurnOptions["judgeProvider"];
}): Promise<GmToolStepSettlementV1[]> {
  if (!input.checklist) return [];

  const settlements: GmToolStepSettlementV1[] = [];
  const context = createPlayerTurnToolExecutionContext({
    frame: input.envelope.frame,
    addressedTarget: addressedTargetFromGmReadV1(input.read),
  });
  let executions = 0;
  while (executions < GM_TOOL_LOOP_MAX_EXECUTIONS_V1) {
    settleNonBackendStepsV1(input.checklist, settlements);
    const step = nextExecutableChecklistStepV1(input.checklist, settlements);
    if (!step) break;
    const settlement = await executeToolStepV1({
      envelope: input.envelope,
      read: input.read,
      step,
      provider: input.provider,
      context,
      previousSettlements: settlements,
    });
    settlements.push(settlement);
    executions += 1;
    if (stepSettlementPolicyV1(step) === "required" && settlement.status !== "accepted") {
      throw new Error(
        `Required backend tool step ${step.stepId} failed before settled packet persistence: ${settlement.reason ?? "Backend tool step failed."}`,
      );
    }
  }

  markRemainingBackendStepsV1(
    input.checklist,
    settlements,
    executions >= GM_TOOL_LOOP_MAX_EXECUTIONS_V1
      ? `Stage 4 execution budget exhausted after ${GM_TOOL_LOOP_MAX_EXECUTIONS_V1} steps.`
      : "Checklist dependencies were not accepted.",
  );
  assertRequiredToolStepsAcceptedV1({
    checklist: input.checklist,
    stepSettlements: settlements,
  });
  return settlements;
}

function stepSettlementPolicyV1(step: GmChecklistStepV1): "required" | "optional" {
  if (step.requiredAction !== "backend_tool") return "optional";
  return step.settlementPolicy ?? "required";
}

function settledStepIdsV1(settlements: readonly GmToolStepSettlementV1[]): Set<string> {
  return new Set(settlements.map((settlement) => settlement.stepId));
}

function acceptedStepIdsV1(settlements: readonly GmToolStepSettlementV1[]): Set<string> {
  return new Set(settlements
    .filter((settlement) => settlement.status === "accepted")
    .map((settlement) => settlement.stepId));
}

export function nextExecutableChecklistStepV1(
  checklist: GmActionChecklistV1,
  settlements: readonly GmToolStepSettlementV1[],
): GmChecklistStepV1 | null {
  const settled = settledStepIdsV1(settlements);
  const accepted = acceptedStepIdsV1(settlements);
  return checklist.steps.find((step) =>
    step.requiredAction === "backend_tool"
    && !settled.has(step.stepId)
    && step.dependsOnStepIds.every((dependency) => accepted.has(dependency)),
  ) ?? null;
}

function settleNonBackendStepsV1(
  checklist: GmActionChecklistV1,
  settlements: GmToolStepSettlementV1[],
): void {
  const settled = settledStepIdsV1(settlements);
  for (const step of checklist.steps) {
    if (settled.has(step.stepId) || step.requiredAction === "backend_tool") continue;
    settlements.push({
      stepId: step.stepId,
      purpose: step.purpose,
      status: step.requiredAction === "skip" ? "skipped" : "accepted",
      reason: step.requiredAction === "skip" ? step.expectedVisibleEffect : undefined,
    });
  }
}

function markRemainingBackendStepsV1(
  checklist: GmActionChecklistV1,
  settlements: GmToolStepSettlementV1[],
  reason: string,
): void {
  const settled = settledStepIdsV1(settlements);
  for (const step of checklist.steps) {
    if (step.requiredAction !== "backend_tool" || settled.has(step.stepId)) continue;
    settlements.push({
      stepId: step.stepId,
      purpose: step.purpose,
      status: stepSettlementPolicyV1(step) === "required" ? "failed" : "skipped",
      reason,
    });
  }
}

export function assertRequiredToolStepsAcceptedV1(input: {
  checklist: GmActionChecklistV1 | null;
  stepSettlements: readonly GmToolStepSettlementV1[];
}): void {
  const requiredSteps = input.checklist?.steps
    .filter((step) => step.requiredAction === "backend_tool") ?? [];
  for (const step of requiredSteps) {
    const settlement = input.stepSettlements.find((candidate) =>
      candidate.stepId === step.stepId,
    );
    if (settlement?.status === "accepted" && settlement.result?.success === true) {
      continue;
    }
    const reason = settlement?.reason ?? "Required backend tool step did not produce an accepted receipt.";
    throw new Error(`Required backend tool step ${step.stepId} failed before settled packet persistence: ${reason}`);
  }
}

export async function* processGameplayTurnCycleV1(
  options: TurnOptions,
): AsyncGenerator<TurnEvent> {
  const turnId = randomUUID();
  yield { type: "scene-settling", data: { stage: "frame", phase: "start" } };
  const envelope = await buildGameplayFrameEnvelopeV1(options, turnId);
  yield {
    type: "scene-settling",
    data: { stage: "frame", phase: "ready", tick: envelope.baseTick },
  };

  yield { type: "scene-settling", data: { stage: "gm-read", phase: "start", tick: envelope.baseTick } };
  const gmRead = await runGmRead({
    provider: options.judgeProvider,
    playerAction: options.playerAction,
    frame: envelope.frame,
    scopedForecastExcerpt: envelope.scopedForecastExcerpt,
    recentConversation: recentConversation(options.campaignId),
    maxOutputTokens: 1_600,
    noMutationAdmissibilityMode: "stage1_contract",
  });
  assertNoExecutableGmReadPayloadV1(gmRead);
  yield { type: "turn_resolution", data: { kind: gmRead.path } };

  let oracleResult: OracleResult | null = null;
  if (gmRead.path === "roll_oracle") {
    yield { type: "scene-settling", data: { stage: "oracle", phase: "start", tick: envelope.baseTick } };
    oracleResult = await callOracle(buildOraclePayloadV1(envelope, gmRead), options.judgeProvider);
    yield { type: "oracle_result", data: oracleResult };
  }

  const checklist = await runGmActionChecklistV1({
    envelope,
    read: gmRead,
    oracleResult,
    provider: options.judgeProvider,
  });
  const stepSettlements = await settleChecklistV1({
    envelope,
    read: gmRead,
    checklist,
    provider: options.judgeProvider,
  });
  assertRequiredToolStepsAcceptedV1({ checklist, stepSettlements });

  const acceptedToolResults = acceptedToolResultsFromSettlementsV1(stepSettlements);
  yield { type: "scene-settling", data: { stage: "local-consequences", phase: "start", tick: envelope.baseTick } };
  const localConsequenceResult = await runLocalConsequencePassV1({
    options,
    envelope,
    read: gmRead,
    acceptedToolResults,
  });
  yield {
    type: "scene-settling",
    data: {
      stage: "local-consequences",
      phase: "settled",
      tick: envelope.baseTick,
      route: localConsequenceResult.route,
      actorSettlementCount: localConsequenceResult.actorSettlements.length,
    },
  };

  const resultClock = readWorldClock(options.campaignId);
  const packet = buildSettledTurnPacketV1({
    envelope,
    read: gmRead,
    oracleResult,
    resultWorldVersion: resultClock.worldVersion,
    checklist,
    stepSettlements,
    localConsequenceResult,
  });

  yield { type: "scene-settling", data: { stage: "settled-packet", phase: "persisting", tick: envelope.baseTick } };
  persistSettledTurnPacketV1({ packet });
  const durablePacket = readSettledTurnPacketV1({
    campaignId: packet.campaignId,
    packetId: packet.packetId,
  });
  if (!durablePacket) {
    throw new Error(`SettledTurnPacketV1 ${packet.packetId} failed durable readback.`);
  }
  yield {
    type: "scene-settling",
    data: {
      stage: "settled-packet",
      phase: "persisted",
      tick: envelope.baseTick,
      packetId: durablePacket.packetId,
    },
  };

  const hiddenSummary: HiddenTurnSummary = {
    currentTick: envelope.baseTick,
    predictedTick: envelope.baseTick + 1,
    currentLocationId: envelope.frame.currentLocationId,
    currentSceneScopeId: envelope.frame.currentSceneScopeId,
    oracleResult,
    toolCalls: [],
    openingScene: false,
  };

  const narratorAttempt = recordNarrationAttemptStartedV1({
    campaignId: durablePacket.campaignId,
    packetId: durablePacket.packetId,
  });
  let narrativeText: string;
  try {
    await options.onBeforeVisibleNarration?.(hiddenSummary);
    narrativeText = await narrateSettledTurnPacketV1(durablePacket, options);
    recordNarrationAttemptSucceededV1({
      attemptId: narratorAttempt.attemptId,
      finalText: narrativeText,
      groundingResult: { source: "settled-turn-packet.v1" },
    });
  } catch (error) {
    recordNarrationAttemptFailedV1({
      attemptId: narratorAttempt.attemptId,
      reason: error instanceof Error ? error.message : String(error),
    });
    yield {
      type: "error",
      data: {
        error: "Visible narration failed after accepted truth was persisted.",
        pendingNarration: true,
        packetId: durablePacket.packetId,
        turnId: durablePacket.turnId,
        retryable: true,
      },
    };
    return;
  }

  appendChatMessages(options.campaignId, [
    { role: "user", content: options.playerAction },
    { role: "assistant", content: narrativeText },
  ]);

  const nextTick = advanceCampaignTick(options.campaignId, 1);
  const syncedClock = syncWorldClockTurnBoundary({
    campaignId: options.campaignId,
    currentTick: nextTick,
  });

  yield { type: "narrative", data: { text: narrativeText } };

  const summary: TurnSummary = {
    turnId,
    tick: nextTick,
    oracleResult,
    toolCalls: [],
    acceptedDurableEventIds: durablePacket.acceptedDurableEventIds,
    producedDurableEventIds: durablePacket.producedDurableEventIds,
    narrativeText,
  };
  await options.onPostTurn?.(summary);
  markSettledTurnProjectedV1({
    campaignId: durablePacket.campaignId,
    packetId: durablePacket.packetId,
    narratorAttemptId: narratorAttempt.attemptId,
  });

  yield {
    type: "done",
    data: {
      tick: nextTick,
      worldVersion: syncedClock.worldVersion,
      worldTimeMinutes: syncedClock.worldTimeMinutes,
      opening: false,
      turnId,
    },
  };
}
