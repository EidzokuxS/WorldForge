import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import type { ProviderConfig } from "../../ai/provider-registry.js";
import { getChatHistory } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { worldClocks } from "../../db/schema.js";
import { buildAuthoritativeSceneFrame } from "./frame.js";
import {
  runCleanGmActionChecklist,
  type GmActionChecklistRunResult,
} from "./action-checklist.js";
import {
  runCleanGmRead,
  type GmReadCandidateGenerator,
  type GmReadRunResult,
} from "./gm-read.js";
import {
  runCleanJudgeUncertainty,
  type JudgeUncertaintyCandidateGenerator,
  type JudgeUncertaintyRunResult,
} from "./judge-uncertainty.js";
import {
  runCleanOracleSettlement,
  type OracleAdapter,
  type OracleSettlementRunResult,
} from "./oracle-settlement.js";
import {
  runCleanStage4Execution,
  type CleanStage4ExecutionRunResult,
  type Stage4FrameRefresh,
  type Stage4DialogueRequestGenerator,
  type Stage4SupportActorRequestGenerator,
} from "./stage4-execution.js";
import {
  assertFrozenApiProjection,
  assertGameplayRuntimeTurnInput,
  type AuthoritativeSceneFrame,
  type CleanPlayerFacingTurnEvidenceRef,
  type CleanStage4ExecutionResult,
  type CleanSettledTurnPacket,
  type FrozenApiProjection,
  type GameplayRuntimeProviderSummary,
  type GameplayRuntimeTurnInput,
} from "./contracts.js";
import {
  buildCleanPublicTurnIds,
  commitCleanPlayerFacingTurn,
  type CommitCleanPlayerFacingTurnInput,
  type CleanPlayerFacingTurnCommitResult,
} from "./turn-persistence.js";
import {
  buildCleanNarratorView,
  buildCleanSettledTurnPacket,
} from "./settlement.js";
import {
  runCleanNarration,
  type CleanNarrationRunResult,
} from "./narration.js";

export type CleanGameplayRuntimeEvent = {
  type:
    | "scene-settling"
    | "oracle_result"
    | "state_update"
    | "narrative"
    | "finalizing_turn"
    | "done"
    | "error";
  data: unknown;
};

export class CleanGameplayRuntimeInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CleanGameplayRuntimeInvariantError";
  }
}

export interface CleanGameplayRuntimeOptions {
  campaignId: string;
  submittedPlayerAction: string;
  normalizedPlayerAction: string;
  quickActionSelection?: {
    handle: string;
    offerId: string;
    actionId: string;
    baseWorldVersion: number;
  } | null;
  judgeProvider: ProviderConfig;
  storytellerProvider: ProviderConfig;
  embedderProvider?: ProviderConfig | null;
  preTurnSnapshot: {
    bundleDir: string;
    capturedAt: number;
  };
  gmReadCandidateGenerator?: GmReadCandidateGenerator;
  judgeUncertaintyCandidateGenerator?: JudgeUncertaintyCandidateGenerator;
  oracleAdapter?: OracleAdapter;
  stage4DialogueRequestGenerator?: Stage4DialogueRequestGenerator;
  stage4SupportActorRequestGenerator?: Stage4SupportActorRequestGenerator;
}

export interface CleanGameplayRuntimeCoreOptions {
  turn: GameplayRuntimeTurnInput;
  judgeProvider: ProviderConfig;
  storytellerProvider?: ProviderConfig;
  buildFrame?: (turn: GameplayRuntimeTurnInput) => Promise<AuthoritativeSceneFrame>;
  gmReadCandidateGenerator?: GmReadCandidateGenerator;
  judgeUncertaintyCandidateGenerator?: JudgeUncertaintyCandidateGenerator;
  oracleAdapter?: OracleAdapter;
  stage4DialogueRequestGenerator?: Stage4DialogueRequestGenerator;
  stage4SupportActorRequestGenerator?: Stage4SupportActorRequestGenerator;
  runStage4Execution?: (input: {
    frame: AuthoritativeSceneFrame;
    checklist: NonNullable<GmActionChecklistRunResult["checklist"]>;
    dialogueProvider?: ProviderConfig;
    generateDialogueRequest?: Stage4DialogueRequestGenerator;
    supportActorProvider?: ProviderConfig;
    generateSupportActorRequest?: Stage4SupportActorRequestGenerator;
    refreshFrameAfterReceipt?: Stage4FrameRefresh;
  }) => Promise<CleanStage4ExecutionRunResult>;
  commitTurn?: (
    input: Omit<CommitCleanPlayerFacingTurnInput, "chat" | "store">,
  ) => Promise<CleanPlayerFacingTurnCommitResult>;
  runNarration?: (input: {
    narratorView: ReturnType<typeof buildCleanNarratorView>;
    provider: ProviderConfig;
  }) => Promise<CleanNarrationRunResult>;
}

function envFlagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isCleanGameplayRuntimeEnabled(): boolean {
  return envFlagEnabled("WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN");
}

function providerSummary(provider: ProviderConfig): GameplayRuntimeProviderSummary {
  return {
    id: provider.id,
    model: provider.model ?? null,
    baseUrl: provider.baseUrl ?? null,
  };
}

function readExistingWorldClock(campaignId: string): {
  currentTick: number;
  worldVersion: number;
  worldTimeMinutes: number;
} {
  const row = getDb()
    .select({
      currentTick: worldClocks.currentTick,
      worldVersion: worldClocks.worldVersion,
      worldTimeMinutes: worldClocks.worldTimeMinutes,
    })
    .from(worldClocks)
    .where(eq(worldClocks.campaignId, campaignId))
    .get();
  if (!row) {
    throw new CleanGameplayRuntimeInvariantError(
      `Clean gameplay runtime requires an authoritative world clock row for campaign ${campaignId}.`,
    );
  }
  return row;
}

export function buildGameplayRuntimeTurnInput(
  options: CleanGameplayRuntimeOptions,
): GameplayRuntimeTurnInput {
  const clock = readExistingWorldClock(options.campaignId);
  const source = options.quickActionSelection ? "quick_action" : "typed";
  const turnId = `clean-turn-${randomUUID()}`;
  return assertGameplayRuntimeTurnInput({
    version: "gameplay-runtime.turn-input.v1",
    route: "/api/chat/action",
    campaignId: options.campaignId,
    turnId,
    playerAction: {
      submitted: options.submittedPlayerAction,
      normalized: options.normalizedPlayerAction,
      source,
      quickActionSelection: options.quickActionSelection ?? undefined,
    },
    base: {
      tick: clock.currentTick,
      worldVersion: clock.worldVersion,
      worldTimeMinutes: clock.worldTimeMinutes,
      chatHistoryLengthBeforeTurn: getChatHistory(options.campaignId).length,
      preTurnSnapshot: options.preTurnSnapshot,
    },
    providers: {
      judge: providerSummary(options.judgeProvider),
      storyteller: providerSummary(options.storytellerProvider),
      embedder: options.embedderProvider ? providerSummary(options.embedderProvider) : undefined,
    },
    idempotencyKey: `${options.campaignId}:${clock.currentTick}:${clock.worldVersion}:${turnId}`,
  });
}

function buildFrozenProjection(input: {
  turn: GameplayRuntimeTurnInput;
  frame: AuthoritativeSceneFrame;
  narrativeText: string;
  mutationApplied?: boolean;
}): FrozenApiProjection {
  return assertFrozenApiProjection({
    version: "gameplay-runtime.frozen-api-projection.v1",
    runtime: "gameplay-cycle-runtime",
    campaignId: input.turn.campaignId,
    turnId: input.turn.turnId,
    frameId: input.frame.frameId,
    narrativeText: input.narrativeText,
    mutationApplied: input.mutationApplied ?? false,
    settled: true,
  });
}

function cleanEvidenceRefs(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmReadRunResult;
  judgeUncertainty?: JudgeUncertaintyRunResult;
  oracleSettlement?: OracleSettlementRunResult;
  actionChecklist?: GmActionChecklistRunResult;
  stage4Execution?: CleanStage4ExecutionResult | null;
  settledPacket?: CleanSettledTurnPacket | null;
}): CleanPlayerFacingTurnEvidenceRef[] {
  const refs: CleanPlayerFacingTurnEvidenceRef[] = [
    {
      kind: "scene_frame",
      ref: input.frame.frameId,
      authority: "snapshot",
    },
  ];
  if (input.gmRead.status === "accepted") {
    refs.push({
      kind: "gm_read",
      ref: `gm_read_${input.frame.frameId}`,
      authority: "interpretation_only",
    });
  }
  if (input.judgeUncertainty?.status === "accepted") {
    refs.push({
      kind: "judge_uncertainty",
      ref: input.judgeUncertainty.judgment.judgmentId,
      authority: "admission_only",
    });
  }
  if (
    input.oracleSettlement?.status === "settled"
  ) {
    refs.push({
      kind: "oracle_settlement",
      ref: input.oracleSettlement.settlement.settlementId,
      authority: "visible_uncertainty_outcome",
    });
  }
  if (input.actionChecklist?.status === "accepted") {
    refs.push({
      kind: "gm_action_checklist",
      ref: input.actionChecklist.checklist.checklistId,
      authority: "planning_only",
    });
  }
  if (input.stage4Execution) {
    refs.push({
      kind: "stage4_execution",
      ref: input.stage4Execution.checklistId,
      authority: "stage4_execution_result",
    });
  }
  if (input.settledPacket) {
    refs.push({
      kind: "settled_packet",
      ref: input.settledPacket.packetId,
      authority: "settled_truth_packet",
    });
  }
  return refs;
}

type CleanStage4AcceptedReceipt = CleanStage4ExecutionResult["receipts"][number];

function lastAcceptedTerminalMovementReceipt(
  execution: CleanStage4ExecutionResult | null | undefined,
): CleanStage4AcceptedReceipt | null {
  if (!execution) return null;
  return [...execution.receipts].reverse().find((receipt) =>
    receipt.status === "accepted"
    && receipt.authority.evidenceAuthority === "terminal_mutation_receipt"
    && receipt.publicResult.locationChange !== null
  ) ?? null;
}

function sceneLabelMatchesMovementReceipt(
  frame: AuthoritativeSceneFrame,
  receipt: CleanStage4AcceptedReceipt,
): boolean {
  const destination = receipt.publicResult.locationChange?.locationName.trim().toLowerCase();
  if (!destination) return false;
  return [
    frame.scene.currentScene.label,
    frame.scene.currentLocation.label,
  ].some((label) => label.trim().toLowerCase() === destination);
}

async function buildPostResolutionFrameForSettlement(input: {
  turn: GameplayRuntimeTurnInput;
  stage4Execution: CleanStage4ExecutionResult | null | undefined;
  buildFrame: (turn: GameplayRuntimeTurnInput) => Promise<AuthoritativeSceneFrame>;
}): Promise<AuthoritativeSceneFrame | null> {
  const movementReceipt = lastAcceptedTerminalMovementReceipt(input.stage4Execution);
  if (!movementReceipt) return null;
  const refreshedFrame = await input.buildFrame({
    ...input.turn,
    base: {
      ...input.turn.base,
      tick: movementReceipt.result.tick,
      worldVersion: movementReceipt.result.worldVersion,
      worldTimeMinutes: movementReceipt.result.worldTimeMinutes,
    },
  });
  if (!sceneLabelMatchesMovementReceipt(refreshedFrame, movementReceipt)) {
    throw new CleanGameplayRuntimeInvariantError(
      `Post-movement SceneFrame did not reflect accepted destination ${movementReceipt.publicResult.locationChange?.locationName}.`,
    );
  }
  return refreshedFrame;
}

export async function* processCleanGameplayTurnFromInput(
  options: CleanGameplayRuntimeCoreOptions,
): AsyncGenerator<CleanGameplayRuntimeEvent> {
  const turn = options.turn;
  yield {
    type: "scene-settling",
    data: {
      stage: "scene-frame",
      phase: "gameplay-cycle-runtime",
    },
  };
  const frame = await (options.buildFrame ?? buildAuthoritativeSceneFrame)(turn);
  yield {
    type: "scene-settling",
    data: {
      stage: "gm-read",
      phase: "gameplay-cycle-runtime",
    },
  };
  const gmRead = await runCleanGmRead({
    frame,
    provider: options.judgeProvider,
    generateCandidate: options.gmReadCandidateGenerator,
    recentConversation: getChatHistory(turn.campaignId).slice(-6),
  });
  let judgeUncertainty: JudgeUncertaintyRunResult | undefined;
  let oracleSettlement: OracleSettlementRunResult | undefined;
  let actionChecklist: GmActionChecklistRunResult | undefined;
  let stage4Execution: CleanStage4ExecutionRunResult | undefined;
  if (gmRead.status === "accepted") {
    yield {
      type: "scene-settling",
      data: {
        stage: "judge-uncertainty",
        phase: "gameplay-cycle-runtime",
      },
    };
    judgeUncertainty = await runCleanJudgeUncertainty({
      frame,
      gmRead: gmRead.read,
      provider: options.judgeProvider,
      generateCandidate: options.judgeUncertaintyCandidateGenerator,
    });
    if (
      judgeUncertainty.status === "accepted"
      && judgeUncertainty.judgment.nextStep === "oracle_roll"
    ) {
      yield {
        type: "scene-settling",
        data: {
          stage: "oracle-roll",
          phase: "gameplay-cycle-runtime",
        },
      };
      oracleSettlement = await runCleanOracleSettlement({
        frame,
        gmRead: gmRead.read,
        judgment: judgeUncertainty.judgment,
        provider: options.judgeProvider,
        settlementId: `oracle-settlement-${randomUUID()}`,
        adapter: options.oracleAdapter,
      });
      if (oracleSettlement.status !== "settled") {
        const issueSummary = oracleSettlement.issues
          .map((issue) => `${issue.path}:${issue.message}`)
          .join("; ")
          .slice(0, 500);
        throw new CleanGameplayRuntimeInvariantError(
          `Clean Oracle settlement did not settle after Judge admitted oracle_roll: ${issueSummary}`,
        );
      }
      yield oracleSettlement.publicEvent;
      yield {
        type: "scene-settling",
        data: {
          stage: "oracle-settlement",
          phase: "gameplay-cycle-runtime",
        },
      };
    } else if (
      judgeUncertainty.status === "accepted"
      && judgeUncertainty.judgment.nextStep === "action_plan"
    ) {
      yield {
        type: "scene-settling",
        data: {
          stage: "gm-action-checklist",
          phase: "gameplay-cycle-runtime",
        },
      };
      actionChecklist = await runCleanGmActionChecklist({
        frame,
        gmRead: gmRead.read,
        judgment: judgeUncertainty.judgment,
        checklistId: `gm-action-checklist-${randomUUID()}`,
      });
      if (actionChecklist.status === "accepted") {
        yield {
          type: "scene-settling",
          data: {
            stage: "stage4-execution",
            phase: "gameplay-cycle-runtime",
          },
        };
        stage4Execution = await (options.runStage4Execution ?? runCleanStage4Execution)({
          frame,
          checklist: actionChecklist.checklist,
          dialogueProvider: options.storytellerProvider ?? options.judgeProvider,
          generateDialogueRequest: options.stage4DialogueRequestGenerator,
          supportActorProvider: options.storytellerProvider ?? options.judgeProvider,
          generateSupportActorRequest: options.stage4SupportActorRequestGenerator,
          refreshFrameAfterReceipt: async ({ receipt }) => {
            const buildFrame = options.buildFrame ?? buildAuthoritativeSceneFrame;
            return buildFrame({
              ...turn,
              base: {
                ...turn.base,
                tick: receipt.result.tick,
                worldVersion: receipt.result.worldVersion,
                worldTimeMinutes: receipt.result.worldTimeMinutes,
              },
            });
          },
        });
        for (const event of stage4Execution.publicEvents) {
          yield event;
        }
      }
    }
  }
  yield {
    type: "scene-settling",
    data: {
      stage: "settled-turn-packet",
      phase: "gameplay-cycle-runtime",
    },
  };
  const postResolutionFrame = await buildPostResolutionFrameForSettlement({
    turn,
    stage4Execution: stage4Execution?.execution ?? null,
    buildFrame: options.buildFrame ?? buildAuthoritativeSceneFrame,
  });
  const publicIds = buildCleanPublicTurnIds(turn);
  const settledPacket = buildCleanSettledTurnPacket({
    turn,
    publicPacketId: publicIds.publicPacketId,
    frame,
    postResolutionFrame,
    gmRead: gmRead.read,
    judgment: judgeUncertainty?.judgment ?? null,
    oracleSettlement: oracleSettlement?.status === "settled"
      ? oracleSettlement.settlement
      : null,
    actionChecklist: actionChecklist?.status === "accepted" ? actionChecklist.checklist : null,
    stage4Execution: stage4Execution?.execution ?? null,
  });
  const narratorView = buildCleanNarratorView(settledPacket);
  const narration = await (options.runNarration ?? runCleanNarration)({
    narratorView,
    provider: options.storytellerProvider ?? options.judgeProvider,
  });
  const narrativeText = narration.text;
  const projection = buildFrozenProjection({
    turn,
    frame,
    narrativeText,
    mutationApplied: settledPacket.result.mutationApplied,
  });
  yield {
    type: "narrative",
    data: {
      text: projection.narrativeText,
    },
  };
  yield {
    type: "finalizing_turn",
    data: {
      stage: "gameplay-cycle-runtime",
    },
  };
  const commit = await (options.commitTurn ?? commitCleanPlayerFacingTurn)({
    turn,
    projection,
    evidenceRefs: cleanEvidenceRefs({
      frame,
      gmRead,
      judgeUncertainty,
      oracleSettlement,
      actionChecklist,
      stage4Execution: stage4Execution?.execution ?? null,
      settledPacket,
    }),
    settlement: {
      settledPacket,
      narratorView,
    },
  });
  yield {
    type: "done",
    data: commit.doneBoundary,
  };
}

export async function* processCleanGameplayTurn(
  options: CleanGameplayRuntimeOptions,
): AsyncGenerator<CleanGameplayRuntimeEvent> {
  const turn = buildGameplayRuntimeTurnInput(options);
  yield* processCleanGameplayTurnFromInput({
    turn,
    judgeProvider: options.judgeProvider,
    storytellerProvider: options.storytellerProvider,
    gmReadCandidateGenerator: options.gmReadCandidateGenerator,
    judgeUncertaintyCandidateGenerator: options.judgeUncertaintyCandidateGenerator,
    oracleAdapter: options.oracleAdapter,
    stage4DialogueRequestGenerator: options.stage4DialogueRequestGenerator,
  });
}
