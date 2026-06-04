import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  appendChatMessages,
  advanceCampaignTick,
  getChatHistory,
  readCampaignConfig,
} from "../../campaign/index.js";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import { generateText } from "../../ai/raindrop-workshop.js";
import { buildSceneFrame, type SceneFrame } from "../scene-frame.js";
import {
  readWorldClock,
  syncWorldClockTurnBoundary,
} from "../living-world-authority.js";
import { callOracle, type OracleResult } from "../oracle.js";
import {
  buildScopedForecastExcerpt,
  loadWorldTrajectoryForecast,
} from "../world-forecast.js";
import type {
  HiddenTurnSummary,
  TurnEvent,
  TurnOptions,
} from "../turn-processor.js";
import { buildApiResponseProjectionV2 } from "./api-response.js";
import {
  assertSceneFrameEnvelopeV2,
  assertTurnAttemptContextV2,
  assertTurnStartEnvelopeV2,
  gameplayToolRequestV2Schema,
  gmActionChecklistV2Schema,
  gmReadCandidateV2LooseSchema,
  type ApiResponseProjectionV2,
  type GameplayRuntimeReceiptLedgerV2,
  type GmActionChecklistStepV2,
  type GmActionChecklistV2,
  type GmReadChecklistV2,
  type LocalConsequenceScheduleEntryV2,
  type LocalConsequenceScheduleV2,
  type ModelFacingTurnPacketV2,
  type NarratorViewV2,
  type RuntimeCapabilityIdV2,
  type SceneFrameEnvelopeV2,
  type SettledTurnPacketV2,
  type TurnAttemptContextV2,
} from "./contracts.js";
import {
  buildModelFacingTurnPacketV2,
  formatModelFacingTurnPacketForPromptV2,
} from "./projection.js";
import { validateGmReadV2 } from "./gm-read.js";
import {
  compileSimpleGmActionChecklistV2,
  validateGmActionChecklistV2,
} from "./action-checklist.js";
import { capabilityForEffectKindV2 } from "./capability-catalog.js";
import { composeGameplayCycleMutatingTurnV2 } from "./mutating-composer.js";
import { createDbBackedGameplayToolHandlersV2 } from "./db-handlers.js";
import {
  admitExplicitMovementV2,
  completeGmReadWithExplicitMovementAdmissionV2,
  type ExplicitMovementAdmissionV2,
} from "./explicit-movement-admission.js";
import { buildGameplayRefRegistryV2 } from "./ref-registry.js";
import {
  buildOraclePayloadV2,
  buildOracleSettlementV2,
} from "./oracle-settlement.js";
import {
  buildNarratorViewV2,
  buildNoReceiptSettledTurnPacketV2,
  buildOracleSettledTurnPacketV2,
  buildSettledPacketPersistencePendingV2,
} from "./settled-packet.js";
import {
  finalizeGameplayCycleV2Packet,
  markGameplayCycleV2PacketNarratorFailedPendingRetry,
  markGameplayCycleV2PacketNarratorRendering,
  persistSettledTurnPacketV2,
  readGameplayCycleV2Packet,
} from "./packet-store.js";

const LIVE_GAMEPLAY_CAPABILITIES: RuntimeCapabilityIdV2[] = [
  "observe_visible",
  "oracle_roll",
  "route_options",
  "route_check",
  "movement",
  "dialogue_record",
  "support_actor_create",
  "entity_tag",
  "scene_beat_record",
];

export class GameplayCycleV2PendingNarrationError extends Error {
  readonly packetId: string;
  readonly campaignId: string;
  readonly turnId: string;

  constructor(input: {
    packetId: string;
    campaignId: string;
    turnId: string;
    cause: unknown;
  }) {
    const causeMessage = input.cause instanceof Error
      ? input.cause.message
      : String(input.cause);
    super(`gameplay-cycle-v2 narration pending retry for packet ${input.packetId}: ${causeMessage}`);
    this.name = "GameplayCycleV2PendingNarrationError";
    this.packetId = input.packetId;
    this.campaignId = input.campaignId;
    this.turnId = input.turnId;
    this.cause = input.cause;
  }
}

function providerSummary(provider: ProviderConfig) {
  return {
    id: provider.id,
    model: provider.model,
    baseUrl: provider.baseUrl,
  };
}

function publicRuntimeId(prefix: "v2turn" | "v2packet" | "v2oracle"): string {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().replace(/-/gu, "").slice(0, 12)}`;
}

function normalizePreTurnSnapshot(
  snapshot: TurnOptions["preTurnSnapshot"],
): { bundleDir: string; capturedAt: number } {
  return {
    bundleDir: snapshot?.bundleDir ?? "unavailable-pre-turn-snapshot",
    capturedAt: snapshot?.capturedAt ?? Date.now(),
  };
}

function visibleRefsFromFrame(frame: SceneFrame): string[] {
  return uniqueStrings([
    frame.currentLocationName,
    frame.currentSceneScopeName,
    "Player",
    ...frame.roster.active
      .filter((actor) => actor.awareness === "clear")
      .map((actor) => actor.label),
    ...frame.roster.support
      .filter((actor) => actor.awareness === "clear")
      .map((actor) => actor.label),
    ...frame.roster.background
      .filter((actor) => actor.awareness === "clear")
      .map((actor) => actor.label),
    ...frame.movementCandidates.map((candidate) => candidate.label),
    ...frame.targetCandidates.map((candidate) => candidate.label),
    ...(frame.playerInventory ?? []).map((item) => item.label),
  ]);
}

function forecastLocalRefs(frame: SceneFrame): string[] {
  return uniqueStrings([
    frame.currentLocationName,
    frame.currentSceneScopeName,
    ...frame.roster.active.map((actor) => actor.label),
    ...frame.roster.support.map((actor) => actor.label),
  ]);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function currentBaseTick(campaignId: string): number {
  const campaignTick = readCampaignConfig(campaignId).currentTick ?? 0;
  const clock = syncWorldClockTurnBoundary({
    campaignId,
    currentTick: campaignTick,
  });
  return Math.max(campaignTick, clock.currentTick, clock.worldTimeMinutes);
}

function currentFrameTick(campaignId: string): number {
  const campaignTick = readCampaignConfig(campaignId).currentTick ?? 0;
  const clock = readWorldClock(campaignId);
  return Math.max(campaignTick, clock.currentTick, clock.worldTimeMinutes);
}

interface LiveSceneFrameContextV2 {
  frame: SceneFrame;
  envelope: SceneFrameEnvelopeV2;
  packet: ModelFacingTurnPacketV2;
  refRegistry: ReturnType<typeof buildGameplayRefRegistryV2>;
}

function attemptAtWorldVersion(input: {
  attempt: TurnAttemptContextV2;
  baseTick?: number;
  worldVersion: number;
}): TurnAttemptContextV2 {
  return assertTurnAttemptContextV2({
    ...input.attempt,
    baseTick: input.baseTick ?? input.attempt.baseTick,
    baseWorldVersion: input.worldVersion,
  });
}

async function buildLiveSceneFrameContextV2(input: {
  campaignId: string;
  playerAction: string;
  attempt: TurnAttemptContextV2;
  forecast: ReturnType<typeof loadWorldTrajectoryForecast>;
}): Promise<LiveSceneFrameContextV2> {
  const frame = await buildSceneFrame({
    campaignId: input.campaignId,
    tick: input.attempt.baseTick,
    playerAction: input.playerAction,
    runActorExposureCatchup: false,
    allowedTools: [],
    toolExposureMode: "internal",
  });
  const envelope = assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: input.attempt,
    frame,
    scopedForecastExcerpt: buildScopedForecastExcerpt({
      forecast: input.forecast,
      localRefs: forecastLocalRefs(frame),
    }),
    refs: {
      visibleRefs: visibleRefsFromFrame(frame),
      privateGuardTerms: frame.perception.forbiddenActorLabels ?? [],
      allowedCapabilityIds: LIVE_GAMEPLAY_CAPABILITIES,
    },
  });
  return {
    frame,
    envelope,
    packet: buildModelFacingTurnPacketV2(envelope),
    refRegistry: buildGameplayRefRegistryV2({
      turnId: input.attempt.turnId,
      frame,
    }),
  };
}

function buildGmReadSystemPrompt(): string {
  return [
    "You are the WorldForge GM Read layer.",
    "Return only the interpretation object for gameplay-cycle-v2.",
    "This slice accepts direct, continue, clarification, roll_oracle, or tool_plan.",
    "Use roll_oracle only when the player action contains true uncertainty/risk that cannot be settled from the current SceneFrame alone.",
    "Immediate uncertainty about whether a visible actor notices, resists, is distracted by, or reacts to the player's current risky attempt is eligible for roll_oracle.",
    "Do not use roll_oracle to reveal hidden memories, private intentions, secret knowledge, offscreen facts, or facts about actors who are not visible/cited.",
    "Use tool_plan when the turn needs an accepted backend action checklist for route checks, movement, visible dialogue outcomes, temporary current-scene support actor creation, concrete entity tag changes, or a scene-local beat receipt.",
    "For tool_plan, include checklistRequest with turnPath, requiredEffectKinds, actorRefs, targetRefs, evidenceRefs, and checklistGoal.",
    "For explicit travel to a connected visible destination, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"movement\"].",
    "For route availability checks without travel, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=procedural, and checklistRequest.requiredEffectKinds=[\"route_check\"].",
    "For a visible speaker's answer, refusal, warning, redirect, silence, or other concrete dialogue outcome, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=procedural, and checklistRequest.requiredEffectKinds=[\"dialogue_outcome\"].",
    "For dialogue_outcome, checklistRequest.actorRefs must name the visible speaker who owns the response; targetRefs may include the player or addressed visible actors; evidenceRefs must include the visible speaker and scene refs.",
    "For creating an ordinary temporary local service/witness/helper/vendor/guard/attendant/crowd support actor in the current scene, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"support_actor_create\"].",
    "For support_actor_create, checklistRequest.actorRefs must include Player, targetRefs must include the current scene ref, and evidenceRefs must include Player plus current scene/location refs. This capability creates only temporary current-scene reactive support NPCs.",
    "For a concrete mark, label, status tag, annotation, stamp, flag, or tag applied to or removed from a visible/current/inventory entity, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"entity_tag\"].",
    "For entity_tag, checklistRequest.targetRefs must include exactly the visible/current/inventory entity being changed, and evidenceRefs must include Player plus that entity and the current scene/location refs.",
    "For local posture/scene beat without structural state change, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=procedural, and checklistRequest.requiredEffectKinds=[\"scene_beat\"].",
    "Valid checklistRequest.turnPath values are only: mutating, procedural, combat. Never use movement, route_check, or scene_beat as turnPath values.",
    "For this live slice, checklistRequest.requiredEffectKinds may use only route_check, movement, dialogue_outcome, support_actor_create, entity_tag, or scene_beat.",
    "dialogue_outcome is terminal and non-mutating in this slice: it records the visible response for narration only and does not create NPC memory, world facts, item state, relationship state, or durable social state.",
    "support_actor_create is a structural mutation in this slice: it can create one temporary current-scene reactive support NPC only. It must not create key/persistent actors, hidden identity, memories, faction state, schedules, relationships, inventory, world facts, dialogue content, or actor lifecycle state.",
    "entity_tag is a structural mutation in this slice: it can only add or remove one tag on one resolved player_actor, visible_actor, current_location, current_scene, visible_item, visible_location, or inventory_item.",
    "Do not narrate. Do not mutate state. Do not include tool names, tool inputs, executable payloads, combat transitions, or future checklist steps.",
    "Cite only citableRefs from the model-facing packet.",
    "For direct/continue, omit clarificationPrompt entirely. For clarification, include a non-empty clarificationPrompt. Never emit empty strings or null for optional fields.",
    "For roll_oracle, include oracleRequest with question, stakes, outcomeMeanings for strong_hit/weak_hit/miss, uncertaintyKind, actorRef, targetRefs, and evidenceRefs.",
    "For roll_oracle, turnNeed must be exactly oracle_uncertainty. Do not include noMutationReason or clarificationPrompt on roll_oracle.",
    "For roll_oracle, uncertaintyKind must be one of: physical_risk, perception, social_pressure, opposition, chance.",
    "The three outcomeMeanings must define what each tier means before the roll; narrator will use the selected meaning as settled truth.",
    "Oracle settles uncertainty only; it is not a movement, discovery, item-state, NPC-knowledge, or world-mutation receipt.",
    "If the player action needs unimplemented mutation, combat, hidden knowledge, durable dialogue memory, or a backend capability outside route_check/movement/dialogue_outcome/support_actor_create/entity_tag/scene_beat, choose clarification.",
  ].join("\n");
}

function buildGmReadPrompt(
  packet: ModelFacingTurnPacketV2,
  explicitMovementAdmission: ExplicitMovementAdmissionV2,
): string {
  return JSON.stringify({
    task: "Interpret this player turn. Select no-mutation, Oracle uncertainty, or backend checklist admission.",
    packet: formatModelFacingTurnPacketForPromptV2(packet),
    backendAdmissibleExactMovement: explicitMovementAdmission.status === "admitted"
      ? {
        destinationRef: explicitMovementAdmission.destinationRef,
        checklistRequest: explicitMovementAdmission.checklistRequest,
        rule: "Use this only when your GM Read interpretation is actual travel/movement. For route checks without travel, use route_check instead.",
      }
      : null,
  }, null, 2);
}

function buildChecklistSystemPrompt(): string {
  return [
    "You are the WorldForge GM Action Checklist layer for gameplay-cycle-v2.",
    "Return only gm-action-checklist.v2 JSON.",
    "The checklist is intent-only. Do not include tool ids, tool inputs, executable payloads, state deltas, receipts, results, or narration.",
    "Use only refs from the current model-facing packet citableRefs and from the accepted GM Read checklistRequest.",
    "Use only the allowedEffectKinds supplied in the prompt. Do not add route checks, movement, or scene beats unless that exact effect kind is listed.",
    "Each step must have exactly one intended state/evidence effect and the matching requiredCapabilityId.",
    "Use step-1, step-2, ... in dependency order. Dependencies may only refer to earlier steps.",
    "Checklist intent is not settled truth; backend receipts decide truth.",
  ].join("\n");
}

function buildChecklistPrompt(input: {
  packet: ModelFacingTurnPacketV2;
  gmRead: GmReadChecklistV2;
}): string {
  return JSON.stringify({
    task: "Produce an intent-only backend-owned action checklist for the accepted GM Read.",
    packet: formatModelFacingTurnPacketForPromptV2(input.packet),
    acceptedGmRead: input.gmRead,
    allowedEffectKinds: input.gmRead.checklistRequest.requiredEffectKinds,
    allowedCapabilityIds: input.gmRead.checklistRequest.requiredEffectKinds
      .map((effectKind) => capabilityForEffectKindV2(effectKind)),
  }, null, 2);
}

function actionChecklistGenerationSchemaFor(gmRead: GmReadChecklistV2) {
  const requestedKinds = new Set(gmRead.checklistRequest.requiredEffectKinds);
  const requestedCapabilities = new Set(
    gmRead.checklistRequest.requiredEffectKinds.map((effectKind) =>
      capabilityForEffectKindV2(effectKind)),
  );
  return gmActionChecklistV2Schema.superRefine((checklist, ctx) => {
    checklist.steps.forEach((step, index) => {
      if (!requestedKinds.has(step.intendedEffect.kind)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "intendedEffect", "kind"],
          message: `Only these intendedEffect.kind values are allowed for this GM Read: ${
            [...requestedKinds].join(", ")
          }.`,
        });
      }
      if (!requestedCapabilities.has(step.requiredCapabilityId)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "requiredCapabilityId"],
          message: `Only these requiredCapabilityId values are allowed for this GM Read: ${
            [...requestedCapabilities].join(", ")
          }.`,
        });
      }
    });
  }) satisfies z.ZodType<unknown>;
}

function buildToolRequestSystemPrompt(): string {
  return [
    "You are the WorldForge gameplay-tool-request.v2 planner.",
    "Return exactly one gameplay-tool-request.v2 JSON object for the selected checklist step.",
    "Use the current model-facing packet only; if this step follows a mutation, the packet already reflects that mutation.",
    "Use only clean v2 tool ids: route.check.v2, actor.move.v2, dialogue.record.v2, support_actor.create.v2, entity.tag.v2, or scene_beat.record.v2.",
    "For dialogue.record.v2, bind speakerRef to the selected visible speaker, addresseeRefs to Player or visible addressees when cited by the step, outcomeKind to answer/refusal/warning/redirect/silence/other, summary to only the concrete visible response, and quotedSpeech to the speaker's actual visible utterance unless outcomeKind is silence.",
    "For non-silence dialogue.record.v2 outcomes, quotedSpeech is required. For silence, omit quotedSpeech.",
    "dialogue.record.v2 is terminal and non-mutating in this slice; do not include durable memory, world fact, relationship, item, location, or hidden-knowledge claims.",
    "For support_actor.create.v2, bind anchorScope to current_scene, anchorRef to the current scene ref, roleKind to one allowed ordinary public support role, roleLabel to a short public role label, optional displayName to the visible actor label, persona.publicSummary to only visible/playable public behavior, optional visibleCue/voiceHint to short public cues, tags to lowercase canonical support tags, identityBounds exactly to temporary/current_scene/minor_support/reactive_only/mayBecomePersistentHere=false, reason to why this ordinary support actor is needed now in the current scene, and evidenceRefs to cited scene/player refs.",
    'The exact required support_actor.create.v2 effectBinding shape is: { "anchorScope": "current_scene", "anchorRef": "<current scene ref>", "roleKind": "attendant|bystander|clerk|courier|crowd_voice|dockhand|guard|guide|helper|laborer|porter|vendor|witness", "roleLabel": "<short visible public role>", "displayName"?: "<visible label>", "persona": { "publicSummary": "<required visible public behavior>", "visibleCue"?: "<short visible cue>", "voiceHint"?: "<short public voice cue>" }, "tags": ["lowercase-tag"], "identityBounds": { "tier": "temporary", "persistence": "current_scene", "significance": "minor_support", "agency": "reactive_only", "mayBecomePersistentHere": false }, "reason": "<required why-now reason>", "evidenceRefs": ["<cited refs>"] }.',
    "support_actor.create.v2 is a mutation receipt for temporary current-scene support NPC creation only. Never use it for persistent/key actors, hidden identities, private knowledge, memories, factions, relationships, inventory, schedules, world facts, dialogue content, movement, or lifecycle state.",
    "For entity.tag.v2, bind entityScope to one of player_actor, visible_actor, current_location, current_scene, visible_item, visible_location, or inventory_item; bind entityRef to the single selected checklist target; operation to add/remove; tag to the exact short tag to apply or remove; evidenceRefs to cited scene/entity refs.",
    "entity.tag.v2 is the only allowed tag mutation surface. Never use legacy tag tool names, entityName/entityType, or legacy input payloads.",
    "Do not include old runtime tool names, root input/payload fields, state deltas, receipts, results, narration, or backend ids.",
    "Every effectBinding ref must be cited by the selected checklist step and by the current packet citableRefs.",
    "The backend validates and executes the request; you only propose the candidate.",
  ].join("\n");
}

function buildToolRequestPrompt(input: {
  packet: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  step: GmActionChecklistStepV2;
}): string {
  return JSON.stringify({
    task: "Produce exactly one selected-step gameplay-tool-request.v2 candidate.",
    packet: formatModelFacingTurnPacketForPromptV2(input.packet),
    checklist: input.checklist,
    selectedStep: input.step,
  }, null, 2);
}

function localConsequenceStepId(index: number): `step-${number}` {
  return `step-${index + 1}` as `step-${number}`;
}

function buildLocalConsequenceSystemPrompt(): string {
  return [
    "You are the WorldForge local consequence request layer for gameplay-cycle-v2.",
    "Return one local-consequence-tool-request-candidate.v2 JSON object.",
    "The nested request must be scene_beat.record.v2 for the selected local consequence.",
    "scene_beat.record.v2 is terminal and non-mutating in this slice; do not write durable events or claim structural state changes.",
    "Use only refs from the current model-facing packet and the local consequence evidenceRefs.",
    "Do not narrate, do not include legacy tool names, and do not include backend ids.",
  ].join("\n");
}

function buildLocalConsequencePrompt(input: {
  latestPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  schedule: LocalConsequenceScheduleV2;
  consequence: LocalConsequenceScheduleEntryV2;
  consequenceIndex: number;
}): string {
  return JSON.stringify({
    task: "Produce one required local consequence scene-beat request candidate.",
    packet: formatModelFacingTurnPacketForPromptV2(input.latestPacket),
    acceptedReceiptLedger: input.ledger,
    schedule: input.schedule,
    selectedConsequence: input.consequence,
    requiredNestedRequest: {
      version: "gameplay-tool-request.v2",
      stepId: localConsequenceStepId(input.consequenceIndex),
      capabilityId: "scene_beat_record",
      toolId: "scene_beat.record.v2",
      effectBinding: {
        actorRef: input.consequence.actorRef,
        evidenceRefs: input.consequence.evidenceRefs,
      },
    },
  }, null, 2);
}

function runtimeContractError(message: string): Error {
  return new Error(`gameplay-cycle-v2 pre-settlement contract failed: ${message}`);
}

async function generateActionChecklistCandidateV2(input: {
  options: TurnOptions;
  packet: ModelFacingTurnPacketV2;
  gmRead: GmReadChecklistV2;
}): Promise<GmActionChecklistV2> {
  const compiledChecklist = compileSimpleGmActionChecklistV2({
    packet: input.packet,
    gmRead: input.gmRead,
  });
  if (compiledChecklist) {
    if (compiledChecklist.status !== "accepted") {
      throw runtimeContractError(
        `Backend-compiled GM action checklist rejected: ${
          compiledChecklist.issues.map((issue) => issue.message).join("; ")
        }`,
      );
    }
    return compiledChecklist.checklist;
  }

  const rawChecklist = (await safeGenerateObject({
    model: createModel(input.options.judgeProvider, { role: "judge" }),
    schema: actionChecklistGenerationSchemaFor(input.gmRead),
    system: buildChecklistSystemPrompt(),
    prompt: buildChecklistPrompt({
      packet: input.packet,
      gmRead: input.gmRead,
    }),
    temperature: 0.1,
    maxTokens: 2_000,
    retries: 1,
    strictSchema: false,
  })).object;
  const validation = validateGmActionChecklistV2({
    packet: input.packet,
    gmRead: input.gmRead,
    candidate: rawChecklist,
  });
  if (validation.status !== "accepted") {
    throw runtimeContractError(
      `GM action checklist rejected: ${validation.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return validation.checklist;
}

async function generateToolRequestCandidateV2(input: {
  options: TurnOptions;
  packet: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  step: GmActionChecklistStepV2;
}): Promise<unknown> {
  return (await safeGenerateObject({
    model: createModel(input.options.judgeProvider, { role: "judge" }),
    schema: gameplayToolRequestV2Schema,
    system: buildToolRequestSystemPrompt(),
    prompt: buildToolRequestPrompt({
      packet: input.packet,
      checklist: input.checklist,
      step: input.step,
    }),
    temperature: 0.1,
    maxTokens: 1_400,
    retries: 1,
    strictSchema: false,
  })).object;
}

async function generateLocalConsequenceCandidateV2(input: {
  options: TurnOptions;
  latestPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  schedule: LocalConsequenceScheduleV2;
  consequence: LocalConsequenceScheduleEntryV2;
  consequenceIndex: number;
}): Promise<unknown> {
  return {
    version: "local-consequence-tool-request-candidate.v2",
    candidateId: `candidate-${input.consequence.consequenceId}`,
    consequenceId: input.consequence.consequenceId,
    triggerReceiptId: input.consequence.triggerReceiptId,
    request: {
      version: "gameplay-tool-request.v2",
      requestId: `request-${input.consequence.consequenceId}`,
      stepId: localConsequenceStepId(input.consequenceIndex),
      capabilityId: "scene_beat_record",
      toolId: "scene_beat.record.v2",
      effectBinding: {
        actorRef: input.consequence.actorRef,
        summary: input.consequence.reason,
        evidenceRefs: input.consequence.evidenceRefs,
      },
    },
    rationale: "Backend schedule owns this required local scene beat after an accepted mutation.",
  };
}

function buildNarratorSystemPrompt(): string {
  return [
    "You are the WorldForge player-facing narrator.",
    "Write only from the provided narrator-view.v2 acceptedEvidence.",
    "Follow narratorView.languageContract: write ordinary prose in the same language as narratorView.playerAction, while preserving accepted labels and proper nouns verbatim.",
    "If accepted evidence includes an oracle_outcome, narrate the selected meaning exactly as the settled uncertainty outcome; do not invert it or turn it into movement, discovery, item state, NPC knowledge, or durable world change.",
    "Do not infer absence, discovery, movement, item state, NPC knowledge, hidden facts, consequences, or world changes beyond accepted evidence.",
    "Do not call tools. Do not use failed or skipped steps as truth.",
    "If the accepted evidence asks for clarification, ask that clarification directly and do not add new scene facts.",
  ].join("\n");
}

function buildNarratorPrompt(view: NarratorViewV2): string {
  return JSON.stringify({
    task: "Render a concise player-facing response from settled truth only.",
    narratorView: view,
  }, null, 2);
}

function assertNarrativeText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("gameplay-cycle-v2 narrator returned empty player-facing text.");
  }
  return trimmed;
}

function buildHiddenSummary(input: {
  currentTick: number;
  predictedTick: number;
  frame: SceneFrame;
  oracleResult: OracleResult | null;
}): HiddenTurnSummary {
  return {
    currentTick: input.currentTick,
    predictedTick: input.predictedTick,
    currentLocationId: input.frame.currentLocationId,
    currentSceneScopeId: input.frame.currentSceneScopeId,
    oracleResult: input.oracleResult,
    toolCalls: [],
    openingScene: false,
  };
}

function buildApiProjectionInput(input: {
  packet: SettledTurnPacketV2;
  narrativeText: string;
  tick: number;
}): ApiResponseProjectionV2 {
  const clock = readWorldClock(input.packet.campaignId);
  return buildApiResponseProjectionV2({
    packet: input.packet,
    narrativeText: input.narrativeText,
    tick: input.tick,
    worldVersion: clock.worldVersion,
    worldTimeMinutes: clock.worldTimeMinutes,
  });
}

export async function* processGameplayTurnCycleV2(
  options: TurnOptions,
): AsyncGenerator<TurnEvent> {
  const turnId = publicRuntimeId("v2turn");
  const baseTick = currentBaseTick(options.campaignId);
  const baseClock = readWorldClock(options.campaignId);
  const chatHistoryLengthBeforeTurn = getChatHistory(options.campaignId).length;
  const preTurnSnapshot = normalizePreTurnSnapshot(options.preTurnSnapshot);
  const turnStart = assertTurnStartEnvelopeV2({
    version: "turn-start-envelope.v2",
    route: "/api/chat/action",
    campaignId: options.campaignId,
    turnId,
    playerAction: options.playerAction,
    submittedPlayerAction: options.playerAction,
    quickActionSelection: null,
    baseTick,
    chatHistoryLengthBeforeTurn,
    preTurnSnapshot,
    providers: {
      judge: providerSummary(options.judgeProvider),
      storyteller: providerSummary(options.storytellerProvider),
    },
    startedAt: Date.now(),
  });
  const attempt = assertTurnAttemptContextV2({
    version: "turn-attempt-context.v2",
    campaignId: turnStart.campaignId,
    turnId: turnStart.turnId,
    playerAction: turnStart.playerAction,
    baseTick: turnStart.baseTick,
    baseWorldVersion: baseClock.worldVersion,
    chatHistoryLengthBeforeTurn: turnStart.chatHistoryLengthBeforeTurn,
    preTurnSnapshot: turnStart.preTurnSnapshot,
    idempotencyKey: `${turnStart.turnId}:${turnStart.baseTick}:${baseClock.worldVersion}`,
    allowedTerminalStates: [
      "pre_settlement_restore",
      "pending_narration",
      "finalized_done",
    ],
    settlementPhase: "pre_settlement",
  });

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-frame",
      phase: "gameplay-cycle-v2",
      tick: baseTick,
    },
  };

  const forecast = loadWorldTrajectoryForecast(options.campaignId);
  const initialFrameContext = await buildLiveSceneFrameContextV2({
    campaignId: options.campaignId,
    playerAction: options.playerAction,
    attempt,
    forecast,
  });
  const frame = initialFrameContext.frame;
  const modelPacket = initialFrameContext.packet;
  const explicitMovementAdmission = admitExplicitMovementV2({
    packet: modelPacket,
    refRegistry: initialFrameContext.refRegistry,
  });

  yield {
    type: "scene-settling",
    data: {
      stage: "gm-read",
      phase: "gameplay-cycle-v2",
      tick: baseTick,
    },
  };

  let gmReadCandidate: unknown;
  try {
    gmReadCandidate = (await safeGenerateObject({
      model: createModel(options.judgeProvider, { role: "judge" }),
      schema: gmReadCandidateV2LooseSchema,
      system: buildGmReadSystemPrompt(),
      prompt: buildGmReadPrompt(modelPacket, explicitMovementAdmission),
      temperature: 0.1,
      maxTokens: 1_600,
      retries: 1,
      strictSchema: false,
    })).object;
  } catch (error) {
    throw runtimeContractError(
      `GM Read generation failed before settlement: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  gmReadCandidate = completeGmReadWithExplicitMovementAdmissionV2({
    candidate: gmReadCandidate,
    admission: explicitMovementAdmission,
  });
  const gmReadValidation = validateGmReadV2({
    packet: modelPacket,
    candidate: gmReadCandidate,
  });
  if (gmReadValidation.status !== "accepted") {
    throw runtimeContractError(
      `GM Read rejected before settlement: ${gmReadValidation.issues.map((issue) =>
        `${issue.path}: ${issue.message}`
      ).join("; ")}`,
    );
  }
  const gmRead = gmReadValidation.read;
  let oracleResult: OracleResult | null = null;
  let settledPacket: SettledTurnPacketV2;
  if (gmRead.path === "roll_oracle") {
    yield {
      type: "scene-settling",
      data: {
        stage: "oracle",
        phase: "gameplay-cycle-v2",
        tick: baseTick,
      },
    };
    oracleResult = await callOracle(buildOraclePayloadV2({
      modelPacket,
      gmRead,
    }), options.judgeProvider);
    yield {
      type: "oracle_result",
      data: {
        outcome: oracleResult.outcome,
      },
    };
    const oracleSettlement = buildOracleSettlementV2({
      settlementId: publicRuntimeId("v2oracle"),
      modelPacket,
      gmRead,
      result: oracleResult,
    });
    settledPacket = buildOracleSettledTurnPacketV2({
      packetId: publicRuntimeId("v2packet"),
      modelPacket,
      gmRead,
      oracleSettlement,
    });
  } else if (gmRead.path === "tool_plan") {
    yield {
      type: "scene-settling",
      data: {
        stage: "action-checklist",
        phase: "gameplay-cycle-v2",
        tick: baseTick,
      },
    };
    const checklist = await generateActionChecklistCandidateV2({
      options,
      packet: modelPacket,
      gmRead,
    });
    yield {
      type: "scene-settling",
      data: {
        stage: "tool-execution",
        phase: "gameplay-cycle-v2",
        tick: baseTick,
      },
    };
    const handlers = createDbBackedGameplayToolHandlersV2();
    const sceneContextCache = new Map<number, LiveSceneFrameContextV2>([
      [initialFrameContext.packet.baseWorldVersion, initialFrameContext],
    ]);
    const sceneContextForWorldVersion = async (worldVersion: number) => {
      const cached = sceneContextCache.get(worldVersion);
      if (cached) return cached;
      const refreshed = await buildLiveSceneFrameContextV2({
        campaignId: options.campaignId,
        playerAction: options.playerAction,
        attempt: attemptAtWorldVersion({
          attempt,
          baseTick: currentFrameTick(options.campaignId),
          worldVersion,
        }),
        forecast,
      });
      sceneContextCache.set(worldVersion, refreshed);
      return refreshed;
    };
    const composition = await composeGameplayCycleMutatingTurnV2({
      packetId: publicRuntimeId("v2packet"),
      ledgerId: `ledger-${turnId}`,
      scheduleId: `schedule-${turnId}`,
      initialPacket: modelPacket,
      gmRead,
      checklist,
      handlers,
      refRegistryProvider: async ({ packet }) =>
        (await sceneContextForWorldVersion(packet.baseWorldVersion)).refRegistry,
      requestCandidateProvider: async ({ packet, checklist: requestChecklist, step }) =>
        generateToolRequestCandidateV2({
          options,
          packet,
          checklist: requestChecklist,
          step,
        }),
      refreshedFrameProvider: async ({ receipt }) =>
        (await sceneContextForWorldVersion(receipt.resultWorldVersion)).envelope,
      localConsequenceCandidateProvider: async ({
        latestPacket,
        ledger,
        schedule,
        consequence,
        consequenceIndex,
      }) => generateLocalConsequenceCandidateV2({
        options,
        latestPacket,
        ledger,
        schedule,
        consequence,
        consequenceIndex,
      }),
      localConsequenceRefreshedFrameProvider: async ({ receipt }) =>
        (await sceneContextForWorldVersion(receipt.resultWorldVersion)).envelope,
    });
    if (composition.status !== "settled") {
      throw runtimeContractError(composition.reason);
    }
    if (
      composition.settledPacket.failedSteps.length > 0
      || composition.settledPacket.skippedSteps.length > 0
    ) {
      throw runtimeContractError(
        "Tool-plan composition produced failed or skipped required steps before packet persistence.",
      );
    }
    settledPacket = composition.settledPacket;
    const packetPersistence = buildSettledPacketPersistencePendingV2(settledPacket);
    const narratorView = buildNarratorViewV2(settledPacket);
    persistSettledTurnPacketV2({
      packet: settledPacket,
      persistence: packetPersistence,
      checklist,
      receiptLedger: composition.ledger,
      narratorView,
    });
  } else {
    settledPacket = buildNoReceiptSettledTurnPacketV2({
      packetId: publicRuntimeId("v2packet"),
      modelPacket,
      gmRead,
    });
  }
  const existingNarratorView = buildNarratorViewV2(settledPacket);
  if (gmRead.path !== "tool_plan") {
    const packetPersistence = buildSettledPacketPersistencePendingV2(settledPacket);
    persistSettledTurnPacketV2({
      packet: settledPacket,
      persistence: packetPersistence,
      narratorView: existingNarratorView,
    });
  }
  const narratorView = existingNarratorView;

  if (options.onBeforeVisibleNarration) {
    await Promise.resolve(options.onBeforeVisibleNarration(buildHiddenSummary({
      currentTick: baseTick,
      predictedTick: baseTick + 1,
      frame,
      oracleResult,
    })));
  }

  yield {
    type: "scene-settling",
    data: {
      stage: "narrator",
      phase: "gameplay-cycle-v2",
      tick: baseTick,
    },
  };
  markGameplayCycleV2PacketNarratorRendering(settledPacket.packetId);

  let narration: Awaited<ReturnType<typeof generateText>>;
  try {
    narration = await generateText({
      model: createModel(options.storytellerProvider, { role: "storyteller" }),
      system: buildNarratorSystemPrompt(),
      prompt: buildNarratorPrompt(narratorView),
      temperature: options.storytellerTemperature,
      maxOutputTokens: options.storytellerMaxTokens,
    });
  } catch (error) {
    markGameplayCycleV2PacketNarratorFailedPendingRetry(settledPacket.packetId);
    throw new GameplayCycleV2PendingNarrationError({
      packetId: settledPacket.packetId,
      campaignId: settledPacket.campaignId,
      turnId: settledPacket.turnId,
      cause: error,
    });
  }
  const narrativeText = assertNarrativeText(narration.text);

  appendChatMessages(options.campaignId, [
    {
      role: "user",
      content: options.playerAction,
    },
    {
      role: "assistant",
      content: narrativeText,
      metadata: {
        presentation: {
          authority: "settled_packet_presentation",
          source: "settled_turn_packet",
        },
      },
    },
  ]);

  const newTick = advanceCampaignTick(options.campaignId, 1);
  syncWorldClockTurnBoundary({
    campaignId: options.campaignId,
    currentTick: newTick,
  });
  const projection = buildApiProjectionInput({
    packet: settledPacket,
    narrativeText,
    tick: newTick,
  });
  finalizeGameplayCycleV2Packet({
    packetId: settledPacket.packetId,
    apiProjection: projection,
  });

  yield projection.narrativeEvent;
  yield {
    type: "finalizing_turn",
    data: {
      stage: "gameplay-cycle-v2",
      tick: newTick,
    },
  };

  yield projection.doneEvent;
}

export const processGameplayTurnCycleV2NoMutation = processGameplayTurnCycleV2;

export async function* resumeGameplayCycleV2PendingNarration(input: {
  campaignId: string;
  packetId: string;
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
}): AsyncGenerator<TurnEvent> {
  const persisted = readGameplayCycleV2Packet(input.packetId);
  if (!persisted || persisted.campaignId !== input.campaignId) {
    throw new Error(`gameplay-cycle-v2 pending packet not found: ${input.packetId}`);
  }
  if (
    persisted.status !== "resolved_pending_narration"
    || persisted.narratorAttemptStatus !== "failed_pending_retry"
  ) {
    throw new Error(`gameplay-cycle-v2 packet ${input.packetId} is not pending narration retry.`);
  }
  const narratorView = persisted.narratorView ?? buildNarratorViewV2(persisted.packet);

  yield {
    type: "scene-settling",
    data: {
      stage: "narrator",
      phase: "gameplay-cycle-v2-resume",
      tick: persisted.packet.baseTick,
    },
  };
  markGameplayCycleV2PacketNarratorRendering(persisted.packetId);

  let narration: Awaited<ReturnType<typeof generateText>>;
  try {
    narration = await generateText({
      model: createModel(input.storytellerProvider, { role: "storyteller" }),
      system: buildNarratorSystemPrompt(),
      prompt: buildNarratorPrompt(narratorView),
      temperature: input.storytellerTemperature,
      maxOutputTokens: input.storytellerMaxTokens,
    });
  } catch (error) {
    markGameplayCycleV2PacketNarratorFailedPendingRetry(persisted.packetId);
    throw new GameplayCycleV2PendingNarrationError({
      packetId: persisted.packetId,
      campaignId: persisted.campaignId,
      turnId: persisted.turnId,
      cause: error,
    });
  }

  const narrativeText = assertNarrativeText(narration.text);
  appendChatMessages(input.campaignId, [
    {
      role: "user",
      content: persisted.packet.playerAction,
    },
    {
      role: "assistant",
      content: narrativeText,
      metadata: {
        presentation: {
          authority: "settled_packet_presentation",
          source: "settled_turn_packet",
        },
      },
    },
  ]);

  const newTick = advanceCampaignTick(input.campaignId, 1);
  syncWorldClockTurnBoundary({
    campaignId: input.campaignId,
    currentTick: newTick,
  });
  const projection = buildApiProjectionInput({
    packet: persisted.packet,
    narrativeText,
    tick: newTick,
  });
  finalizeGameplayCycleV2Packet({
    packetId: persisted.packetId,
    apiProjection: projection,
  });

  yield projection.narrativeEvent;
  yield {
    type: "finalizing_turn",
    data: {
      stage: "gameplay-cycle-v2-resume",
      tick: newTick,
    },
  };
  yield projection.doneEvent;
}
