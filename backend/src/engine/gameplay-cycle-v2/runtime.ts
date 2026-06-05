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
  type GmJudgeChecklistV2,
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
import {
  assertChecklistGmJudgeV2,
  assertOracleGmJudgeV2,
  buildCompatGmJudgeFromLegacyGmReadV2,
  validateGmJudgeV2,
} from "./gm-judge.js";
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
  "item_transfer",
  "condition_set",
  "time_advance",
  "world_fact_record",
  "location_reveal",
  "minor_poi_create",
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
    "Use tool_plan when the turn needs an accepted backend action checklist for route checks, movement, visible dialogue outcomes, temporary current-scene support actor creation, visible current-scene minor POI creation, concrete entity tag changes, concrete item custody/equip/location changes, concrete actor condition or Player HP changes, explicit elapsed in-world time, source-bounded player-known knowledge recording, or a scene-local beat receipt.",
    "For tool_plan, include checklistRequest with turnPath, requiredEffectKinds, actorRefs, targetRefs, evidenceRefs, and checklistGoal.",
    "For explicit travel to a connected visible destination, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"movement\"].",
    "For route availability checks without travel, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=procedural, and checklistRequest.requiredEffectKinds=[\"route_check\"].",
    "For a visible speaker's answer, refusal, warning, redirect, silence, or other concrete dialogue outcome, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=procedural, and checklistRequest.requiredEffectKinds=[\"dialogue_outcome\"].",
    "For dialogue_outcome, checklistRequest.actorRefs must name the visible speaker who owns the response; targetRefs may include the player or addressed visible actors; evidenceRefs must include the visible speaker and scene refs.",
    "For creating an ordinary temporary local service/witness/helper/vendor/guard/attendant/crowd support actor in the current scene, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"support_actor_create\"].",
    "For support_actor_create, checklistRequest.actorRefs must include Player, targetRefs must include the current scene ref, and evidenceRefs must include Player plus current scene/location refs. This capability creates only temporary current-scene reactive support NPCs.",
    "For creating an ordinary visible non-actor local affordance/point of interest in the current scene (notice board, counter, table, alcove, mark, pillar, stall surface), choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"minor_poi_create\"].",
    "minor_poi_create creates only one visible current-scene target. It must not reveal hidden places, create routes, create items, prove search success or absence, record world facts, or change the player's current scene.",
    "For exposing a source-bounded visible current-scene place handle from already accepted local evidence (entrance, service window, alcove, stall, counter, doorway, local area, landmark), choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"location_reveal\"].",
    "For location_reveal, checklistRequest.targetRefs and evidenceRefs must cite only refs that already exist in citableRefs, usually Player plus current scene/location refs. Do not cite the new place-handle label in GM Read; the new label belongs only in the later location.reveal.v2 tool request locationLabel.",
    "location_reveal creates or exposes only one visible current-scene location target/handle. It must not create routes, movement options, current-scene changes, hidden discoveries, absence proof, items, actors, or world facts.",
    "For a concrete mark, label, status tag, annotation, stamp, flag, or tag applied to or removed from a visible/current/inventory entity, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"entity_tag\"].",
    "For entity_tag, checklistRequest.targetRefs must include exactly the visible/current/inventory entity being changed, and evidenceRefs must include Player plus that entity and the current scene/location refs.",
    "For giving, dropping, placing, taking, equipping, or unequipping a modeled visible/current/inventory item, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"item_transfer\"].",
    "For item_transfer, checklistRequest.targetRefs must include the item and the concrete target owner/location when one exists; evidenceRefs must include Player, the item, and the current scene/location refs.",
    "Do not use item_transfer for already-held restow with no equip-state change, unmodeled currency/fees/tips/bribes/prices, item creation, partial stacks, containers, hidden/offscreen items, NPC inventory handoff, barter resolution, world facts, memories, relationships, or search/discovery.",
    "For setting or clearing a concrete visible actor physical/status condition such as prone, exhausted, injured, wounded, bleeding, burned, poisoned, sick, or starving, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"condition\"].",
    "For condition, checklistRequest.actorRefs and targetRefs must include exactly the actor whose condition or Player HP changes; evidenceRefs must include Player, that actor, and current scene/location refs. Use Player for player actor refs.",
    "condition can set/clear one visible actor condition or adjust Player HP by one point only. It must not implement combat resolution, NPC HP, offscreen/private conditions, relationship/faction/reputation, item/location/world-fact changes, or narrator-inferred injuries.",
    "For explicit player intent to wait, watch, rest, work, or otherwise let 1-240 minutes pass in the current scene without movement or other state changes, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=procedural, and checklistRequest.requiredEffectKinds=[\"time_advance\"].",
    "For time_advance, checklistRequest.actorRefs must be [\"Player\"], targetRefs must include the current scene ref, and evidenceRefs must include Player plus current scene/location refs.",
    "time_advance proves only elapsed in-world clock time. It never proves movement, route availability, rest benefits, healing, fatigue, search results, hidden/offscreen events, discovery, absence, NPC knowledge, item state, location state, or world facts.",
    "For recording a future-usable player-known procedure, route hint, evidence note, or memory from an accepted source in the same checklist, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=mutating, and checklistRequest.requiredEffectKinds=[\"dialogue_outcome\",\"world_fact\"] when the source must first be spoken or [\"world_fact\"] only when the source is already an accepted runtime receipt in this turn.",
    "For world_fact, checklistRequest.actorRefs must include Player, targetRefs must include only player-visible/source-bounded subjects, and evidenceRefs must include Player plus the visible source refs. world_fact records what the player knows or was told; it is not objective canon.",
    "Do not use world_fact for absence, hidden discovery, movement/arrival, route legality, item custody/equip/container state, NPC private knowledge, relationship/faction/reputation, condition, combat, time advancement, or any fact sourced only from raw player action, GM Read text, checklist intent, failed/skipped receipts, or narrator prose.",
    "For local posture/scene beat without structural state change, choose path=tool_plan, turnNeed=backend_action_checklist, checklistRequest.turnPath=procedural, and checklistRequest.requiredEffectKinds=[\"scene_beat\"].",
    "Valid checklistRequest.turnPath values are only: mutating, procedural, combat. Never use movement, route_check, or scene_beat as turnPath values.",
    "For this live slice, checklistRequest.requiredEffectKinds may use only route_check, movement, dialogue_outcome, support_actor_create, minor_poi_create, location_reveal, entity_tag, item_transfer, condition, time_advance, world_fact, or scene_beat.",
    "dialogue_outcome is terminal and non-mutating in this slice: it records the visible response for narration only and does not create NPC memory, world facts, item state, relationship state, or durable social state.",
    "support_actor_create is a structural mutation in this slice: it can create one temporary current-scene reactive support NPC only. It must not create key/persistent actors, hidden identity, memories, faction state, schedules, relationships, inventory, world facts, dialogue content, or actor lifecycle state.",
    "minor_poi_create is a local-scene structural mutation in this slice: it can create one visible target-only current-scene POI. It must not create movement options, routes, hidden discoveries, items, actors, world facts, or current-scene changes.",
    "location_reveal is a local-scene structural mutation in this slice: it can create or expose one source-bounded visible current-scene place handle. It must not create movement options, routes, hidden discoveries, absence proof, items, actors, world facts, or current-scene changes.",
    "entity_tag is a structural mutation in this slice: it can only add or remove one tag on one resolved player_actor, visible_actor, current_location, current_scene, visible_item, visible_location, or inventory_item.",
    "item_transfer is a structural mutation in this slice: it can only transfer a modeled item between player inventory, a visible current-scene actor, the current scene, or a visible current-scene local location/POI, or change a player-owned item's equip state.",
    "condition is a structural actor mutation in this slice: it can only set/clear one canonical visible condition on Player or a visible actor, or adjust Player HP by exactly one point.",
    "time_advance is a world-clock mutation in this slice: it can only advance elapsed in-world time for explicit player elapsed-time intent in the current scene.",
    "world_fact is a player-known knowledge mutation in this slice: it can only record source-bounded knowledge owned by Player from accepted same-turn runtime receipts. It must preserve source/truth framing and must not become objective world canon.",
    "Do not narrate. Do not mutate state. Do not include tool names, tool inputs, executable payloads, combat transitions, or future checklist steps.",
    "Cite only citableRefs from the model-facing packet.",
    "For direct/continue, omit clarificationPrompt entirely. For clarification, include a non-empty clarificationPrompt. Never emit empty strings or null for optional fields.",
    "For roll_oracle, include oracleRequest with question, stakes, outcomeMeanings for strong_hit/weak_hit/miss, uncertaintyKind, actorRef, targetRefs, and evidenceRefs.",
    "For roll_oracle, turnNeed must be exactly oracle_uncertainty. Do not include noMutationReason or clarificationPrompt on roll_oracle.",
    "For roll_oracle, uncertaintyKind must be one of: physical_risk, perception, social_pressure, opposition, chance.",
    "The three outcomeMeanings must define what each tier means before the roll; narrator will use the selected meaning as settled truth.",
    "Oracle settles uncertainty only; it is not a movement, discovery, item-state, NPC-knowledge, or world-mutation receipt.",
    "If the player action needs unimplemented mutation, combat, hidden knowledge, durable NPC memory, or a backend capability outside route_check/movement/dialogue_outcome/support_actor_create/minor_poi_create/location_reveal/entity_tag/item_transfer/condition/time_advance/world_fact/scene_beat, choose clarification.",
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
    "Use only clean v2 tool ids: route.check.v2, actor.move.v2, dialogue.record.v2, support_actor.create.v2, minor_poi.create.v2, location.reveal.v2, entity.tag.v2, item.transfer.v2, actor.condition_set.v2, time.advance.v2, world_fact.record.v2, or scene_beat.record.v2.",
    "For dialogue.record.v2, bind speakerRef to the selected visible speaker, addresseeRefs to Player or visible addressees when cited by the step, outcomeKind to answer/refusal/warning/redirect/silence/other, summary to only the concrete visible response, and quotedSpeech to the speaker's actual visible utterance unless outcomeKind is silence.",
    "For non-silence dialogue.record.v2 outcomes, quotedSpeech is required. For silence, omit quotedSpeech.",
    "dialogue.record.v2 is terminal and non-mutating in this slice; do not include durable memory, world fact, relationship, item, location, or hidden-knowledge claims.",
    "For support_actor.create.v2, bind anchorScope to current_scene, anchorRef to the current scene ref, roleKind to one allowed ordinary public support role, roleLabel to a short public role label, optional displayName to the visible actor label, persona.publicSummary to only visible/playable public behavior, optional visibleCue/voiceHint to short public cues, tags to lowercase canonical support tags, identityBounds exactly to temporary/current_scene/minor_support/reactive_only/mayBecomePersistentHere=false, reason to why this ordinary support actor is needed now in the current scene, and evidenceRefs to cited scene/player refs.",
    'The exact required support_actor.create.v2 effectBinding shape is: { "anchorScope": "current_scene", "anchorRef": "<current scene ref>", "roleKind": "attendant|bystander|clerk|courier|crowd_voice|dockhand|guard|guide|helper|laborer|porter|vendor|witness", "roleLabel": "<short visible public role>", "displayName"?: "<visible label>", "persona": { "publicSummary": "<required visible public behavior>", "visibleCue"?: "<short visible cue>", "voiceHint"?: "<short public voice cue>" }, "tags": ["lowercase-tag"], "identityBounds": { "tier": "temporary", "persistence": "current_scene", "significance": "minor_support", "agency": "reactive_only", "mayBecomePersistentHere": false }, "reason": "<required why-now reason>", "evidenceRefs": ["<cited refs>"] }.',
    "support_actor.create.v2 is a mutation receipt for temporary current-scene support NPC creation only. Never use it for persistent/key actors, hidden identities, private knowledge, memories, factions, relationships, inventory, schedules, world facts, dialogue content, movement, or lifecycle state.",
    "For minor_poi.create.v2, bind anchorScope to current_scene, anchorRef to the current scene ref, poiLabel to one short visible non-actor local affordance label, purpose to why this ordinary local target is needed now, and evidenceRefs to cited scene/player refs.",
    'The exact required minor_poi.create.v2 effectBinding shape is: { "anchorScope": "current_scene", "anchorRef": "<current scene ref>", "poiLabel": "<short visible local target label>", "purpose": "<required why-now reason>", "evidenceRefs": ["<cited refs>"] }.',
    "minor_poi.create.v2 is a mutation receipt for visible current-scene target creation only. Never use it for hidden discoveries, route/location reveal, movement destinations, items, NPCs, world facts, search success or absence, private knowledge, or current-scene changes.",
    "For location.reveal.v2, bind anchorScope to current_scene, anchorRef to the current scene ref, revealMode to create_visible_place_handle or expose_existing_place_handle, placeHandleKind to one allowed visible place-handle kind, locationLabel to the visible handle label, optional visibleDescription to visible local description only, sourceAuthority to current_scene_visible_evidence or accepted_runtime_receipt, exposure to the exact literal non-authority flags, reason to why this place handle becomes citable now, and evidenceRefs to cited refs.",
    'The exact required location.reveal.v2 effectBinding shape is: { "anchorScope": "current_scene", "anchorRef": "<current scene ref>", "revealMode": "create_visible_place_handle|expose_existing_place_handle", "placeHandleKind": "entrance|service_window|alcove|stall|counter|doorway|local_area|landmark|other_visible_place", "locationLabel": "<short visible place handle>", "visibleDescription"?: "<visible description only>", "sourceAuthority": { "kind": "current_scene_visible_evidence", "sourceRefs": ["<cited refs>"], "sourceSummary": "<visible source summary>" } | { "kind": "accepted_runtime_receipt", "sourceReceiptIds": ["<accepted prior receipt id>"], "sourceSummary": "<accepted source summary>" }, "exposure": { "targetKind": "location", "visibleCurrentSceneTarget": true, "movementCandidate": false, "routeEdgeCreated": false, "currentSceneChanged": false, "absenceProof": false, "hiddenDiscovery": false, "itemCreated": false, "actorCreated": false, "worldFactCreated": false }, "reason": "<required why-now reason>", "evidenceRefs": ["<cited refs>"] }.',
    "location.reveal.v2 is a mutation receipt for a visible current-scene place handle only. Never use it for movement, arrival, route legality, route/edge creation, hidden discovery, absence proof, items, actors, world facts, private knowledge, or current-scene changes.",
    "For entity.tag.v2, bind entityScope to one of player_actor, visible_actor, current_location, current_scene, visible_item, visible_location, or inventory_item; bind entityRef to the single selected checklist target; operation to add/remove; tag to the exact short tag to apply or remove; evidenceRefs to cited scene/entity refs.",
    "entity.tag.v2 is the only allowed tag mutation surface. Never use legacy tag tool names, entityName/entityType, or legacy input payloads.",
    'For item.transfer.v2, bind action to one of give_to_visible_actor, drop_to_current_scene, place_at_visible_location, take_to_player_inventory, equip_player_item, or unequip_player_item; itemScope to player_inventory_item or visible_scene_item; itemRef to the modeled item; sourceScope/sourceRef and targetScope/targetRef to the exact Player/current scene/visible actor/visible current-scene local location refs; equip to unchanged/carried/equipped(slot)/unequipped; evidenceRefs to cited refs.',
    'The exact required item.transfer.v2 effectBinding shape is: { "action": "give_to_visible_actor|drop_to_current_scene|place_at_visible_location|take_to_player_inventory|equip_player_item|unequip_player_item", "itemScope": "player_inventory_item|visible_scene_item", "itemRef": "<modeled item ref>", "sourceScope": "player_inventory|current_scene|visible_location", "sourceRef": "<Player/current scene/visible location ref>", "targetScope": "player_inventory|visible_actor_inventory|current_scene|visible_location", "targetRef": "<Player/visible actor/current scene/visible location ref>", "equip": { "mode": "unchanged|carried|equipped|unequipped", "slot"?: "<required only when equipped>" }, "evidenceRefs": ["<cited refs>"] }.',
    "item.transfer.v2 is a mutation receipt for modeled item custody/location/equip changes only. Never use it for unmodeled currency, fees, bribes, prices, item creation, partial stacks, containers, hidden/offscreen items, NPC inventory handoff, barter, world facts, memories, relationships, search/discovery, or restowing an already-carried item.",
    "For actor.condition_set.v2, bind actorRef to Player or one visible actor, actorScope to player_actor or visible_actor, operation to set_condition/clear_condition/adjust_player_hp, sourceAuthority to current_scene_visible_evidence or accepted_runtime_receipt, and evidenceRefs to cited refs. set_condition/clear_condition require one canonical conditionLabel: bleeding, burned, exhausted, injured, poisoned, prone, sick, starving, or wounded. adjust_player_hp is Player-only and requires hpDelta -1 or 1.",
    'The exact required actor.condition_set.v2 effectBinding shape is: { "actorRef": "<Player or visible actor ref>", "actorScope": "player_actor|visible_actor", "operation": { "kind": "set_condition|clear_condition", "conditionLabel": "bleeding|burned|exhausted|injured|poisoned|prone|sick|starving|wounded" } | { "kind": "adjust_player_hp", "hpDelta": -1|1 }, "sourceAuthority": { "kind": "current_scene_visible_evidence", "sourceRefs": ["<cited refs>"], "sourceSummary": "<visible source summary>" } | { "kind": "accepted_runtime_receipt", "sourceReceiptIds": ["<accepted prior receipt id>"], "sourceSummary": "<accepted source summary>" }, "evidenceRefs": ["<cited refs>"] }.',
    "actor.condition_set.v2 is mutation authority for exactly one listed actor condition or Player HP change. Never use it for full combat resolution, NPC HP, hidden/offscreen harm, private NPC condition, reputation/faction/relationship changes, item/location/world-fact state, or extra injuries.",
    "For time.advance.v2, bind actorRef exactly to Player, anchorScope to current_scene, anchorRef to the current scene ref, reasonKind to wait/watch/rest/work/other_elapsed_time, elapsedMinutes to an integer from 1 through 240, sourceAuthority.kind to explicit_player_elapsed_time_intent, sourceAuthority.actorRef to Player, sourceAuthority.anchorRef to the same anchorRef, sourceSummary to the player's explicit elapsed-time intent, and evidenceRefs to Player plus the current scene ref.",
    'The exact required time.advance.v2 effectBinding shape is: { "actorRef": "Player", "anchorScope": "current_scene", "anchorRef": "<current scene ref>", "reasonKind": "wait|watch|rest|work|other_elapsed_time", "elapsedMinutes": 1, "sourceAuthority": { "kind": "explicit_player_elapsed_time_intent", "actorRef": "Player", "anchorRef": "<same current scene ref>", "sourceSummary": "<player explicitly intends elapsed time>" }, "evidenceRefs": ["Player", "<current scene ref>"] }.',
    "time.advance.v2 is clock authority only. Never use it for movement, route availability, rest benefits, healing, fatigue, condition changes, search results, hidden/offscreen events, discovery, absence, NPC knowledge, item state, location state, world facts, or scene beats.",
    "For world_fact.record.v2, bind knowledgeOwnerRef exactly to Player, subjectRefs to visible/source-bounded subjects, statement to a self-contained source-framed sentence, summary to a short player-facing note, truthStatus to observed/reported/claimed/verified/disputed, futureUseKind to memory/evidence/procedure/route_hint/other, source.sourceKind to accepted_dialogue_receipt or accepted_runtime_receipt, source.sourceReceiptIds to accepted prior receipt ids from priorAcceptedReceipts, source.sourceQuote when sourceKind is accepted_dialogue_receipt, source.sourceSummary to what the accepted source established, and evidenceRefs to cited refs.",
    'The exact required world_fact.record.v2 effectBinding shape is: { "knowledgeOwnerRef": "Player", "subjectRefs": ["<cited refs>"], "statement": "<source-framed player-known statement>", "summary": "<short player-facing note>", "truthStatus": "observed|reported|claimed|verified|disputed", "futureUseKind": "memory|evidence|procedure|route_hint|other", "source": { "sourceKind": "accepted_dialogue_receipt|accepted_runtime_receipt", "sourceReceiptIds": ["<accepted prior receipt id>"], "sourceQuote"?: "<required for dialogue receipt>", "sourceSummary": "<accepted source summary>" }, "evidenceRefs": ["<cited refs>"] }.',
    "world_fact.record.v2 is a private player-known knowledge mutation. It must not record objective canon, absence, hidden/offscreen facts, discovery, movement/arrival, route legality, item state, NPC private knowledge, relationships, factions, conditions, time, or anything sourced only from playerAction, GM Read text, checklist intent, failed/skipped receipts, or narrator prose.",
    "Do not include old runtime tool names, root input/payload fields, state deltas, receipts, results, narration, or backend ids.",
    "Every effectBinding ref must be cited by the selected checklist step and by the current packet citableRefs.",
    "The backend validates and executes the request; you only propose the candidate.",
  ].join("\n");
}

function buildToolRequestPrompt(input: {
  packet: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  step: GmActionChecklistStepV2;
  priorReceipts?: GameplayRuntimeReceiptLedgerV2["receipts"];
}): string {
  return JSON.stringify({
    task: "Produce exactly one selected-step gameplay-tool-request.v2 candidate.",
    packet: formatModelFacingTurnPacketForPromptV2(input.packet),
    checklist: input.checklist,
    selectedStep: input.step,
    priorAcceptedReceipts: (input.priorReceipts ?? [])
      .filter((receipt) => receipt.status === "accepted")
      .map((receipt) => ({
        receiptId: receipt.receiptId,
        toolId: receipt.toolId,
        evidenceAuthority: receipt.evidenceAuthority,
        mutationApplied: receipt.mutationApplied,
        visibleSummary: receipt.visibleSummary,
        evidenceRefs: receipt.evidenceRefs,
      })),
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
  gmJudge: GmJudgeChecklistV2;
}): Promise<GmActionChecklistV2> {
  const compiledChecklist = compileSimpleGmActionChecklistV2({
    packet: input.packet,
    gmRead: input.gmRead,
    gmJudge: input.gmJudge,
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
    gmJudge: input.gmJudge,
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
  receipts: GameplayRuntimeReceiptLedgerV2["receipts"];
}): Promise<unknown> {
  return (await safeGenerateObject({
    model: createModel(input.options.judgeProvider, { role: "judge" }),
    schema: gameplayToolRequestV2Schema,
    system: buildToolRequestSystemPrompt(),
    prompt: buildToolRequestPrompt({
      packet: input.packet,
      checklist: input.checklist,
      step: input.step,
      priorReceipts: input.receipts,
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
  const doneTick = Math.max(
    input.tick,
    clock.currentTick,
    clock.worldTimeMinutes,
  );
  return buildApiResponseProjectionV2({
    packet: input.packet,
    narrativeText: input.narrativeText,
    tick: doneTick,
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
  const gmJudgeCandidate = buildCompatGmJudgeFromLegacyGmReadV2({ gmRead });
  const gmJudgeValidation = validateGmJudgeV2({
    packet: modelPacket,
    gmRead,
    candidate: gmJudgeCandidate,
  });
  if (gmJudgeValidation.status !== "accepted") {
    throw runtimeContractError(
      `GM Judge rejected before settlement: ${gmJudgeValidation.issues.map((issue) =>
        `${issue.path}: ${issue.message}`
      ).join("; ")}`,
    );
  }
  const gmJudge = gmJudgeValidation.judge;
  let oracleResult: OracleResult | null = null;
  let settledPacket: SettledTurnPacketV2;
  if (gmJudge.lane === "roll_oracle") {
    if (gmRead.path !== "roll_oracle") {
      throw runtimeContractError("roll_oracle GM Judge requires a roll_oracle GM Read compatibility source.");
    }
    const oracleJudge = assertOracleGmJudgeV2(gmJudge);
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
      gmJudge: oracleJudge,
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
      gmJudge: oracleJudge,
      result: oracleResult,
    });
    settledPacket = buildOracleSettledTurnPacketV2({
      packetId: publicRuntimeId("v2packet"),
      modelPacket,
      gmRead,
      gmJudge: oracleJudge,
      oracleSettlement,
    });
  } else if (gmJudge.lane === "action_checklist") {
    if (gmRead.path !== "tool_plan") {
      throw runtimeContractError("Action-checklist GM Judge requires a tool_plan GM Read compatibility source.");
    }
    const checklistJudge = assertChecklistGmJudgeV2(gmJudge);
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
      gmJudge: checklistJudge,
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
      gmJudge: checklistJudge,
      checklist,
      handlers,
      refRegistryProvider: async ({ packet }) =>
        (await sceneContextForWorldVersion(packet.baseWorldVersion)).refRegistry,
      requestCandidateProvider: async ({ packet, checklist: requestChecklist, step, receipts }) =>
        generateToolRequestCandidateV2({
          options,
          packet,
          checklist: requestChecklist,
          step,
          receipts,
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
      composition.settledPacket.stepAudit.failedCount > 0
      || composition.settledPacket.stepAudit.skippedCount > 0
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
      gmRead,
      receiptLedger: composition.ledger,
      narratorView,
    });
  } else {
    if (gmRead.path === "roll_oracle" || gmRead.path === "tool_plan") {
      throw runtimeContractError("GM Judge lane did not match the accepted GM Read settlement path.");
    }
    settledPacket = buildNoReceiptSettledTurnPacketV2({
      packetId: publicRuntimeId("v2packet"),
      modelPacket,
      gmRead,
      gmJudge,
    });
  }
  const existingNarratorView = buildNarratorViewV2(settledPacket);
  if (gmJudge.lane !== "action_checklist") {
    const packetPersistence = buildSettledPacketPersistencePendingV2(settledPacket);
    persistSettledTurnPacketV2({
      packet: settledPacket,
      persistence: packetPersistence,
      gmRead,
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
      tick: projection.doneEvent.data.tick,
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
      tick: projection.doneEvent.data.tick,
    },
  };
  yield projection.doneEvent;
}
