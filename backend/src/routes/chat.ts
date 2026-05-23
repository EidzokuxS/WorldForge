import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import { parseLookupLogEntry, type ChatMessage } from "@worldforge/shared";
import { buildLookupHistoryMessages } from "../campaign/chat-history.js";
import {
  appendChatMessages,
  getChatHistory,
  getCampaignPremise,
  replaceChatMessage,
  createCheckpoint,
  pruneAutoCheckpoints,
  readCampaignConfig,
} from "../campaign/index.js";
import { clamp, getErrorStatus, getPlayerSafeErrorMessage } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import {
  parseBody,
  resolveStoryteller,
  resolveJudge,
  resolveEmbedder,
  requireLoadedCampaign,
  zodFirstError,
} from "./helpers.js";
import {
  chatActionBodySchema,
  chatEditBodySchema,
  chatHistoryQuerySchema,
  chatLookupBodySchema,
  chatOpeningBodySchema,
  chatRetryBodySchema,
  chatResumeBodySchema,
  chatUndoBodySchema,
} from "./schemas.js";
import {
  createLogger,
  runWithTurnContext,
  getTurnContext,
} from "../lib/index.js";
import { rootPino } from "../lib/logger-setup.js";
import {
  sha256Prefix,
  isDeltaType,
  getOrCreateAggregator,
  finalizeAggregators,
} from "../lib/sse-hash.js";
import {
  processOpeningScene,
  processTurn,
  resumePendingTurnNarration,
  captureSnapshot,
  restoreSnapshot,
  buildDoneBoundaryData,
  findAbandonedPreSettledTurnSaga,
  findPendingNarrationSaga,
  getSettledTurnPacket,
  hasPreparedSettledTurnPacketRecovery,
  NarrationRepairExhaustedError,
  PendingNarrationError,
  queuePostTurnSimulationProposals,
  recordAbandonedTurnRollback,
} from "../engine/index.js";
import { readWorldClock } from "../engine/living-world-authority.js";
import type {
  TurnSagaRecord,
  TurnEvent,
  TurnSnapshot,
  TurnSummary,
} from "../engine/index.js";
import {
  acceptDurableEventsByIds,
  drainPendingCommittedEventsByIds,
  embedAndUpdateEvent,
  isDurableEventProjectionAllowed,
  readTurnDurableEventIds,
  retractStoredEpisodicEvent,
} from "../vectors/episodic-events.js";
import {
  assertActiveTurnLease,
  clearLastTurnSnapshot,
  clearPendingRollbackIntent,
  endTurn,
  getLastTurnSnapshot,
  getLastTurnSnapshotMetadata,
  getPendingRollbackIntent,
  hasLiveTurnSnapshot,
  setLastTurnSnapshot,
  setPendingRollbackIntent,
  tryBeginTurn,
} from "../campaign/runtime-state.js";
import type { LastTurnSnapshotMetadata } from "../campaign/runtime-state.js";
import type { Settings } from "../settings/index.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import {
  generateImage,
  resolveImageProvider,
  buildScenePrompt,
  buildLocationPrompt,
  ensureImageDir,
  cacheImage,
  imageExists,
} from "../images/index.js";
import { runGroundedLookup, type GroundedLookupResult } from "../engine/grounded-lookup.js";
import {
  isSafePlayerFacingHyphenToken,
  sanitizePlayerFacingText,
  toPlayerFacingQuickActions,
} from "../engine/player-facing-events.js";
import {
  QuickActionOfferError,
  resolveSelectedQuickActionOffer,
} from "../engine/quick-action-offers.js";
import { withSafeTurnProgressPayload } from "../engine/turn-processor.js";

const log = createLogger("chat");

const app = new Hono();
type PostTurnRoute = "/chat/action" | "/chat/retry" | "/chat/resume";
type TerminalTurnEventType = "done" | "error";

function registerTurnAbortCleanup(args: {
  signal: AbortSignal;
  campaignId: string;
  route: string;
}): () => void {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    log.event("turn.abort.observed", {
      route: args.route,
      campaignId: args.campaignId,
    });
  };

  if (args.signal.aborted) {
    cleanup();
    return () => {};
  }

  args.signal.addEventListener("abort", cleanup, { once: true });
  return () => {
    args.signal.removeEventListener("abort", cleanup);
  };
}

/**
 * Rollback-critical work must finish before the turn is marked done.
 * Heavy world simulation is recorded as versioned proposals so player control
 * returns after the visible GM/narrator turn without allowing detached NPC or
 * faction LLM agents to mutate the world behind the `done` boundary.
 */
async function runRollbackCriticalPostTurn(
  _settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
  summary: TurnSummary,
  route: PostTurnRoute,
): Promise<void> {
  const db = (await import("../db/index.js")).getDb();
  const { players } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");

  acceptDurableEventsByIds(campaignId, summary.acceptedDurableEventIds);

  const player = db
    .select({
      currentLocationId: players.currentLocationId,
      currentSceneLocationId: players.currentSceneLocationId,
    })
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  const result = queuePostTurnSimulationProposals({
    campaignId,
    tick: summary.tick,
    judgeProvider,
    playerLocationId: player?.currentLocationId,
    playerSceneScopeId: player?.currentSceneLocationId ?? undefined,
    route,
    idempotencyKey: summary.idempotencyKey,
  });
  const actorSchedules = result.actorSchedules ?? [];
  log.event("simulation.proposals.queued", {
    campaignId,
    tick: summary.tick,
    baseWorldVersion: result.baseWorldVersion,
    proposalCount: result.queued.length,
    proposalTypes: result.queued.map((proposal) => proposal.proposalType),
    actorScheduleCount: actorSchedules.length,
    actorScheduleRoutes: actorSchedules.map((schedule) => ({
      actorId: schedule.actorId,
      route: schedule.route,
      reservation: schedule.reservation?.status ?? null,
      signals: schedule.signals.map((signal) => signal.type),
    })),
  });
}

function queueAuxiliaryPostTurnWork(
  settings: Settings,
  campaignId: string,
  _judgeProvider: ProviderConfig,
  summary: TurnSummary,
): void {
  // Capture current turn context (if any) so the detached IIFE below
  // can re-enter the same ALS frame. Without this, embedder/image
  // writes that happen asynchronously after the SSE stream closes
  // would emit log records with no turnId/campaignId mixin.
  const detachedCtx = getTurnContext();
  const body = async (): Promise<void> => {
    try {
      const emb = resolveEmbedder(settings);
      const embedderAvailable = !("error" in emb);

      const pendingCommittedEvents = drainPendingCommittedEventsByIds(
        campaignId,
        summary.acceptedDurableEventIds,
      );

      if (pendingCommittedEvents.length > 0 && embedderAvailable) {
        for (const event of pendingCommittedEvents) {
          try {
            await embedAndUpdateEvent(event.id, event.text, emb.resolved.provider);
          } catch (err) {
            log.warn("Failed to embed episodic event", err);
          }
        }
      }

      const imgProvider = resolveImageProvider(settings);
      if (!imgProvider) {
        return;
      }

      const acceptedEventIds = new Set(summary.acceptedDurableEventIds);
      const highImportanceEvents = summary.toolCalls
        .filter((tc) => tc.tool === "log_event")
        .filter((tc) => {
          const args = tc.args as Record<string, unknown>;
          if (typeof args.importance !== "number" || args.importance < 7) {
            return false;
          }
          const result = tc.result as Record<string, unknown> | undefined;
          const inner = result?.result as Record<string, unknown> | undefined;
          const eventId = inner?.eventId;
          return typeof eventId === "string" && acceptedEventIds.has(eventId);
        });

      if (highImportanceEvents.length > 0) {
        const firstEvent = highImportanceEvents[0];
        const eventArgs = firstEvent.args as Record<string, unknown>;
        const eventText = eventArgs.text as string;
        const eventId = (() => {
          const result = firstEvent.result as Record<string, unknown> | undefined;
          const inner = result?.result as Record<string, unknown> | undefined;
          return inner?.eventId as string | undefined;
        })();

        if (eventText && eventId && isDurableEventProjectionAllowed(eventId)) {
          const db2 = (await import("../db/index.js")).getDb();
          const { players: playersTable, locations: locsTable } = await import("../db/schema.js");
          const { eq: eq2 } = await import("drizzle-orm");

          const playerRow = db2
            .select({ currentLocationId: playersTable.currentLocationId })
            .from(playersTable)
            .where(eq2(playersTable.campaignId, campaignId))
            .get();

          let locationName = "Unknown";
          if (playerRow?.currentLocationId) {
            const loc = db2
              .select({ name: locsTable.name })
              .from(locsTable)
              .where(eq2(locsTable.id, playerRow.currentLocationId))
              .get();
            if (loc) locationName = loc.name;
          }

          const premise = getCampaignPremise(campaignId);
          const prompt = buildScenePrompt({
            eventText,
            locationName,
            premise,
            stylePrompt: settings.images.stylePrompt,
          });
          ensureImageDir(campaignId, "scenes");
          const data = await generateImage({
            prompt,
            provider: imgProvider.provider,
            model: imgProvider.model,
          });
          if (isDurableEventProjectionAllowed(eventId)) {
            cacheImage(campaignId, "scenes", `${eventId}.png`, data);
          }
        }
      }

      const revealedLocations = summary.toolCalls.filter((tc) => tc.tool === "reveal_location");
      for (const reveal of revealedLocations) {
        const result = reveal.result as Record<string, unknown> | undefined;
        const inner = result?.result as Record<string, unknown> | undefined;
        const locId = inner?.id as string | undefined;
        const args = reveal.args as Record<string, unknown>;
        const locName = args.name as string;
        const locTags = (args.tags as string[]) || [];

        if (locId && locName && !imageExists(campaignId, "locations", `${locId}.png`)) {
          const db2 = (await import("../db/index.js")).getDb();
          const { locations: locsTable } = await import("../db/schema.js");
          const { eq: eq2 } = await import("drizzle-orm");
          const currentLocation = db2
            .select({ id: locsTable.id })
            .from(locsTable)
            .where(eq2(locsTable.id, locId))
            .get();
          if (!currentLocation) {
            continue;
          }
          const premise = getCampaignPremise(campaignId);
          const prompt = buildLocationPrompt({
            locationName: locName,
            tags: locTags,
            premise,
            stylePrompt: settings.images.stylePrompt,
          });
          ensureImageDir(campaignId, "locations");
          const data = await generateImage({
            prompt,
            provider: imgProvider.provider,
            model: imgProvider.model,
          });
          const stillCurrentLocation = db2
            .select({ id: locsTable.id })
            .from(locsTable)
            .where(eq2(locsTable.id, locId))
            .get();
          if (!stillCurrentLocation) {
            continue;
          }
          cacheImage(campaignId, "locations", `${locId}.png`, data);
        }
      }
    } catch (err) {
      log.warn("Auxiliary post-turn work failed (non-blocking)", err);
    }
  };
  const runDetached = (): void => {
    if (detachedCtx) {
      // Re-enter the turn context so downstream log records still carry
      // turnId/campaignId/tick. role is cleared because this background
      // work is not scoped to any single LLM role.
      void runWithTurnContext({ ...detachedCtx, role: undefined }, body);
    } else {
      void body();
    }
  };

  // Defer the body itself, not only the await, so no synchronous DB or prompt
  // setup can run before the SSE generator reaches its final done event.
  setTimeout(runDetached, 0);
}

function durableEventMetadataFromDoneEvent(event: TurnEvent): {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
} {
  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { acceptedDurableEventIds: [], producedDurableEventIds: [] };
  }
  const record = data as Record<string, unknown>;
  const toIds = (value: unknown): string[] =>
    Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
      : [];
  return {
    acceptedDurableEventIds: toIds(record.acceptedDurableEventIds),
    producedDurableEventIds: toIds(record.producedDurableEventIds),
  };
}

function durableEventMetadataFromSettledSaga(
  campaignId: string,
  saga: Pick<TurnSagaRecord, "id"> | null | undefined,
): {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
} {
  if (!saga) {
    return { acceptedDurableEventIds: [], producedDurableEventIds: [] };
  }
  const packet = getSettledTurnPacket({ campaignId, sagaId: saga.id });
  return packet
    ? {
        acceptedDurableEventIds: packet.acceptedDurableEventIds,
        producedDurableEventIds: packet.producedDurableEventIds,
      }
    : { acceptedDurableEventIds: [], producedDurableEventIds: [] };
}

function sagaCanResumeNarration(
  saga: Pick<TurnSagaRecord, "campaignId" | "turnId" | "status" | "settledTurnPacketId"> | null | undefined,
): boolean {
  if (!saga) {
    return false;
  }
  if (saga.status !== "world_consequence_running") {
    return true;
  }
  return Boolean(
    saga.settledTurnPacketId
      || getSettledTurnPacket({ campaignId: saga.campaignId, turnId: saga.turnId })
      || hasPreparedSettledTurnPacketRecovery({ campaignId: saga.campaignId, turnId: saga.turnId }),
  );
}

function resumeTokenForSaga(
  saga: Pick<TurnSagaRecord, "id" | "campaignId" | "turnId">,
): string {
  return `resume_${sha256Prefix(`${saga.campaignId}:${saga.id}:${saga.turnId}`)}`;
}

function snapshotFileHashesFromProvenance(value: unknown): TurnSnapshot["fileHashes"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.stateDb !== "string"
    || typeof record.config !== "string"
    || typeof record.chatHistory !== "string"
  ) {
    return null;
  }
  return {
    stateDb: record.stateDb,
    config: record.config,
    chatHistory: record.chatHistory,
    vectors: typeof record.vectors === "string"
      ? record.vectors
      : record.vectors === null
        ? null
        : undefined,
  };
}

function turnSnapshotFromSagaProvenance(
  saga: Pick<TurnSagaRecord, "campaignId"> & { provenance?: Record<string, unknown> | null },
): TurnSnapshot | null {
  const value = saga.provenance?.preTurnSnapshot;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.snapshotId !== "string"
    || typeof record.bundleDir !== "string"
    || typeof record.capturedAt !== "number"
    || !Number.isFinite(record.capturedAt)
    || !(typeof record.capturedWorldVersion === "number" || record.capturedWorldVersion === null)
    || !(typeof record.capturedWorldTimeMinutes === "number" || record.capturedWorldTimeMinutes === null)
  ) {
    return null;
  }
  return {
    campaignId: saga.campaignId,
    snapshotId: record.snapshotId,
    bundleDir: record.bundleDir,
    capturedAt: record.capturedAt,
    capturedWorldVersion: record.capturedWorldVersion,
    capturedWorldTimeMinutes: record.capturedWorldTimeMinutes,
    fileHashes: snapshotFileHashesFromProvenance(record.fileHashes),
  };
}

function isOpeningSceneSaga(
  saga: Pick<TurnSagaRecord, "sourceAction"> & { provenance?: Record<string, unknown> | null },
): boolean {
  const provenance = saga.provenance;
  const sourceAction = isRecord(saga.sourceAction) ? saga.sourceAction : null;
  return provenance?.source === "opening_scene"
    || sourceAction?.kind === "opening_scene";
}

function chatHistoryLengthBeforeTurnFromSaga(
  saga: { provenance?: Record<string, unknown> | null },
): number | undefined {
  const value = saga.provenance?.chatHistoryLengthBeforeTurn;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pendingNarrationBlockResponse(
  c: Context,
  campaignId: string,
  message: string,
): Response | null {
  const pendingSaga = findPendingNarrationSaga({ campaignId });
  return pendingSaga
    ? c.json(pendingNarrationData(pendingSaga, message), 409)
    : null;
}

function noteTerminalTurnEvent(
  event: TurnEvent,
  current: TerminalTurnEventType | null,
): TerminalTurnEventType | null {
  return event.type === "done" || event.type === "error"
    ? event.type
    : current;
}

async function writeMissingTerminalTurnError(
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
  message: string,
): Promise<void> {
  await stream.writeSSE({
    event: "error",
    data: JSON.stringify({
      error: message,
      incompleteTurnStream: true,
    }),
  });
}

function turnSummaryFromDoneEvent(event: TurnEvent): TurnSummary | null {
  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const tick = typeof record.tick === "number" ? record.tick : null;
  if (tick === null) {
    return null;
  }
  const metadata = durableEventMetadataFromDoneEvent(event);
  const idempotencyKey =
    typeof record.idempotencyKey === "string" && record.idempotencyKey.trim()
      ? record.idempotencyKey
      : null;
  if (!idempotencyKey) {
    return null;
  }
  return {
    tick,
    idempotencyKey,
    oracleResult: null,
    toolCalls: [],
    acceptedDurableEventIds: metadata.acceptedDurableEventIds,
    producedDurableEventIds: metadata.producedDurableEventIds,
    narrativeText: "",
  };
}

async function retractDurableEventsByIds(
  campaignId: string,
  eventIds: readonly string[],
  route: string,
): Promise<void> {
  const uniqueIds = [...new Set(eventIds.filter((id) => id.trim().length > 0))];
  const errors: unknown[] = [];
  for (const eventId of uniqueIds) {
    try {
      await retractStoredEpisodicEvent({ campaignId, eventId });
    } catch (error) {
      errors.push(error);
      log.error("Failed to retract durable event during rollback", {
        campaignId,
        route,
        eventId,
        error,
      });
    }
  }
  if (uniqueIds.length > 0) {
    log.event("turn.rollback.durable-events-retracted", {
      route,
      count: uniqueIds.length,
      eventIds: uniqueIds,
      failedCount: errors.length,
    });
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Failed to retract ${errors.length} durable event(s) during ${route} rollback.`,
    );
  }
}

async function restoreSnapshotAndRetractDurableEvents(input: {
  campaignId: string;
  snapshot: TurnSnapshot;
  turnId?: string | null;
  eventIds: readonly string[];
  route: string;
}): Promise<void> {
  setPendingRollbackIntent({
    campaignId: input.campaignId,
    route: input.route,
    snapshot: input.snapshot,
    turnId: input.turnId ?? null,
    eventIds: input.eventIds,
  });
  await restoreSnapshot(input.campaignId, input.snapshot);
  await retractDurableEventsByIds(input.campaignId, input.eventIds, input.route);
  clearPendingRollbackIntent(input.campaignId);
}

async function restoreSnapshotAndRetractTurnDurableEvents(input: {
  campaignId: string;
  snapshot: TurnSnapshot;
  turnId: string;
  route: string;
}): Promise<string[]> {
  setPendingRollbackIntent({
    campaignId: input.campaignId,
    route: input.route,
    snapshot: input.snapshot,
    turnId: input.turnId,
    eventIds: [],
  });
  const eventIds = readTurnDurableEventIds(input.campaignId, input.turnId);
  await restoreSnapshotAndRetractDurableEvents({
    campaignId: input.campaignId,
    snapshot: input.snapshot,
    turnId: input.turnId,
    eventIds,
    route: input.route,
  });
  return eventIds;
}

async function finishPendingRollbackIntent(
  campaignId: string,
  route: string,
): Promise<void> {
  const intent = getPendingRollbackIntent(campaignId);
  if (!intent) return;
  const eventIds = intent.eventIds.length > 0 || !intent.turnId
    ? intent.eventIds
    : readTurnDurableEventIds(intent.campaignId, intent.turnId);
  if (intent.turnId && intent.eventIds.length === 0 && eventIds.length > 0) {
    setPendingRollbackIntent({
      campaignId: intent.campaignId,
      route: intent.route,
      snapshot: intent.snapshot,
      turnId: intent.turnId,
      eventIds,
    });
  }
  await restoreSnapshot(intent.campaignId, intent.snapshot);
  await retractDurableEventsByIds(
    intent.campaignId,
    eventIds,
    `${route}:pending-rollback`,
  );
  clearPendingRollbackIntent(campaignId);
  clearLastTurnSnapshot(campaignId);
  log.event("turn.rollback.intent-recovered", {
    campaignId,
    originalRoute: intent.route,
    recoveryRoute: route,
    eventCount: eventIds.length,
  });
}

async function recoverAbandonedPreSettledTurnBeforeNewWork(
  campaignId: string,
  route: string,
): Promise<void> {
  await finishPendingRollbackIntent(campaignId, route);
  const abandonedSaga = findAbandonedPreSettledTurnSaga({ campaignId })
    ?? (() => {
      const pendingSaga = findPendingNarrationSaga({ campaignId });
      return pendingSaga?.status === "world_consequence_running"
        && !sagaCanResumeNarration(pendingSaga)
        ? pendingSaga
        : null;
    })();
  if (!abandonedSaga) return;
  if (abandonedSaga.status === "world_consequence_running" && sagaCanResumeNarration(abandonedSaga)) {
    return;
  }

  const snapshot = turnSnapshotFromSagaProvenance(abandonedSaga);
  if (!snapshot) {
    if (isOpeningSceneSaga(abandonedSaga)) {
      const rollbackEventIds = readTurnDurableEventIds(campaignId, abandonedSaga.turnId);
      await retractDurableEventsByIds(campaignId, rollbackEventIds, route);
      clearLastTurnSnapshot(campaignId);
      recordAbandonedTurnRollback({
        saga: abandonedSaga,
        reason:
          "Abandoned opening scene setup was tombstoned before any settled packet was available.",
      });
      log.event("turn.abandoned-pre-settled.opening-tombstoned", {
        campaignId,
        route,
        sagaId: abandonedSaga.id,
        turnId: abandonedSaga.turnId,
        status: abandonedSaga.status,
        retractedDurableEventCount: rollbackEventIds.length,
      });
      return;
    }
    throw new Error(
      `Campaign ${campaignId} has abandoned pre-settled turn ${abandonedSaga.turnId} without a restorable pre-turn snapshot.`,
    );
  }

  const rollbackEventIds = await restoreSnapshotAndRetractTurnDurableEvents({
    campaignId,
    snapshot,
    turnId: abandonedSaga.turnId,
    route,
  });
  clearLastTurnSnapshot(campaignId);
  recordAbandonedTurnRollback({
    saga: abandonedSaga,
    reason: "Abandoned pre-settled turn was rolled back from its pre-turn snapshot after restart.",
  });
  log.event("turn.abandoned-pre-settled.recovered", {
    campaignId,
    route,
    sagaId: abandonedSaga.id,
    turnId: abandonedSaga.turnId,
    status: abandonedSaga.status,
    retractedDurableEventCount: rollbackEventIds.length,
  });
}

function durableEventIdsForBoundary(
  boundary: Pick<LastTurnSnapshotMetadata, "acceptedDurableEventIds" | "producedDurableEventIds">,
): string[] {
  return [
    ...new Set([
      ...boundary.acceptedDurableEventIds,
      ...boundary.producedDurableEventIds,
    ].map((id) => id.trim()).filter(Boolean)),
  ];
}

function buildOnPostTurn(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
  route: PostTurnRoute,
  onRollbackCriticalSummary?: (summary: TurnSummary) => void,
): ((summary: TurnSummary) => Promise<void>) | undefined {
  return async (summary: TurnSummary) => {
    assertActiveTurnLease(campaignId);
    await runRollbackCriticalPostTurn(settings, campaignId, judgeProvider, summary, route);
    onRollbackCriticalSummary?.(summary);
  };
}

function queueAuxiliaryPostDoneWork(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
  event: TurnEvent,
  summary: TurnSummary | null,
): void {
  const auxiliarySummary = summary ?? turnSummaryFromDoneEvent(event);
  if (!auxiliarySummary) {
    return;
  }
  queueAuxiliaryPostTurnWork(settings, campaignId, judgeProvider, auxiliarySummary);
}

function createPostTurnHooks(input: {
  settings: Settings;
  campaignId: string;
  judgeProvider: ProviderConfig;
  route: PostTurnRoute;
  playerAction?: string;
  chatHistoryLengthBeforeTurn?: number;
}): {
  onPostTurn: ((summary: TurnSummary) => Promise<void>) | undefined;
  onDone: (event: TurnEvent, snapshot?: TurnSnapshot | null) => void;
} {
  let rollbackCriticalSummary: TurnSummary | null = null;
  return {
    onPostTurn: buildOnPostTurn(
      input.settings,
      input.campaignId,
      input.judgeProvider,
      input.route,
      (summary) => {
        rollbackCriticalSummary = summary;
      },
    ),
    onDone: (event, snapshot) => {
      assertActiveTurnLease(input.campaignId);
      const existingMetadata = getLastTurnSnapshotMetadata(input.campaignId);
      const playerAction = input.playerAction ?? existingMetadata.playerAction;
      const chatHistoryLengthBeforeTurn =
        input.chatHistoryLengthBeforeTurn ?? existingMetadata.chatHistoryLengthBeforeTurn;
      const metadata = {
        ...durableEventMetadataFromDoneEvent(event),
        playerAction,
        chatHistoryLengthBeforeTurn,
        chatHistoryLengthAfterTurn: playerAction
          ? getChatHistory(input.campaignId).length
          : existingMetadata.chatHistoryLengthAfterTurn,
      };
      if (snapshot) {
        setLastTurnSnapshot(input.campaignId, snapshot, metadata);
      } else {
        const existingSnapshot = getLastTurnSnapshot(input.campaignId);
        if (existingSnapshot) {
          setLastTurnSnapshot(input.campaignId, existingSnapshot, metadata);
        }
      }
      queueAuxiliaryPostDoneWork(
        input.settings,
        input.campaignId,
        input.judgeProvider,
        event,
        rollbackCriticalSummary,
      );
    },
  };
}

function isWholeNonNegativeNumber(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function getLiveGameplayBoundaryAtTail(
  campaignId: string,
): LastTurnSnapshotMetadata | null {
  if (!hasLiveTurnSnapshot(campaignId)) {
    return null;
  }

  const metadata = getLastTurnSnapshotMetadata(campaignId);
  if (
    !metadata.playerAction
    || !isWholeNonNegativeNumber(metadata.chatHistoryLengthBeforeTurn)
    || !isWholeNonNegativeNumber(metadata.chatHistoryLengthAfterTurn)
    || metadata.chatHistoryLengthAfterTurn <= metadata.chatHistoryLengthBeforeTurn
  ) {
    return null;
  }

  const history = getChatHistory(campaignId);
  if (history.length !== metadata.chatHistoryLengthAfterTurn) {
    return null;
  }

  const userMessage = history[metadata.chatHistoryLengthBeforeTurn];
  const assistantMessage = history[metadata.chatHistoryLengthAfterTurn - 1];
  if (
    userMessage?.role !== "user"
    || userMessage.content !== metadata.playerAction
    || assistantMessage?.role !== "assistant"
    || parseLookupLogEntry(assistantMessage.content)
  ) {
    return null;
  }

  return metadata;
}

function campaignHasAssistantMessages(campaignId: string): boolean {
  return getChatHistory(campaignId).some(
    (message) => message.role === "assistant" && !parseLookupLogEntry(message.content),
  );
}

async function writeTurnEventSSE(
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
  event: { type: string; data: unknown },
): Promise<void> {
  const playerFacingEvent = toPlayerFacingTurnEvent(event);
  if (!playerFacingEvent) {
    log.event("sse.emit.skipped", {
      type: event.type,
      reason: "player_boundary_private_payload",
    });
    return;
  }
  const eventName = playerFacingEvent.type;
  const dataStr =
    typeof playerFacingEvent.data === "string" ? playerFacingEvent.data : JSON.stringify(playerFacingEvent.data);

  // Phase 58-03: hot-path instrumentation — per Codex review, avoid copying
  // full event.data into the log record. Delta/text-delta chunks are
  // aggregated into one `sse.stream.aggregate` event per stream end;
  // every other SSE payload emits a single record with type, byteLength,
  // and a short sha256 prefix so operators can correlate with captured
  // traffic without duplicating prose in the JSONL.
  const ctx = getTurnContext();
  if (ctx && isDeltaType(playerFacingEvent.type)) {
    getOrCreateAggregator(ctx.turnId, playerFacingEvent.type).record(dataStr);
  } else {
    log.event("sse.emit", {
      type: playerFacingEvent.type,
      byteLength: Buffer.byteLength(dataStr, "utf8"),
      sha256Prefix: sha256Prefix(dataStr),
    });
  }

  await stream.writeSSE({
    event: eventName,
    data: dataStr,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function omitRecordKeys(
  value: unknown,
  keys: readonly string[],
): unknown {
  if (!isRecord(value)) return value;
  const blocked = new Set(keys);
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !blocked.has(key)),
  );
}

function isPlayerSafeStateUpdate(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.type === "location_change";
}

function isUnsafeSseRefLike(value: string): boolean {
  const trimmed = value.trim();
  const leadingHyphenToken = trimmed.match(/^[a-z]+-[a-z0-9._:-]*/iu)?.[0];
  if (leadingHyphenToken && isSafePlayerFacingHyphenToken(leadingHyphenToken)) {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    || /^(?:actor|campaign|edge|faction|item|loc|location|npc|player|scene|event|knowledge|authority|route|movement|tool|tool-result|forecast|world)[-:]/i.test(trimmed);
}

function playerSafeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text || isUnsafeSseRefLike(text)) return undefined;
  const sanitized = sanitizePlayerFacingText(text);
  return sanitized === text ? sanitized : undefined;
}

function playerSafeLocationChange(value: unknown): Record<string, unknown> | null {
  if (!isPlayerSafeStateUpdate(value)) return null;
  const locationName = playerSafeText(value.locationName);
  const path = Array.isArray(value.path)
    ? value.path.flatMap((entry) => {
        const safe = playerSafeText(entry);
        return safe ? [safe] : [];
      })
    : undefined;
  return {
    type: "location_change",
    ...(locationName ? { locationName } : {}),
    ...(typeof value.travelCost === "number" && Number.isFinite(value.travelCost)
      ? { travelCost: value.travelCost }
      : {}),
    ...(path && path.length > 0 ? { path } : {}),
  };
}

function playerSafeAutoCheckpoint(value: unknown): Record<string, unknown> {
  const record = isRecord(value) ? value : {};
  const reason = playerSafeText(record.reason);
  return reason ? { reason } : { reason: "Checkpoint available" };
}

function toPlayerFacingChatMessage(message: ChatMessage): Pick<ChatMessage, "role" | "content"> {
  return {
    role: message.role,
    content: sanitizePlayerFacingText(message.content, { preserveWhitespace: true }),
  };
}

function toPlayerFacingLookupResult(lookup: GroundedLookupResult): GroundedLookupResult {
  return {
    lookupKind: lookup.lookupKind,
    subject: sanitizePlayerFacingText(lookup.subject, { preserveWhitespace: true }),
    answer: sanitizePlayerFacingText(lookup.answer, { preserveWhitespace: true }),
    citations: lookup.citations.map((citation) => ({
      kind: citation.kind,
      label: sanitizePlayerFacingText(citation.label, { preserveWhitespace: true }),
      excerpt: sanitizePlayerFacingText(citation.excerpt, { preserveWhitespace: true }),
    })),
    uncertaintyNotes: lookup.uncertaintyNotes.map((note) =>
      sanitizePlayerFacingText(note, { preserveWhitespace: true })),
    sceneImpact: sanitizePlayerFacingText(lookup.sceneImpact, { preserveWhitespace: true }),
  };
}

function playerSafeNarrative(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    return { text: sanitizePlayerFacingText(value, { preserveWhitespace: true }) };
  }
  if (!isRecord(value) || typeof value.text !== "string") return null;
  return {
    text: sanitizePlayerFacingText(value.text, { preserveWhitespace: true }),
  };
}

const PLAYER_FACING_TURN_RESOLUTION_KINDS = new Set([
  "status_read",
  "dialogue_outcome",
  "world_fact",
  "scene_beat",
  "state_mutation",
  "combat_transition",
  "direct_noop",
]);

const PLAYER_FACING_TURN_RESOLUTION_STATES = new Set([
  "observation_grounded",
  "mutated",
  "explicit_no_change",
  "explicit_no_combat",
]);

function playerSafeEnum(value: unknown, allowed: ReadonlySet<string>): string | undefined {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function playerSafeTurnResolution(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const kind = playerSafeEnum(value.kind, PLAYER_FACING_TURN_RESOLUTION_KINDS);
  const resolutionState = playerSafeEnum(value.resolutionState, PLAYER_FACING_TURN_RESOLUTION_STATES);
  if (!kind || !resolutionState || typeof value.combatIntent !== "boolean") {
    return null;
  }
  return {
    kind,
    resolutionState,
    combatIntent: value.combatIntent,
  };
}

function toPlayerFacingTurnEvent(
  event: { type: string; data: unknown },
): { type: string; data: unknown } | null {
  if (event.type === "text-delta") {
    return typeof event.data === "string"
      ? {
          type: event.type,
          data: sanitizePlayerFacingText(event.data, { preserveWhitespace: true }),
        }
      : null;
  }
  if (event.type === "narrative") {
    const data = playerSafeNarrative(event.data);
    return data ? { type: event.type, data } : null;
  }
  if (event.type === "scene-settling" || event.type === "finalizing_turn") {
    const safeEvent = withSafeTurnProgressPayload(event as TurnEvent);
    return { type: safeEvent.type, data: safeEvent.data };
  }
  if (event.type === "auto_checkpoint") {
    return { type: event.type, data: playerSafeAutoCheckpoint(event.data) };
  }
  if (event.type === "reasoning") {
    return null;
  }
  if (event.type === "oracle_result") {
    return {
      type: event.type,
      data: omitRecordKeys(event.data, ["reasoning", "rationale"]),
    };
  }
  if (event.type === "turn_resolution") {
    const data = playerSafeTurnResolution(event.data);
    return data ? { type: event.type, data } : null;
  }
  if (event.type === "done") {
    return {
      type: event.type,
      data: omitRecordKeys(event.data, [
        "acceptedDurableEventIds",
        "producedDurableEventIds",
      ]),
    };
  }
  if (event.type === "error") {
    return {
      type: event.type,
      data: omitRecordKeys(event.data, ["sagaId", "turnId"]),
    };
  }
  if (event.type === "state_update") {
    const data = playerSafeLocationChange(event.data);
    return data ? { type: event.type, data } : null;
  }
  if (event.type === "quick_actions") {
    const data = toPlayerFacingQuickActions(event.data, { allowProjected: true });
    return data ? { type: event.type, data } : null;
  }
  if (event.type === "lookup_result" && isRecord(event.data)) {
    return {
      type: event.type,
      data: toPlayerFacingLookupResult(event.data as unknown as GroundedLookupResult),
    };
  }
  return null;
}

function withTurnBoundaryMetadata(
  campaignId: string,
  event: TurnEvent,
): TurnEvent {
  if (event.type !== "done") {
    return event;
  }
  return {
    ...event,
    data: buildDoneBoundaryData(campaignId, event.data),
  };
}

async function writeRouteTurnEventSSE(
  campaignId: string,
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
  event: TurnEvent,
): Promise<void> {
  await writeTurnEventSSE(stream, withTurnBoundaryMetadata(campaignId, event));
}

function isNarrationLockConflict(error: unknown): boolean {
  return error instanceof Error && error.name === "TurnSagaLockConflictError";
}

function isPendingNarrationError(error: unknown): error is PendingNarrationError {
  return error instanceof PendingNarrationError
    || (error instanceof Error && error.name === "PendingNarrationError");
}

function pendingNarrationData(
  saga: Pick<TurnSagaRecord, "id" | "campaignId" | "turnId" | "status" | "settledTurnPacketId"> | null,
  message: string,
) {
  const resumable = sagaCanResumeNarration(saga);
  return {
    error: message,
    pendingNarration: true,
    resumable,
    status: saga?.status,
    resumeToken: resumable && saga ? resumeTokenForSaga(saga) : undefined,
  };
}

function pendingNarrationStatus(
  saga: Pick<TurnSagaRecord, "id" | "campaignId" | "turnId" | "status" | "settledTurnPacketId"> | null,
): { pendingNarration: true; resumable: boolean; status?: string; resumeToken?: string } | null {
  if (!saga) {
    return null;
  }
  const resumable = sagaCanResumeNarration(saga);

  return {
    pendingNarration: true,
    resumable,
    status: saga.status,
    resumeToken: resumable ? resumeTokenForSaga(saga) : undefined,
  };
}

async function streamPendingTurnNarration(args: {
  campaignId: string;
  saga: Pick<TurnSagaRecord, "id" | "campaignId" | "turnId" | "status" | "settledTurnPacketId">;
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> };
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ReturnType<typeof resolveEmbedder>;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
  onDone?: (event: TurnEvent) => void;
}): Promise<"resumed" | "pending"> {
  try {
    const generator = resumePendingTurnNarration({
      campaignId: args.campaignId,
      turnId: args.saga.turnId,
      storytellerProvider: args.storytellerProvider,
      storytellerTemperature: args.storytellerTemperature,
      storytellerMaxTokens: args.storytellerMaxTokens,
      embedderResult: args.embedderResult && !("error" in args.embedderResult)
        ? args.embedderResult
        : undefined,
      onPostTurn: args.onPostTurn,
    });

    let terminalEventType: "done" | "error" | null = null;
    for await (const event of generator) {
      if (event.type === "done" || event.type === "error") {
        terminalEventType = event.type;
      }
      if (event.type === "done") {
        args.onDone?.(event);
      }
      await writeRouteTurnEventSSE(args.campaignId, args.stream, event);
    }
    if (terminalEventType !== "done") {
      if (terminalEventType === "error") {
        return "pending";
      }
      await writeTurnEventSSE(args.stream, {
        type: "error",
        data: pendingNarrationData(
          args.saga,
          "Pending narration resume ended before a terminal event.",
        ),
      });
      return "pending";
    }
    return "resumed";
  } catch (error) {
    const message = isNarrationLockConflict(error)
      ? "Pending narration is already being completed by another worker."
      : getPlayerSafeErrorMessage(
          error,
          "Pending narration could not be completed yet. The settled turn state was preserved.",
        );
    if (!isNarrationLockConflict(error)) {
      log.error("Pending narration resume failed; preserving settled turn state", error);
    }
    await writeTurnEventSSE(args.stream, {
      type: "error",
      data: pendingNarrationData(args.saga, message),
    });
    return "pending";
  }
}

async function streamPendingNarrationBeforeRollback(args: {
  campaignId: string;
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> };
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ReturnType<typeof resolveEmbedder>;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
  onDone?: (event: TurnEvent) => void;
  pendingMessage: string;
}): Promise<"none" | "resumed" | "pending"> {
  const pending = findPendingNarrationSaga({ campaignId: args.campaignId });
  if (!pending) {
    return "none";
  }

  try {
    return await streamPendingTurnNarration({
      campaignId: args.campaignId,
      saga: pending,
      stream: args.stream,
      storytellerProvider: args.storytellerProvider,
      storytellerTemperature: args.storytellerTemperature,
      storytellerMaxTokens: args.storytellerMaxTokens,
      embedderResult: args.embedderResult,
      onPostTurn: args.onPostTurn,
      onDone: args.onDone,
    });
  } catch (resumeError) {
    log.error("Pending narration resume failed; preserving settled turn state", resumeError);
    await writeTurnEventSSE(args.stream, {
      type: "error",
      data: pendingNarrationData(pending, args.pendingMessage),
    });
    return "pending";
  }
}

async function streamNarrationRepairExhausted(args: {
  campaignId: string;
  pendingSaga?: Pick<TurnSagaRecord, "id" | "campaignId" | "turnId" | "status" | "settledTurnPacketId"> | null;
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> };
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ReturnType<typeof resolveEmbedder>;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
  onDone?: (event: TurnEvent) => void;
  message: string;
}): Promise<"none" | "resumed" | "pending"> {
  const pending = args.pendingSaga ?? findPendingNarrationSaga({ campaignId: args.campaignId });
  if (!pending) {
    await writeTurnEventSSE(args.stream, {
      type: "error",
      data: pendingNarrationData(null, args.message),
    });
    return "none";
  }

  const result = await streamPendingTurnNarration({
    campaignId: args.campaignId,
    saga: pending,
    stream: args.stream,
    storytellerProvider: args.storytellerProvider,
    storytellerTemperature: args.storytellerTemperature,
    storytellerMaxTokens: args.storytellerMaxTokens,
    embedderResult: args.embedderResult,
    onPostTurn: args.onPostTurn,
    onDone: args.onDone,
  });
  return result;
}

function toPersistedLookupKind(
  lookupKind: string,
  compareAgainst?: string,
): string {
  return lookupKind === "power_profile" && compareAgainst ? "compare" : lookupKind;
}

function buildLookupCommandText({
  lookupKind,
  subject,
  compareAgainst,
  question,
}: {
  lookupKind: string;
  subject: string;
  compareAgainst?: string;
  question?: string;
}): string {
  if (lookupKind === "power_profile") {
    const comparison = compareAgainst
      ? `/compare ${subject} vs ${compareAgainst}`
      : `/compare ${subject}`;
    return question ? `${comparison} :: ${question}` : comparison;
  }

  const lookupPrefixByKind: Record<string, string> = {
    world_canon_fact: "world",
    event_clarification: "event",
    character_canon_fact: "character",
  };
  const prefix = lookupPrefixByKind[lookupKind] ?? "character";
  const command = `/lookup ${prefix}: ${subject}`;
  return question ? `${command} :: ${question}` : command;
}

// -- GET /history -------------------------------------------------------------

app.get("/history", async (c) => {
  try {
    const query = chatHistoryQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: zodFirstError(query.error) }, 400);
    }

    const { campaignId } = query.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const premise = getCampaignPremise(campaignId);
    const messages = getChatHistory(campaignId).map(toPlayerFacingChatMessage);
    const pendingSaga = findPendingNarrationSaga({ campaignId });
    return c.json({
      messages,
      premise,
      hasLiveTurnSnapshot: Boolean(getLiveGameplayBoundaryAtTail(campaignId)),
      pendingNarration: pendingNarrationStatus(pendingSaga),
    });
  } catch (error) {
    return c.json(
      { error: getPlayerSafeErrorMessage(error, "Failed to read chat history.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /opening — Authoritative opening-scene generation via SSE ----------

app.post("/opening", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatOpeningBodySchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;
    await recoverAbandonedPreSettledTurnBeforeNewWork(campaignId, "/opening");

    const pendingBlock = pendingNarrationBlockResponse(
      c,
      campaignId,
      "An opening scene is already waiting for final narration. Resume it before starting a new opening.",
    );
    if (pendingBlock) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return pendingBlock;
    }

    if (campaignHasAssistantMessages(campaignId)) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "Opening scene already exists for this campaign." }, 409);
    }

    const settings = loadSettings();
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: stResult.error }, stResult.status);
    }

    const embedderResult = resolveEmbedder(settings);
    c.header("Cache-Control", "no-cache, no-transform");

    const turnId = randomUUID();
    const currentTick =
      readCampaignConfig(campaignId).currentTick ?? 0;

    return streamSSE(c, async (stream) => {
      const unregisterAbortCleanup = registerTurnAbortCleanup({
        signal: c.req.raw.signal,
        campaignId,
        route: "/opening",
      });
      try {
        await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
        const turnStart = Date.now();
        log.event("turn.begin", {
          route: "/opening",
          campaignId,
          tick: currentTick,
          storytellerProvider: {
            id: stResult.resolved.provider.id,
            model: stResult.resolved.provider.model,
            baseUrl: stResult.resolved.provider.baseUrl,
          },
        });

        let outcome: "success" | "error" = "success";
        try {
          const openingGenerator = processOpeningScene({
            campaignId,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
          });

          let terminalEventType: TerminalTurnEventType | null = null;
          for await (const event of openingGenerator) {
            terminalEventType = noteTerminalTurnEvent(event, terminalEventType);
            await writeRouteTurnEventSSE(campaignId, stream, event);
          }
          if (terminalEventType !== "done") {
            outcome = "error";
            if (!terminalEventType) {
              await writeMissingTerminalTurnError(
                stream,
                "Opening scene stream ended before a terminal event.",
              );
            }
          }
        } catch (error) {
          outcome = "error";
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              error: getPlayerSafeErrorMessage(error, "Opening scene generation failed."),
            }),
          });
        } finally {
          for (const agg of finalizeAggregators(turnId)) {
            log.event("sse.stream.aggregate", {
              type: agg.type,
              deltaCount: agg.deltaCount,
              totalBytes: agg.totalBytes,
              sha256OfConcatenated: agg.sha256OfConcatenated,
            });
          }
          log.event("turn.end", {
            route: "/opening",
            tick: currentTick,
            durationMs: Date.now() - turnStart,
            outcome,
          });
          try {
            rootPino.flush?.();
          } catch {
            // flush is best-effort; never surface as turn-end failure.
          }
          endTurn(campaignId);
          turnStartedForCampaign = null;
        }
        });
      } finally {
        unregisterAbortCleanup();
      }
    });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getPlayerSafeErrorMessage(error, "Opening request failed.") },
      getErrorStatus(error),
    );
  }
});

// -- POST / (legacy plain-text streaming) -------------------------------------

app.post("/", async (c) => {
  return c.json(
    {
      error: "Legacy POST /api/chat has been retired. Use /api/chat/action, /api/chat/opening, or /api/chat/lookup.",
    },
    410,
  );
});

// -- POST /action — Full turn cycle via SSE (Oracle + Storyteller + tools) ----

app.post("/action", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatActionBodySchema);
    if ("response" in result) return result.response;

    const { campaignId, playerAction: submittedPlayerAction, selectedQuickAction } = result.data;
    let playerAction = submittedPlayerAction;
    let compatibilityIntent = submittedPlayerAction;
    const compatibilityMethod = "";
    let canonicalSelectedQuickAction: typeof selectedQuickAction | {
      offerId: string;
      actionId: string;
      label: string;
      action: string;
      sourceEvidenceDigest: string;
    } | undefined = selectedQuickAction;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;
    await recoverAbandonedPreSettledTurnBeforeNewWork(campaignId, "/action");

    const settings = loadSettings();

    // Resolve Judge (required for Oracle)
    const judgeResult = resolveJudge(settings);
    if ("error" in judgeResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: judgeResult.error }, judgeResult.status);
    }

    // Resolve Storyteller (required for narration)
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: stResult.error }, stResult.status);
    }

    // Resolve Embedder (optional -- used for lore search)
    const embedderResult = resolveEmbedder(settings);

    const pendingBlock = pendingNarrationBlockResponse(
      c,
      campaignId,
      "A previous turn is still waiting for final narration. Resume it before sending a new action.",
    );
    if (pendingBlock) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return pendingBlock;
    }

    const currentTick =
      readCampaignConfig(campaignId).currentTick ?? 0;
    // Capture pre-turn authority before consuming optional UI offers so rollback
    // restores the same offer state if the turn fails before settlement.
    const chatHistoryLengthBeforeTurn = getChatHistory(campaignId).length;
    const snapshot = await captureSnapshot(campaignId);

    if (selectedQuickAction) {
      try {
        const currentWorldVersion = readWorldClock(campaignId).worldVersion;
        const resolvedQuickAction = resolveSelectedQuickActionOffer({
          campaignId,
          offerId: selectedQuickAction.offerId,
          actionId: selectedQuickAction.actionId,
          submittedAction: submittedPlayerAction,
          currentTick,
          currentWorldVersion,
        });
        playerAction = resolvedQuickAction.action;
        compatibilityIntent = resolvedQuickAction.action;
        canonicalSelectedQuickAction = resolvedQuickAction;
      } catch (error) {
        endTurn(campaignId);
        turnStartedForCampaign = null;
        if (error instanceof QuickActionOfferError) {
          const status = error.code === "expired" || error.code === "consumed" || error.code === "stale"
            ? 409
            : 400;
          return c.json({ error: error.message, code: error.code }, status);
        }
        throw error;
      }
    }

    // Auto-checkpoint before dangerous turns (HP <= 2)
    try {
      const db = (await import("../db/index.js")).getDb();
      const { players } = await import("../db/schema.js");
      const { eq } = await import("drizzle-orm");

      const player = db
        .select({ hp: players.hp })
        .from(players)
        .where(eq(players.campaignId, campaignId))
        .get();

      if (player && player.hp <= 2) {
        await createCheckpoint(campaignId, {
          name: "auto-danger",
          description: "Auto-save: low HP",
          auto: true,
        });
        await pruneAutoCheckpoints(campaignId, 3);
      }
    } catch (err) {
      log.warn("Auto-checkpoint failed (non-blocking)", err);
    }

    // Capture pre-turn snapshot for potential undo/retry

    c.header("Cache-Control", "no-cache, no-transform");

    const turnId = randomUUID();

    return streamSSE(c, async (stream) => {
      const unregisterAbortCleanup = registerTurnAbortCleanup({
        signal: c.req.raw.signal,
        campaignId,
        route: "/action",
      });
      try {
        await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
        const turnStart = Date.now();
        log.event("turn.begin", {
          route: "/action",
          campaignId,
          tick: currentTick,
          rawInput: playerAction,
          submittedInput: submittedPlayerAction,
          compatibilityFields: {
            intent: "mirrors rawInput",
            method: "empty",
          },
          selectedQuickAction: canonicalSelectedQuickAction ?? null,
          judgeProvider: {
            id: judgeResult.resolved.provider.id,
            model: judgeResult.resolved.provider.model,
            baseUrl: judgeResult.resolved.provider.baseUrl,
          },
          storytellerProvider: {
            id: stResult.resolved.provider.id,
            model: stResult.resolved.provider.model,
            baseUrl: stResult.resolved.provider.baseUrl,
          },
        });

        let outcome: "success" | "error" | "restored" | "pending_resumed" | "pending" = "success";
        let settledTurnRollbackShield = false;
        const postTurnHooks = createPostTurnHooks({
          settings,
          campaignId,
          judgeProvider: judgeResult.resolved.provider,
          route: "/chat/action",
          playerAction,
          chatHistoryLengthBeforeTurn,
        });
        try {
          const turnGenerator = processTurn({
            campaignId,
            turnId,
            preTurnSnapshot: snapshot,
            chatHistoryLengthBeforeTurn,
            playerAction,
            intent: compatibilityIntent,
            method: compatibilityMethod,
            judgeProvider: judgeResult.resolved.provider,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
            selectedQuickAction: canonicalSelectedQuickAction,
            onPostTurn: postTurnHooks.onPostTurn,
          });

          let terminalEventType: TerminalTurnEventType | null = null;
          for await (const event of turnGenerator) {
            // Reactive auto-checkpoint when HP drops to danger zone during turn
            if (event.type === "auto_checkpoint") {
              const detachedCtx = getTurnContext();
              const ckptBody = async (): Promise<void> => {
                try {
                  await createCheckpoint(campaignId, {
                    name: "auto-danger",
                    description: "Auto-save: HP dropped to danger zone",
                    auto: true,
                  });
                  await pruneAutoCheckpoints(campaignId, 3);
                } catch (err) {
                  log.warn("Reactive auto-checkpoint failed (non-blocking)", err);
                }
              };
              if (detachedCtx) {
                void runWithTurnContext({ ...detachedCtx, role: undefined }, ckptBody);
              } else {
                void ckptBody();
              }
            }

            if (event.type === "done") {
              settledTurnRollbackShield = true;
              postTurnHooks.onDone(event, snapshot);
            }
            terminalEventType = noteTerminalTurnEvent(event, terminalEventType);

            await writeRouteTurnEventSSE(campaignId, stream, event);
          }
          if (terminalEventType !== "done") {
            outcome = "error";
            if (!terminalEventType) {
              await writeMissingTerminalTurnError(
                stream,
                "Turn stream ended before a terminal event.",
              );
            }
          }
        } catch (error) {
          if (isPendingNarrationError(error)) {
            outcome = "pending_resumed";
            setLastTurnSnapshot(
              campaignId,
              snapshot,
              {
                ...durableEventMetadataFromSettledSaga(campaignId, error.pendingSaga),
                playerAction,
                chatHistoryLengthBeforeTurn,
                chatHistoryLengthAfterTurn: getChatHistory(campaignId).length,
              },
            );
            const result = await streamPendingTurnNarration({
              campaignId,
              saga: error.pendingSaga,
              stream,
              storytellerProvider: stResult.resolved.provider,
              storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
              storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
              embedderResult,
              onPostTurn: postTurnHooks.onPostTurn,
              onDone: (event) => postTurnHooks.onDone(event, snapshot),
            });
            if (result === "pending") {
              outcome = "pending";
            }
            return;
          }
          if (error instanceof NarrationRepairExhaustedError) {
            const pending = findPendingNarrationSaga({ campaignId });
            if (pending) {
              setLastTurnSnapshot(
                campaignId,
                snapshot,
                {
                  ...durableEventMetadataFromSettledSaga(campaignId, pending),
                  playerAction,
                  chatHistoryLengthBeforeTurn,
                  chatHistoryLengthAfterTurn: getChatHistory(campaignId).length,
                },
              );
            }
            const result = await streamNarrationRepairExhausted({
              campaignId,
              pendingSaga: pending,
              stream,
              storytellerProvider: stResult.resolved.provider,
              storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
              storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
              embedderResult,
              onPostTurn: postTurnHooks.onPostTurn,
              onDone: (event) => postTurnHooks.onDone(event, snapshot),
              message: getPlayerSafeErrorMessage(error, "Narration is pending repair."),
            });
            outcome = result === "resumed" ? "pending_resumed" : "pending";
            return;
          }
          const pendingResult = await streamPendingNarrationBeforeRollback({
            campaignId,
            stream,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult,
            onPostTurn: postTurnHooks.onPostTurn,
            onDone: (event) => postTurnHooks.onDone(event, snapshot),
            pendingMessage: getPlayerSafeErrorMessage(
              error,
              "Turn resolved but final narration is pending.",
            ),
          });
          if (pendingResult !== "none") {
            outcome = pendingResult === "resumed" ? "pending_resumed" : "pending";
            if (pendingResult === "pending") {
              const pending = findPendingNarrationSaga({ campaignId });
              if (pending) {
                setLastTurnSnapshot(
                  campaignId,
                  snapshot,
                  {
                    ...durableEventMetadataFromSettledSaga(campaignId, pending),
                    playerAction,
                    chatHistoryLengthBeforeTurn,
                    chatHistoryLengthAfterTurn: getChatHistory(campaignId).length,
                  },
                );
              }
            }
            return;
          }
          if (settledTurnRollbackShield) {
            outcome = "error";
            log.error("Turn failed after settled done boundary; preserving finalized state", error);
            try {
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                  error: getPlayerSafeErrorMessage(
                    error,
                    "Turn was already settled; the final state was preserved.",
                  ),
                  settled: true,
                  recoverable: true,
                }),
              });
            } catch (writeError) {
              log.warn("Unable to report post-settlement action transport failure", writeError);
            }
            return;
          }
          outcome = "restored";
          log.error("Turn processing failed; restoring pre-turn boundary", error);
          try {
            await restoreSnapshotAndRetractTurnDurableEvents({
              campaignId,
              snapshot,
              turnId,
              route: "/action",
            });
          } catch (restoreError) {
            outcome = "error";
            log.error("Failed to restore pre-turn boundary after action failure", restoreError);
          }
          clearLastTurnSnapshot(campaignId);
          const rollbackFailureFallback = outcome === "restored"
            ? "Turn processing failed. The pre-turn state was restored; please retry."
            : "Turn processing failed. Rollback recovery is still pending; wait a moment and retry.";
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              error: getPlayerSafeErrorMessage(
                error,
                rollbackFailureFallback,
              ),
            }),
          });
        } finally {
          for (const agg of finalizeAggregators(turnId)) {
            log.event("sse.stream.aggregate", {
              type: agg.type,
              deltaCount: agg.deltaCount,
              totalBytes: agg.totalBytes,
              sha256OfConcatenated: agg.sha256OfConcatenated,
            });
          }
          log.event("turn.end", {
            route: "/action",
            tick: currentTick,
            durationMs: Date.now() - turnStart,
            outcome,
          });
          // Per Gemini suggestion: flush transports before SSE closes so a
          // crash right after the final event still leaves a complete JSONL
          // on disk.
          try {
            rootPino.flush?.();
          } catch {
            // flush is best-effort; never surface as turn-end failure.
          }
          endTurn(campaignId);
          turnStartedForCampaign = null;
        }
        });
      } finally {
        unregisterAbortCleanup();
      }
    });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getPlayerSafeErrorMessage(error, "Action request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /resume — Complete a preserved pending narration turn ---------------

app.post("/resume", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatResumeBodySchema);
    if ("response" in result) return result.response;

    const { campaignId, resumeToken } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;
    await finishPendingRollbackIntent(campaignId, "/resume");

    const pendingSaga = findPendingNarrationSaga({ campaignId });
    if (!pendingSaga) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "No pending narration to resume." }, 400);
    }
    if (!resumeToken) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json(
        pendingNarrationData(
          pendingSaga,
          "Resume token is required for pending narration recovery.",
        ),
        400,
      );
    }
    if (resumeToken !== resumeTokenForSaga(pendingSaga)) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json(
        pendingNarrationData(
          pendingSaga,
          "Resume token no longer matches the pending narration turn.",
        ),
        409,
      );
    }
    if (!sagaCanResumeNarration(pendingSaga)) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json(
        pendingNarrationData(
          pendingSaga,
          "Pending turn has not reached a resumable narration boundary yet.",
        ),
        409,
      );
    }

    const settings = loadSettings();
    const judgeResult = resolveJudge(settings);
    if ("error" in judgeResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: judgeResult.error }, judgeResult.status);
    }
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: stResult.error }, stResult.status);
    }
    const embedderResult = resolveEmbedder(settings);
    const sagaPreTurnSnapshot = turnSnapshotFromSagaProvenance(pendingSaga);
    const sagaChatHistoryLengthBeforeTurn = chatHistoryLengthBeforeTurnFromSaga(pendingSaga);

    c.header("Cache-Control", "no-cache, no-transform");
    const turnId = randomUUID();
    const currentTick = readCampaignConfig(campaignId).currentTick ?? 0;
    return streamSSE(c, async (stream) => {
      const unregisterAbortCleanup = registerTurnAbortCleanup({
        signal: c.req.raw.signal,
        campaignId,
        route: "/resume",
      });
      try {
        await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
          try {
            const postTurnHooks = createPostTurnHooks({
              settings,
              campaignId,
              judgeProvider: judgeResult.resolved.provider,
              route: "/chat/resume",
              playerAction: pendingSaga.actionText ?? undefined,
              chatHistoryLengthBeforeTurn: sagaChatHistoryLengthBeforeTurn,
            });
            await streamPendingTurnNarration({
              campaignId,
              saga: pendingSaga,
              stream,
              storytellerProvider: stResult.resolved.provider,
              storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
              storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
              embedderResult,
              onPostTurn: postTurnHooks.onPostTurn,
              onDone: (event) => postTurnHooks.onDone(event, sagaPreTurnSnapshot),
            });
          } finally {
            endTurn(campaignId);
            turnStartedForCampaign = null;
          }
        });
      } finally {
        unregisterAbortCleanup();
      }
    });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getPlayerSafeErrorMessage(error, "Resume request failed.") },
      getErrorStatus(error),
    );
  }
});

// -- POST /lookup — Explicit grounded lookup via dedicated SSE -----------------

app.post("/lookup", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatLookupBodySchema);
    if ("response" in result) return result.response;

    const { campaignId, lookupKind, subject, compareAgainst, question } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;
    await recoverAbandonedPreSettledTurnBeforeNewWork(campaignId, "/lookup");
    const pendingBlock = pendingNarrationBlockResponse(
      c,
      campaignId,
      "A previous turn is still waiting for final narration. Resume it before running lookups.",
    );
    if (pendingBlock) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return pendingBlock;
    }

    c.header("Cache-Control", "no-cache, no-transform");

    return streamSSE(c, async (stream) => {
      try {
        const lookup = await runGroundedLookup({
          campaignId,
          lookupKind,
          subject,
          compareAgainst,
          question,
        });
        const playerFacingLookup = toPlayerFacingLookupResult(lookup);
        const persistedMessages = buildLookupHistoryMessages(
          buildLookupCommandText({
            lookupKind,
            subject: sanitizePlayerFacingText(subject, { preserveWhitespace: true }),
            compareAgainst: compareAgainst
              ? sanitizePlayerFacingText(compareAgainst, { preserveWhitespace: true })
              : compareAgainst,
            question: question
              ? sanitizePlayerFacingText(question, { preserveWhitespace: true })
              : question,
          }),
          toPersistedLookupKind(playerFacingLookup.lookupKind, compareAgainst),
          playerFacingLookup.answer,
        );

        appendChatMessages(campaignId, persistedMessages);

        await stream.writeSSE({
          event: "lookup_result",
          data: JSON.stringify(playerFacingLookup),
        });
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({ lookup: true }),
        });
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            error: getPlayerSafeErrorMessage(error, "Lookup failed."),
          }),
        });
      } finally {
        endTurn(campaignId);
        turnStartedForCampaign = null;
      }
    });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getPlayerSafeErrorMessage(error, "Lookup request failed.") },
      getErrorStatus(error),
    );
  }
});

// -- POST /retry — Re-roll the last turn with same player action --------------

app.post("/retry", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatRetryBodySchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;
    await recoverAbandonedPreSettledTurnBeforeNewWork(campaignId, "/retry");

    const settings = loadSettings();

    // Resolve Judge (required for Oracle)
    const judgeResult = resolveJudge(settings);
    if ("error" in judgeResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: judgeResult.error }, judgeResult.status);
    }

    // Resolve Storyteller (required for narration)
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: stResult.error }, stResult.status);
    }

    // Resolve Embedder (optional)
    const embedderResult = resolveEmbedder(settings);

    const pendingBlock = pendingNarrationBlockResponse(
      c,
      campaignId,
      "A previous turn is still waiting for final narration. Resume it before retrying.",
    );
    if (pendingBlock) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return pendingBlock;
    }

    const previousSnapshot = getLastTurnSnapshot(campaignId);
    if (!previousSnapshot) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "Nothing to retry." }, 400);
    }
    const previousBoundary = getLiveGameplayBoundaryAtTail(campaignId);
    if (!previousBoundary) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      clearLastTurnSnapshot(campaignId);
      return c.json({ error: "Nothing to retry." }, 400);
    }
    const playerAction = previousBoundary.playerAction;
    if (!playerAction) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "No player action found to retry." }, 400);
    }

    await restoreSnapshotAndRetractDurableEvents({
      campaignId,
      snapshot: previousSnapshot,
      eventIds: durableEventIdsForBoundary(previousBoundary),
      route: "/retry",
    });

    c.header("Cache-Control", "no-cache, no-transform");

    const turnId = randomUUID();
    const currentTick =
      readCampaignConfig(campaignId).currentTick ?? 0;

    return streamSSE(c, async (stream) => {
      const unregisterAbortCleanup = registerTurnAbortCleanup({
        signal: c.req.raw.signal,
        campaignId,
        route: "/retry",
      });
      try {
        await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
        const turnStart = Date.now();
        log.event("turn.begin", {
          route: "/retry",
          campaignId,
          tick: currentTick,
          playerAction,
          judgeProvider: {
            id: judgeResult.resolved.provider.id,
            model: judgeResult.resolved.provider.model,
            baseUrl: judgeResult.resolved.provider.baseUrl,
          },
          storytellerProvider: {
            id: stResult.resolved.provider.id,
            model: stResult.resolved.provider.model,
            baseUrl: stResult.resolved.provider.baseUrl,
          },
        });

        let outcome: "success" | "error" | "restored" | "pending_resumed" | "pending" = "success";
        let settledTurnRollbackShield = false;
        const postTurnHooks = createPostTurnHooks({
          settings,
          campaignId,
          judgeProvider: judgeResult.resolved.provider,
          route: "/chat/retry",
          playerAction,
          chatHistoryLengthBeforeTurn: previousBoundary.chatHistoryLengthBeforeTurn ?? undefined,
        });
        try {
          const turnGenerator = processTurn({
            campaignId,
            turnId,
            preTurnSnapshot: previousSnapshot,
            chatHistoryLengthBeforeTurn: previousBoundary.chatHistoryLengthBeforeTurn,
            playerAction,
            intent: playerAction, // Re-use player action as intent for retry
            method: "",
            judgeProvider: judgeResult.resolved.provider,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
            onPostTurn: postTurnHooks.onPostTurn,
          });

          let terminalEventType: TerminalTurnEventType | null = null;
          for await (const event of turnGenerator) {
            if (event.type === "auto_checkpoint") {
              const detachedCtx = getTurnContext();
              const ckptBody = async (): Promise<void> => {
                try {
                  await createCheckpoint(campaignId, {
                    name: "auto-danger",
                    description: "Auto-save: HP dropped to danger zone",
                    auto: true,
                  });
                  await pruneAutoCheckpoints(campaignId, 3);
                } catch (err) {
                  log.warn("Reactive auto-checkpoint failed (non-blocking)", err);
                }
              };
              if (detachedCtx) {
                void runWithTurnContext({ ...detachedCtx, role: undefined }, ckptBody);
              } else {
                void ckptBody();
              }
            }

            if (event.type === "done") {
              settledTurnRollbackShield = true;
              postTurnHooks.onDone(event, previousSnapshot);
            }
            terminalEventType = noteTerminalTurnEvent(event, terminalEventType);

            await writeRouteTurnEventSSE(campaignId, stream, event);
          }
          if (terminalEventType !== "done") {
            outcome = "error";
            if (!terminalEventType) {
              await writeMissingTerminalTurnError(
                stream,
                "Retry stream ended before a terminal event.",
              );
            }
          }
        } catch (error) {
          if (isPendingNarrationError(error)) {
            outcome = "pending_resumed";
            setLastTurnSnapshot(
              campaignId,
              previousSnapshot,
              {
                ...durableEventMetadataFromSettledSaga(campaignId, error.pendingSaga),
                playerAction,
                chatHistoryLengthBeforeTurn: previousBoundary.chatHistoryLengthBeforeTurn,
                chatHistoryLengthAfterTurn: getChatHistory(campaignId).length,
              },
            );
            const result = await streamPendingTurnNarration({
              campaignId,
              saga: error.pendingSaga,
              stream,
              storytellerProvider: stResult.resolved.provider,
              storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
              storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
              embedderResult,
              onPostTurn: postTurnHooks.onPostTurn,
              onDone: (event) => postTurnHooks.onDone(event, previousSnapshot),
            });
            if (result === "pending") {
              outcome = "pending";
            }
            return;
          }
          if (error instanceof NarrationRepairExhaustedError) {
            const pending = findPendingNarrationSaga({ campaignId });
            if (pending) {
              setLastTurnSnapshot(
                campaignId,
                previousSnapshot,
                {
                  ...durableEventMetadataFromSettledSaga(campaignId, pending),
                  playerAction,
                  chatHistoryLengthBeforeTurn: previousBoundary.chatHistoryLengthBeforeTurn,
                  chatHistoryLengthAfterTurn: getChatHistory(campaignId).length,
                },
              );
            }
            const result = await streamNarrationRepairExhausted({
              campaignId,
              pendingSaga: pending,
              stream,
              storytellerProvider: stResult.resolved.provider,
              storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
              storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
              embedderResult,
              onPostTurn: postTurnHooks.onPostTurn,
              onDone: (event) => postTurnHooks.onDone(event, previousSnapshot),
              message: getPlayerSafeErrorMessage(error, "Narration is pending repair."),
            });
            outcome = result === "resumed" ? "pending_resumed" : "pending";
            return;
          }
          const pendingResult = await streamPendingNarrationBeforeRollback({
            campaignId,
            stream,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult,
            onPostTurn: postTurnHooks.onPostTurn,
            onDone: (event) => postTurnHooks.onDone(event, previousSnapshot),
            pendingMessage: getPlayerSafeErrorMessage(
              error,
              "Retry resolved but final narration is pending.",
            ),
          });
          if (pendingResult !== "none") {
            outcome = pendingResult === "resumed" ? "pending_resumed" : "pending";
            if (pendingResult === "pending") {
              const pending = findPendingNarrationSaga({ campaignId });
              if (pending) {
                setLastTurnSnapshot(
                  campaignId,
                  previousSnapshot,
                  {
                    ...durableEventMetadataFromSettledSaga(campaignId, pending),
                    playerAction,
                    chatHistoryLengthBeforeTurn: previousBoundary.chatHistoryLengthBeforeTurn,
                    chatHistoryLengthAfterTurn: getChatHistory(campaignId).length,
                  },
                );
              }
            }
            return;
          }
          if (settledTurnRollbackShield) {
            outcome = "error";
            log.error("Retry failed after settled done boundary; preserving finalized state", error);
            try {
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                  error: getPlayerSafeErrorMessage(
                    error,
                    "Retry was already settled; the final state was preserved.",
                  ),
                  settled: true,
                  recoverable: true,
                }),
              });
            } catch (writeError) {
              log.warn("Unable to report post-settlement retry transport failure", writeError);
            }
            return;
          }
          outcome = "restored";
          try {
            await restoreSnapshotAndRetractTurnDurableEvents({
              campaignId,
              snapshot: previousSnapshot,
              turnId,
              route: "/retry",
            });
          } catch (restoreError) {
            outcome = "error";
            log.error("Failed to restore pre-turn boundary after retry failure", restoreError);
          }
          clearLastTurnSnapshot(campaignId);
          const rollbackFailureFallback = outcome === "restored"
            ? "Retry failed. The previous turn state was restored."
            : "Retry failed. Rollback recovery is still pending; wait a moment and retry.";
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              error: getPlayerSafeErrorMessage(
                error,
                rollbackFailureFallback,
              ),
            }),
          });
        } finally {
          for (const agg of finalizeAggregators(turnId)) {
            log.event("sse.stream.aggregate", {
              type: agg.type,
              deltaCount: agg.deltaCount,
              totalBytes: agg.totalBytes,
              sha256OfConcatenated: agg.sha256OfConcatenated,
            });
          }
          log.event("turn.end", {
            route: "/retry",
            tick: currentTick,
            durationMs: Date.now() - turnStart,
            outcome,
          });
          try {
            rootPino.flush?.();
          } catch {
            // flush is best-effort; never surface as turn-end failure.
          }
          endTurn(campaignId);
          turnStartedForCampaign = null;
        }
        });
      } finally {
        unregisterAbortCleanup();
      }
    });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getPlayerSafeErrorMessage(error, "Retry request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /undo — Revert last action+response pair ----------------------------

app.post("/undo", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatUndoBodySchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;
    await recoverAbandonedPreSettledTurnBeforeNewWork(campaignId, "/undo");
    const pendingBlock = pendingNarrationBlockResponse(
      c,
      campaignId,
      "A previous turn is still waiting for final narration. Resume it before undoing.",
    );
    if (pendingBlock) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return pendingBlock;
    }

    const previousSnapshot = getLastTurnSnapshot(campaignId);
    if (!previousSnapshot) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "Nothing to undo." }, 400);
    }
    const previousBoundary = getLiveGameplayBoundaryAtTail(campaignId);
    if (!previousBoundary) {
      clearLastTurnSnapshot(campaignId);
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "Nothing to undo." }, 400);
    }

    // Restore pre-turn game state
    await restoreSnapshotAndRetractDurableEvents({
      campaignId,
      snapshot: previousSnapshot,
      eventIds: durableEventIdsForBoundary(previousBoundary),
      route: "/undo",
    });

    // Single-step undo only
    clearLastTurnSnapshot(campaignId);

    const messagesRemoved = Math.max(
      0,
      (previousBoundary.chatHistoryLengthAfterTurn ?? 0)
        - (previousBoundary.chatHistoryLengthBeforeTurn ?? 0),
    );

    endTurn(campaignId);
    turnStartedForCampaign = null;
    return c.json({ ok: true, messagesRemoved });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getPlayerSafeErrorMessage(error, "Undo request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /edit — Edit an assistant message content ---------------------------

app.post("/edit", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatEditBodySchema);
    if ("response" in result) return result.response;

    const { campaignId, messageIndex, newContent } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;
    await recoverAbandonedPreSettledTurnBeforeNewWork(campaignId, "/edit");
    const pendingBlock = pendingNarrationBlockResponse(
      c,
      campaignId,
      "A previous turn is still waiting for final narration. Resume it before editing chat history.",
    );
    if (pendingBlock) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return pendingBlock;
    }

    const success = replaceChatMessage(
      campaignId,
      messageIndex,
      newContent
    );

    if (!success) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json(
        { error: "Invalid message index or not an assistant message." },
        400
      );
    }

    endTurn(campaignId);
    turnStartedForCampaign = null;
    return c.json({ ok: true });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getPlayerSafeErrorMessage(error, "Edit request failed.") },
      getErrorStatus(error)
    );
  }
});

export default app;
