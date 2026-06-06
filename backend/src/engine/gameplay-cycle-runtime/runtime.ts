import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import type { ProviderConfig } from "../../ai/provider-registry.js";
import { getChatHistory, readCampaignConfig } from "../../campaign/index.js";
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
} from "./stage4-execution.js";
import {
  assertFrozenApiProjection,
  assertGameplayRuntimeTurnInput,
  type AuthoritativeSceneFrame,
  type CleanPlayerFacingTurnEvidenceRef,
  type CleanStage4ExecutionResult,
  type FrozenApiProjection,
  type GameplayRuntimeProviderSummary,
  type GameplayRuntimeTurnInput,
} from "./contracts.js";
import {
  commitCleanPlayerFacingTurn,
  type CommitCleanPlayerFacingTurnInput,
  type CleanPlayerFacingTurnCommitResult,
} from "./turn-persistence.js";

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
}

export interface CleanGameplayRuntimeCoreOptions {
  turn: GameplayRuntimeTurnInput;
  judgeProvider: ProviderConfig;
  buildFrame?: (turn: GameplayRuntimeTurnInput) => Promise<AuthoritativeSceneFrame>;
  gmReadCandidateGenerator?: GmReadCandidateGenerator;
  judgeUncertaintyCandidateGenerator?: JudgeUncertaintyCandidateGenerator;
  oracleAdapter?: OracleAdapter;
  runStage4Execution?: (input: {
    frame: AuthoritativeSceneFrame;
    checklist: NonNullable<GmActionChecklistRunResult["checklist"]>;
  }) => Promise<CleanStage4ExecutionRunResult>;
  commitTurn?: (
    input: Omit<CommitCleanPlayerFacingTurnInput, "chat" | "store">,
  ) => Promise<CleanPlayerFacingTurnCommitResult>;
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
  worldVersion: number;
  worldTimeMinutes: number;
} {
  const row = getDb()
    .select({
      worldVersion: worldClocks.worldVersion,
      worldTimeMinutes: worldClocks.worldTimeMinutes,
    })
    .from(worldClocks)
    .where(eq(worldClocks.campaignId, campaignId))
    .get();
  return {
    worldVersion: row?.worldVersion ?? 0,
    worldTimeMinutes: row?.worldTimeMinutes ?? 0,
  };
}

export function buildGameplayRuntimeTurnInput(
  options: CleanGameplayRuntimeOptions,
): GameplayRuntimeTurnInput {
  const baseTick = readCampaignConfig(options.campaignId).currentTick ?? 0;
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
      tick: baseTick,
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
    idempotencyKey: `${options.campaignId}:${baseTick}:${clock.worldVersion}:${turnId}`,
  });
}

function narrativeFromFrame(
  frame: AuthoritativeSceneFrame,
  gmRead: GmReadRunResult,
  judgeUncertainty?: JudgeUncertaintyRunResult,
  oracleSettlement?: OracleSettlementRunResult,
  actionChecklist?: GmActionChecklistRunResult,
  stage4Execution?: CleanStage4ExecutionRunResult,
): string {
  if (gmRead.read.path === "clarification") {
    return `Нужно уточнение: ${gmRead.read.liveSceneQuestion}`;
  }
  if (oracleSettlement?.status === "settled" || oracleSettlement?.status === "settled_with_fallback") {
    return `Проверка неопределённости разрешена: ${oracleSettlement.settlement.visibleOutcome.selectedMeaning}`;
  }
  if (judgeUncertainty?.judgment.nextStep === "ask_clarification") {
    return `Нужно уточнение: ${judgeUncertainty.judgment.noRollReason?.explanation ?? gmRead.read.liveSceneQuestion}`;
  }
  if (judgeUncertainty?.judgment.nextStep === "block_no_mutation") {
    return `Это действие сейчас нельзя подтвердить: ${judgeUncertainty.judgment.noRollReason?.explanation ?? judgeUncertainty.judgment.checkRationale}`;
  }
  if (judgeUncertainty?.judgment.nextStep === "oracle_roll") {
    return `Нужна проверка неопределённости: ${judgeUncertainty.judgment.oracleAdmission?.question ?? judgeUncertainty.judgment.checkRationale}`;
  }
  if (actionChecklist?.status === "accepted") {
    const execution = stage4Execution?.execution;
    const movement = execution?.visibleResults.find((result) =>
      result.locationChange !== null
      && result.authority === "terminal_mutation_receipt"
    );
    if (movement?.locationChange) {
      return `Вы перемещаетесь в ${movement.locationChange.locationName}.`;
    }
    const route = execution?.visibleResults.find((result) =>
      result.authority === "route_check_receipt"
    );
    if (route) {
      return route.summary;
    }
    const failure = execution?.visibleResults.find((result) =>
      result.authority === "failure_receipt"
    );
    if (failure) {
      return `Это действие сейчас нельзя подтвердить: ${failure.summary}`;
    }
    return `Действие требует дальнейшего разрешения последствий: зафиксирован план из ${actionChecklist.checklist.steps.length} шаг(ов), но состояние мира ещё не изменено.`;
  }
  if (actionChecklist?.status === "fallback_no_mutation") {
    return `Нужно уточнение: ${actionChecklist.fallbackReason}`;
  }
  if (judgeUncertainty?.judgment.nextStep === "action_plan") {
    return `Действие требует разрешения последствий: ${judgeUncertainty.judgment.noRollReason?.explanation ?? judgeUncertainty.judgment.checkRationale}`;
  }
  if (judgeUncertainty?.judgment.nextStep === "combat_boundary") {
    return `Сцена требует боевого разрешения: ${judgeUncertainty.judgment.noRollReason?.explanation ?? judgeUncertainty.judgment.checkRationale}`;
  }
  const scene = frame.scene.currentScene.label;
  const location = frame.scene.currentLocation.label;
  const actors = frame.actors
    .filter((actor) => actor.role !== "player")
    .slice(0, 4)
    .map((actor) => actor.label);
  const actorText = actors.length > 0
    ? ` Видимые участники: ${actors.join(", ")}.`
    : "";
  return `Текущая сцена: ${scene} (${location}).${actorText}`;
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
    || input.oracleSettlement?.status === "settled_with_fallback"
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
  return refs;
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
      if (oracleSettlement.status === "settled" || oracleSettlement.status === "settled_with_fallback") {
        yield oracleSettlement.publicEvent;
        yield {
          type: "scene-settling",
          data: {
            stage: "oracle-settlement",
            phase: "gameplay-cycle-runtime",
          },
        };
      }
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
        });
        for (const event of stage4Execution.publicEvents) {
          yield event;
        }
      }
    }
  }
  const narrativeText = narrativeFromFrame(
    frame,
    gmRead,
    judgeUncertainty,
    oracleSettlement,
    actionChecklist,
    stage4Execution,
  );
  const projection = buildFrozenProjection({
    turn,
    frame,
    narrativeText,
    mutationApplied: stage4Execution?.execution?.mutationApplied ?? false,
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
    }),
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
    gmReadCandidateGenerator: options.gmReadCandidateGenerator,
    judgeUncertaintyCandidateGenerator: options.judgeUncertaintyCandidateGenerator,
    oracleAdapter: options.oracleAdapter,
  });
}
