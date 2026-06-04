import { randomUUID } from "node:crypto";
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
  gmReadCandidateV2LooseSchema,
  type ApiResponseProjectionV2,
  type ModelFacingTurnPacketV2,
  type NarratorViewV2,
  type RuntimeCapabilityIdV2,
  type SettledTurnPacketV2,
} from "./contracts.js";
import {
  buildModelFacingTurnPacketV2,
  formatModelFacingTurnPacketForPromptV2,
} from "./projection.js";
import { validateGmReadV2 } from "./gm-read.js";
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
  markGameplayCycleV2PacketNarratorRendering,
  persistSettledTurnPacketV2,
} from "./packet-store.js";

const NO_MUTATION_CAPABILITIES: RuntimeCapabilityIdV2[] = [
  "observe_visible",
  "oracle_roll",
  "route_options",
];

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

function buildGmReadSystemPrompt(): string {
  return [
    "You are the WorldForge GM Read layer.",
    "Return only the interpretation object for gameplay-cycle-v2.",
    "This slice accepts direct, continue, clarification, or roll_oracle only.",
    "Use roll_oracle only when the player action contains true uncertainty/risk that cannot be settled from the current SceneFrame alone.",
    "Immediate uncertainty about whether a visible actor notices, resists, is distracted by, or reacts to the player's current risky attempt is eligible for roll_oracle.",
    "Do not use roll_oracle to reveal hidden memories, private intentions, secret knowledge, offscreen facts, or facts about actors who are not visible/cited.",
    "Do not narrate. Do not mutate state. Do not include tool names, tool inputs, executable payloads, combat transitions, or future checklist steps.",
    "Cite only citableRefs from the model-facing packet.",
    "For direct/continue, omit clarificationPrompt entirely. For clarification, include a non-empty clarificationPrompt. Never emit empty strings or null for optional fields.",
    "For roll_oracle, include oracleRequest with question, stakes, outcomeMeanings for strong_hit/weak_hit/miss, uncertaintyKind, actorRef, targetRefs, and evidenceRefs.",
    "For roll_oracle, turnNeed must be exactly oracle_uncertainty. Do not include noMutationReason or clarificationPrompt on roll_oracle.",
    "For roll_oracle, uncertaintyKind must be one of: physical_risk, perception, social_pressure, opposition, chance.",
    "The three outcomeMeanings must define what each tier means before the roll; narrator will use the selected meaning as settled truth.",
    "Oracle settles uncertainty only; it is not a movement, discovery, item-state, NPC-knowledge, or world-mutation receipt.",
    "If the player action needs world mutation, movement, combat, hidden knowledge, or a backend tool, choose clarification for this slice unless the only missing piece is true Oracle uncertainty.",
  ].join("\n");
}

function buildGmReadPrompt(packet: ModelFacingTurnPacketV2): string {
  return JSON.stringify({
    task: "Interpret this player turn without mutation.",
    packet: formatModelFacingTurnPacketForPromptV2(packet),
  }, null, 2);
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

export async function* processGameplayTurnCycleV2NoMutation(
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
      phase: "gameplay-cycle-v2-no-mutation",
      tick: baseTick,
    },
  };

  const frame = await buildSceneFrame({
    campaignId: options.campaignId,
    tick: baseTick,
    playerAction: options.playerAction,
    runActorExposureCatchup: false,
    allowedTools: [],
    toolExposureMode: "internal",
  });
  const forecast = loadWorldTrajectoryForecast(options.campaignId);
  const sceneEnvelope = assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt,
    frame,
    scopedForecastExcerpt: buildScopedForecastExcerpt({
      forecast,
      localRefs: forecastLocalRefs(frame),
    }),
    refs: {
      visibleRefs: visibleRefsFromFrame(frame),
      privateGuardTerms: frame.perception.forbiddenActorLabels ?? [],
      allowedCapabilityIds: NO_MUTATION_CAPABILITIES,
    },
  });
  const modelPacket = buildModelFacingTurnPacketV2(sceneEnvelope);

  yield {
    type: "scene-settling",
    data: {
      stage: "gm-read",
      phase: "gameplay-cycle-v2-no-mutation",
      tick: baseTick,
    },
  };

  let gmReadCandidate: unknown;
  try {
    gmReadCandidate = (await safeGenerateObject({
      model: createModel(options.judgeProvider, { role: "judge" }),
      schema: gmReadCandidateV2LooseSchema,
      system: buildGmReadSystemPrompt(),
      prompt: buildGmReadPrompt(modelPacket),
      temperature: 0.1,
      maxTokens: 1_600,
      retries: 1,
      strictSchema: false,
    })).object;
  } catch (error) {
    gmReadCandidate = {
      version: "gm-read.v2",
      path: "clarification",
      situationSummary: "The GM Read layer could not produce a valid no-mutation interpretation.",
      sceneQuestion: "What should be clarified before resolving this turn?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player"],
      actionInterpretation: {
        intent: "Clarify the player action.",
        method: null,
        targetRefs: [],
      },
      turnNeed: "clarification_needed",
      rationale: error instanceof Error ? error.message.slice(0, 700) : String(error).slice(0, 700),
      noMutationReason: "No state mutation is accepted when the GM Read contract fails.",
      clarificationPrompt: "Please clarify what you want to do next.",
    };
  }
  const gmRead = validateGmReadV2({
    packet: modelPacket,
    candidate: gmReadCandidate,
  }).read;
  let oracleResult: OracleResult | null = null;
  let settledPacket: SettledTurnPacketV2;
  if (gmRead.path === "roll_oracle") {
    yield {
      type: "scene-settling",
      data: {
        stage: "oracle",
        phase: "gameplay-cycle-v2-no-mutation",
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
  } else {
    settledPacket = buildNoReceiptSettledTurnPacketV2({
      packetId: publicRuntimeId("v2packet"),
      modelPacket,
      gmRead,
    });
  }
  const packetPersistence = buildSettledPacketPersistencePendingV2(settledPacket);
  const narratorView = buildNarratorViewV2(settledPacket);
  persistSettledTurnPacketV2({
    packet: settledPacket,
    persistence: packetPersistence,
    narratorView,
  });

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
      phase: "gameplay-cycle-v2-no-mutation",
      tick: baseTick,
    },
  };
  markGameplayCycleV2PacketNarratorRendering(settledPacket.packetId);

  const narration = await generateText({
    model: createModel(options.storytellerProvider, { role: "storyteller" }),
    system: buildNarratorSystemPrompt(),
    prompt: buildNarratorPrompt(narratorView),
    temperature: options.storytellerTemperature,
    maxOutputTokens: options.storytellerMaxTokens,
  });
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
      stage: "gameplay-cycle-v2-no-mutation",
      tick: newTick,
    },
  };

  yield projection.doneEvent;
}
