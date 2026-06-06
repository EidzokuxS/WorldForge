import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import type { ProviderConfig } from "../../ai/provider-registry.js";
import { getChatHistory, readCampaignConfig } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { worldClocks } from "../../db/schema.js";
import { buildAuthoritativeSceneFrame } from "./frame.js";
import {
  runCleanGmRead,
  type GmReadCandidateGenerator,
  type GmReadRunResult,
} from "./gm-read.js";
import {
  assertFrozenApiProjection,
  assertGameplayRuntimeTurnInput,
  type AuthoritativeSceneFrame,
  type FrozenApiProjection,
  type GameplayRuntimeProviderSummary,
  type GameplayRuntimeTurnInput,
} from "./contracts.js";

export type CleanGameplayRuntimeEvent = {
  type:
    | "scene-settling"
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
}

export interface CleanGameplayRuntimeCoreOptions {
  turn: GameplayRuntimeTurnInput;
  judgeProvider: ProviderConfig;
  buildFrame?: (turn: GameplayRuntimeTurnInput) => Promise<AuthoritativeSceneFrame>;
  gmReadCandidateGenerator?: GmReadCandidateGenerator;
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

function narrativeFromFrame(frame: AuthoritativeSceneFrame, gmRead: GmReadRunResult): string {
  if (gmRead.read.path === "clarification") {
    return `Нужно уточнение: ${gmRead.read.liveSceneQuestion}`;
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
}): FrozenApiProjection {
  return assertFrozenApiProjection({
    version: "gameplay-runtime.frozen-api-projection.v1",
    runtime: "gameplay-cycle-runtime",
    campaignId: input.turn.campaignId,
    turnId: input.turn.turnId,
    frameId: input.frame.frameId,
    narrativeText: input.narrativeText,
    mutationApplied: false,
    settled: true,
  });
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
  const narrativeText = narrativeFromFrame(frame, gmRead);
  const projection = buildFrozenProjection({ turn, frame, narrativeText });
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
  yield {
    type: "done",
    data: {
      runtime: projection.runtime,
      turnId: projection.turnId,
      packetId: projection.frameId,
    },
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
  });
}
