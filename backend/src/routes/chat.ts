import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { createHash, randomUUID } from "node:crypto";
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
  resumePendingTurnNarration,
  captureSnapshot,
  restoreSnapshot,
  buildDoneBoundaryData,
  findPendingNarrationSaga,
  getSettledTurnPacket,
  hasPreparedSettledTurnPacketRecovery,
  hasTurnSagaSnapshotRecovery,
  NarrationRepairExhaustedError,
  PendingNarrationError,
} from "../engine/index.js";
import type {
  TurnSagaRecord,
  TurnEvent,
  TurnSnapshot,
  TurnSummary,
} from "../engine/index.js";
import {
  drainPendingCommittedEventsByIds,
  embedAndUpdateEvent,
  retractStoredEpisodicEvent,
  retractPendingCommittedEventsForTick,
} from "../vectors/episodic-events.js";
import {
  clearLastTurnSnapshot,
  endTurn,
  getLastTurnSnapshot,
  getLastTurnSnapshotMetadata,
  hasLiveTurnSnapshot,
  setLastTurnSnapshot,
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
import { runGroundedLookup } from "../engine/grounded-lookup.js";
import {
  isSafePlayerFacingHyphenToken,
  sanitizePlayerFacingText,
  toPlayerFacingLookupResult,
  toPlayerFacingQuickActions,
} from "../engine/player-facing-events.js";
import {
  isQuickActionSelectionError,
  resolveQuickActionSelection,
} from "../engine/quick-action-offers.js";
import { withSafeTurnProgressPayload } from "../engine/turn-processor.js";
import {
  processCleanGameplayTurn,
} from "../engine/gameplay-cycle-runtime/runtime.js";

const log = createLogger("chat");

const app = new Hono();
type TerminalTurnEventType = "done" | "error";
type CleanRuntimeDoneBoundaryData = {
  runtime: "gameplay-cycle-runtime";
  recordId: string;
  turnId: string;
  packetId: string;
  tick: number;
  worldVersion: number;
  worldTimeMinutes: number;
  chatHistoryLengthBeforeTurn: number;
  chatHistoryLengthAfterTurn: number;
  userMessageSha256: string;
  assistantMessageSha256: string;
};

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

        if (eventText && eventId) {
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
          cacheImage(campaignId, "scenes", `${eventId}.png`, data);
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

function sagaHasPreparedSettledPacketRecovery(
  saga: Pick<TurnSagaRecord, "campaignId" | "turnId" | "status">,
): boolean {
  return saga.status === "world_consequence_running"
    && hasPreparedSettledTurnPacketRecovery({
      campaignId: saga.campaignId,
      turnId: saga.turnId,
    });
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
      || sagaHasPreparedSettledPacketRecovery(saga)
      || hasTurnSagaSnapshotRecovery({ campaignId: saga.campaignId, turnId: saga.turnId }),
  );
}

function resumeTokenForSaga(
  saga: Pick<TurnSagaRecord, "id" | "campaignId" | "turnId">,
): string {
  return `resume_${sha256Prefix(`${saga.campaignId}:${saga.id}:${saga.turnId}`)}`;
}

const pendingNarrationRecoveryStates = [
  "resume_ready",
  "finalizing_turn",
  "recovering",
] as const;

const playerSafeErrorRecoveryStates = [
  ...pendingNarrationRecoveryStates,
  "pre_turn_snapshot_restored",
  "manual_recovery_required",
] as const;

type PendingNarrationRecoveryState = (typeof pendingNarrationRecoveryStates)[number];

type PendingNarrationPublicStatus = {
  pendingNarration: true;
  resumable: boolean;
  recoveryState: PendingNarrationRecoveryState;
  resumeToken?: string;
};

type PendingNarrationPublicData = PendingNarrationPublicStatus & {
  error: string;
};

function pendingNarrationRecoveryState(
  saga: Pick<TurnSagaRecord, "status"> | null,
  resumable: boolean,
): PendingNarrationRecoveryState {
  if (resumable) {
    return "resume_ready";
  }
  if (saga) {
    return "finalizing_turn";
  }
  return "recovering";
}

function pendingNarrationBlockResponse(
  c: Context,
  campaignId: string,
  message: string,
): Response | null {
  const pendingSaga = findPendingNarrationSaga({ campaignId });
  if (pendingSaga) {
    return c.json(pendingNarrationData(pendingSaga, message), 409);
  }
  return null;
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
  return {
    tick,
    idempotencyKey: `done-boundary:${tick}:${metadata.acceptedDurableEventIds.join(",")}`,
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
  route: "/action" | "/retry" | "/undo",
): Promise<void> {
  const uniqueIds = [...new Set(eventIds.filter((id) => id.trim().length > 0))];
  for (const eventId of uniqueIds) {
    await retractStoredEpisodicEvent({ campaignId, eventId });
  }
  if (uniqueIds.length > 0) {
    log.event("turn.rollback.durable-events-retracted", {
      route,
      count: uniqueIds.length,
      eventIds: uniqueIds,
    });
  }
}

function buildOnPostTurn(
  onRollbackCriticalSummary?: (summary: TurnSummary) => void,
): ((summary: TurnSummary) => Promise<void>) | undefined {
  return async (summary: TurnSummary) => {
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
  playerAction?: string;
  chatHistoryLengthBeforeTurn?: number;
}): {
  onPostTurn: ((summary: TurnSummary) => Promise<void>) | undefined;
  onDone: (event: TurnEvent, snapshot?: TurnSnapshot | null) => void;
} {
  let rollbackCriticalSummary: TurnSummary | null = null;
  return {
    onPostTurn: buildOnPostTurn(
      (summary) => {
        rollbackCriticalSummary = summary;
      },
    ),
    onDone: (event, snapshot) => {
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

function isCleanRuntimeDoneBoundaryData(value: unknown): value is CleanRuntimeDoneBoundaryData {
  return isRecord(value)
    && value.runtime === "gameplay-cycle-runtime"
    && typeof value.recordId === "string"
    && typeof value.turnId === "string"
    && typeof value.packetId === "string"
    && isWholeNonNegativeNumber(value.tick)
    && isWholeNonNegativeNumber(value.worldVersion)
    && isWholeNonNegativeNumber(value.worldTimeMinutes)
    && isWholeNonNegativeNumber(value.chatHistoryLengthBeforeTurn)
    && isWholeNonNegativeNumber(value.chatHistoryLengthAfterTurn)
    && typeof value.userMessageSha256 === "string"
    && typeof value.assistantMessageSha256 === "string";
}

function setCleanLastTurnSnapshot(input: {
  campaignId: string;
  snapshot: TurnSnapshot;
  playerAction: string;
  done: CleanRuntimeDoneBoundaryData;
}): void {
  setLastTurnSnapshot(input.campaignId, input.snapshot, {
    acceptedDurableEventIds: [],
    producedDurableEventIds: [],
    playerAction: input.playerAction,
    chatHistoryLengthBeforeTurn: input.done.chatHistoryLengthBeforeTurn,
    chatHistoryLengthAfterTurn: input.done.chatHistoryLengthAfterTurn,
    runtime: "gameplay-cycle-runtime",
    cleanRecordId: input.done.recordId,
    cleanPublicTurnId: input.done.turnId,
    cleanPublicPacketId: input.done.packetId,
    userMessageSha256: input.done.userMessageSha256,
    assistantMessageSha256: input.done.assistantMessageSha256,
  });
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
  if (
    metadata.userMessageSha256
    && sha256Hex(userMessage.content) !== metadata.userMessageSha256
  ) {
    return null;
  }
  if (
    metadata.assistantMessageSha256
    && sha256Hex(assistantMessage.content) !== metadata.assistantMessageSha256
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

function isPlayerSafeStateUpdate(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (
    value.type === "location_change"
    || value.type === "time_advance"
    || value.type === "player_local_condition"
  );
}

const playerLocalConditionResultKinds = ["applied", "cleared", "replaced", "already_present"] as const;
const playerLocalConditionOperations = ["apply", "clear"] as const;
const playerLocalConditionKeys = [
  "kneeling",
  "crouched",
  "prone",
  "taking_cover",
  "keeping_distance",
  "stepped_back",
  "braced",
  "hands_visible",
  "hands_raised",
  "gripping_held_item",
] as const;
const playerLocalConditionTargetKinds = [
  "current_scene",
  "visible_actor_distance",
  "visible_scene_anchor",
  "inventory_item_readiness",
] as const;

function safeEnumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T[number] : null;
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

function playerSafeStateUpdate(value: unknown): Record<string, unknown> | null {
  if (!isPlayerSafeStateUpdate(value)) return null;
  if (value.type === "time_advance") {
    const elapsedMinutes = value.elapsedMinutes;
    const reasonKind = value.reasonKind;
    if (
      typeof elapsedMinutes !== "number"
      || !Number.isInteger(elapsedMinutes)
      || elapsedMinutes < 1
      || elapsedMinutes > 60
    ) {
      return null;
    }
    if (
      reasonKind !== "brief_local_action"
      && reasonKind !== "wait"
      && reasonKind !== "short_rest"
    ) {
      return null;
    }
    return {
      type: "time_advance",
      elapsedMinutes,
      reasonKind,
    };
  }
  if (value.type === "player_local_condition") {
    const resultKind = safeEnumValue(value.resultKind, playerLocalConditionResultKinds);
    const operation = safeEnumValue(value.operation, playerLocalConditionOperations);
    const conditionKey = safeEnumValue(value.conditionKey, playerLocalConditionKeys);
    const targetKind = safeEnumValue(value.targetKind, playerLocalConditionTargetKinds);
    const actorLabel = playerSafeText(value.actorLabel);
    const conditionLabel = playerSafeText(value.conditionLabel);
    const anchorSceneLabel = playerSafeText(value.anchorSceneLabel);
    const anchorLocationLabel = playerSafeText(value.anchorLocationLabel);
    if (
      !resultKind
      || !operation
      || !conditionKey
      || !targetKind
      || actorLabel !== "Player"
      || !conditionLabel
      || value.conditionScope !== "current_scene"
      || !anchorSceneLabel
      || !anchorLocationLabel
      || value.claimStatus !== "visible_player_local_condition_only"
    ) {
      return null;
    }
    const targetLabel = value.targetLabel === null ? null : playerSafeText(value.targetLabel);
    if (value.targetLabel !== null && !targetLabel) return null;
    return {
      type: "player_local_condition",
      resultKind,
      actorLabel,
      operation,
      conditionKey,
      conditionLabel,
      conditionScope: "current_scene",
      anchorSceneLabel,
      anchorLocationLabel,
      targetKind,
      targetLabel,
      claimStatus: "visible_player_local_condition_only",
    };
  }
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

function playerSafeNarrative(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    return { text: sanitizePlayerFacingText(value, { preserveWhitespace: true }) };
  }
  if (!isRecord(value) || typeof value.text !== "string") return null;
  return {
    text: sanitizePlayerFacingText(value.text, { preserveWhitespace: true }),
  };
}

function playerSafeTurnResolution(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const kind = playerSafeText(value.kind);
  return kind ? { kind } : null;
}

function playerSafeOracleResult(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const outcome = playerSafeText(value.outcome);
  return outcome ? { outcome } : {};
}

function playerSafeDoneBoundary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const data: Record<string, unknown> = {};
  for (const key of [
    "tick",
    "worldVersion",
    "worldTimeMinutes",
    "chatHistoryLengthBeforeTurn",
    "chatHistoryLengthAfterTurn",
  ] as const) {
    const numberValue = value[key];
    if (typeof numberValue === "number" && Number.isFinite(numberValue)) {
      data[key] = numberValue;
    }
  }
  for (const key of ["opening", "resumed", "lookup", "mutationApplied", "settled"] as const) {
    const booleanValue = value[key];
    if (typeof booleanValue === "boolean") {
      data[key] = booleanValue;
    }
  }
  for (const key of ["recordId", "turnId", "packetId", "runtime"] as const) {
    const stringValue = playerSafeText(value[key]);
    if (stringValue) {
      data[key] = stringValue;
    }
  }
  return data;
}

function playerSafeErrorBoundary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const data: Record<string, unknown> = {};
  const error = playerSafeText(value.error);
  if (error) {
    data.error = error;
  }
  for (const key of [
    "incompleteTurnStream",
    "pendingNarration",
    "resumable",
    "settled",
    "recoverable",
    "restored",
    "retryable",
  ] as const) {
    const booleanValue = value[key];
    if (typeof booleanValue === "boolean") {
      data[key] = booleanValue;
    }
  }
  const recoveryState = typeof value.recoveryState === "string"
    && (playerSafeErrorRecoveryStates as readonly string[]).includes(value.recoveryState)
    ? value.recoveryState
    : undefined;
  if (recoveryState) {
    data.recoveryState = recoveryState;
  }
  const resumeToken = typeof value.resumeToken === "string" && value.resumeToken.startsWith("resume_")
    ? playerSafeText(value.resumeToken)
    : undefined;
  if (resumeToken) {
    data.resumeToken = resumeToken;
  }
  return data;
}

function toPlayerFacingTurnEvent(
  event: { type: string; data: unknown },
): { type: string; data: unknown } | null {
  if (event.type === "text-delta") {
    return typeof event.data === "string"
      ? {
          ...event,
          data: sanitizePlayerFacingText(event.data, { preserveWhitespace: true }),
        }
      : null;
  }
  if (event.type === "narrative") {
    const data = playerSafeNarrative(event.data);
    return data ? { ...event, data } : null;
  }
  if (event.type === "scene-settling" || event.type === "finalizing_turn") {
    return withSafeTurnProgressPayload(event as TurnEvent);
  }
  if (event.type === "auto_checkpoint") {
    return { ...event, data: playerSafeAutoCheckpoint(event.data) };
  }
  if (event.type === "reasoning") {
    return null;
  }
  if (event.type === "oracle_result") {
    return {
      ...event,
      data: playerSafeOracleResult(event.data),
    };
  }
  if (event.type === "turn_resolution") {
    const data = playerSafeTurnResolution(event.data);
    return data ? { ...event, data } : null;
  }
  if (event.type === "done") {
    return {
      ...event,
      data: playerSafeDoneBoundary(event.data),
    };
  }
  if (event.type === "error") {
    return {
      ...event,
      data: playerSafeErrorBoundary(event.data),
    };
  }
  if (event.type === "state_update") {
    const data = playerSafeStateUpdate(event.data);
    return data ? { ...event, data } : null;
  }
  if (event.type === "quick_actions") {
    const data = toPlayerFacingQuickActions(event.data);
    return data ? { ...event, data } : null;
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

function createRouteTurnEventWriter(
  campaignId: string,
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
): (event: TurnEvent) => Promise<void> {
  const pendingQuickActions: TurnEvent[] = [];

  return async (event: TurnEvent): Promise<void> => {
    if (event.type === "quick_actions") {
      pendingQuickActions.push(event);
      return;
    }

    if (event.type === "error") {
      pendingQuickActions.length = 0;
      await writeRouteTurnEventSSE(campaignId, stream, event);
      return;
    }

    if (event.type === "done") {
      const doneEvent = withTurnBoundaryMetadata(campaignId, event);
      for (const quickActionEvent of pendingQuickActions.splice(0)) {
        await writeTurnEventSSE(stream, quickActionEvent);
      }
      await writeTurnEventSSE(stream, doneEvent);
      return;
    }

    await writeRouteTurnEventSSE(campaignId, stream, event);
  };
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
): PendingNarrationPublicData {
  const resumable = sagaCanResumeNarration(saga);
  return {
    error: message,
    pendingNarration: true,
    resumable,
    recoveryState: pendingNarrationRecoveryState(saga, resumable),
    resumeToken: resumable && saga ? resumeTokenForSaga(saga) : undefined,
  };
}

function pendingNarrationStatus(
  saga: Pick<TurnSagaRecord, "id" | "campaignId" | "turnId" | "status" | "settledTurnPacketId"> | null,
): PendingNarrationPublicStatus | null {
  if (!saga) {
    return null;
  }
  const resumable = sagaCanResumeNarration(saga);

  return {
    pendingNarration: true,
    resumable,
    recoveryState: pendingNarrationRecoveryState(saga, resumable),
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
    const writeRouteEvent = createRouteTurnEventWriter(args.campaignId, args.stream);
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
      await writeRouteEvent(event);
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
      pendingNarration: pendingSaga ? pendingNarrationStatus(pendingSaga) : null,
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
          const writeRouteEvent = createRouteTurnEventWriter(campaignId, stream);
          for await (const event of openingGenerator) {
            terminalEventType = noteTerminalTurnEvent(event, terminalEventType);
            await writeRouteEvent(event);
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

    const { campaignId } = result.data;
    const submittedPlayerAction = result.data.playerAction;
    const quickActionHandle = result.data.quickActionHandle;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;

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
    const chatHistoryLengthBeforeTurn = getChatHistory(campaignId).length;
    const snapshot = await captureSnapshot(campaignId);

    c.header("Cache-Control", "no-cache, no-transform");

    const turnId = randomUUID();
    const currentTick =
      readCampaignConfig(campaignId).currentTick ?? 0;
    let playerAction = submittedPlayerAction;
    let quickActionSelection: Awaited<ReturnType<typeof resolveQuickActionSelection>> | null = null;
    if (quickActionHandle) {
      try {
        quickActionSelection = await resolveQuickActionSelection({
          campaignId,
          handle: quickActionHandle,
          currentTick,
        });
        playerAction = quickActionSelection.action;
      } catch (error) {
        endTurn(campaignId);
        turnStartedForCampaign = null;
        if (isQuickActionSelectionError(error)) {
          return c.json({ error: error.message }, error.statusCode === 400 ? 400 : 409);
        }
        return c.json(
          { error: getPlayerSafeErrorMessage(error, "Quick action selection failed.") },
          getErrorStatus(error),
        );
      }
    }
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
          submittedInput: quickActionSelection ? submittedPlayerAction : undefined,
          quickActionSelection: quickActionSelection
            ? {
              handle: quickActionSelection.handle,
              offerId: quickActionSelection.offerId,
              actionId: quickActionSelection.actionId,
              baseWorldVersion: quickActionSelection.baseWorldVersion,
            }
            : undefined,
          compatibilityFields: {
            intent: "mirrors rawInput",
            method: "empty",
          },
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
          playerAction,
          chatHistoryLengthBeforeTurn,
        });
        try {
          const turnGenerator = processCleanGameplayTurn({
            campaignId,
            submittedPlayerAction,
            normalizedPlayerAction: playerAction,
            quickActionSelection: quickActionSelection
              ? {
                handle: quickActionSelection.handle,
                offerId: quickActionSelection.offerId,
                actionId: quickActionSelection.actionId,
                baseWorldVersion: quickActionSelection.baseWorldVersion,
              }
              : null,
            judgeProvider: judgeResult.resolved.provider,
            storytellerProvider: stResult.resolved.provider,
            preTurnSnapshot: snapshot,
          });

          let terminalEventType: TerminalTurnEventType | null = null;
          const writeRouteEvent = createRouteTurnEventWriter(campaignId, stream);
          for await (const event of turnGenerator) {
            if (event.type === "done") {
              if (!isCleanRuntimeDoneBoundaryData(event.data)) {
                throw new Error("Clean runtime emitted an invalid committed done boundary.");
              }
              settledTurnRollbackShield = true;
              await postTurnHooks.onPostTurn?.(turnSummaryFromDoneEvent(event) ?? {
                tick: event.data.tick,
                idempotencyKey: `clean-done-boundary:${event.data.recordId}`,
                oracleResult: null,
                toolCalls: [],
                acceptedDurableEventIds: [],
                producedDurableEventIds: [],
                narrativeText: "",
              });
              postTurnHooks.onDone(event, snapshot);
              setCleanLastTurnSnapshot({
                campaignId,
                snapshot,
                playerAction,
                done: event.data,
              });
            }
            terminalEventType = noteTerminalTurnEvent(event, terminalEventType);

            await writeRouteEvent(event);
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
            await restoreSnapshot(campaignId, snapshot);
            const retractedEvents = await retractPendingCommittedEventsForTick(campaignId, currentTick);
            if (retractedEvents.length > 0) {
              log.event("turn.rollback.pending-committed-events-retracted", {
                route: "/action",
                tick: currentTick,
                count: retractedEvents.length,
              });
            }
          } catch (restoreError) {
            outcome = "error";
            log.error("Failed to restore pre-turn boundary after action failure", restoreError);
          }
          clearLastTurnSnapshot(campaignId);
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              error: getPlayerSafeErrorMessage(
                error,
                "Turn processing failed. The pre-turn state was restored; please retry.",
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

    const pendingSaga = findPendingNarrationSaga({ campaignId });
    if (!pendingSaga) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "No pending narration to resume." }, 400);
    }
    const legacyPendingSaga = pendingSaga;
    if (!resumeToken) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json(
        pendingNarrationData(
          legacyPendingSaga,
          "Resume token is required for pending narration recovery.",
        ),
        400,
      );
    }
    if (resumeToken !== resumeTokenForSaga(legacyPendingSaga)) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json(
        pendingNarrationData(
          legacyPendingSaga,
          "Resume token no longer matches the pending narration turn.",
        ),
        409,
      );
    }
    if (!sagaCanResumeNarration(legacyPendingSaga)) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json(
        pendingNarrationData(
          legacyPendingSaga,
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
            });
            await streamPendingTurnNarration({
              campaignId,
              saga: legacyPendingSaga,
              stream,
              storytellerProvider: stResult.resolved.provider,
              storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
              storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
              embedderResult,
              onPostTurn: postTurnHooks.onPostTurn,
              onDone: (event) => postTurnHooks.onDone(event),
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
        if (!playerFacingLookup) {
          throw new Error("Lookup result failed player-facing projection.");
        }
        const persistedMessages = buildLookupHistoryMessages(
          buildLookupCommandText({
            lookupKind,
            subject,
            compareAgainst,
            question,
          }),
          toPersistedLookupKind(lookup.lookupKind, compareAgainst),
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
    if (previousBoundary.runtime === "gameplay-cycle-runtime") {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "Clean runtime retry is not implemented yet." }, 409);
    }
    const playerAction = previousBoundary.playerAction;
    if (!playerAction) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "No player action found to retry." }, 400);
    }

    await restoreSnapshot(campaignId, previousSnapshot);
    await retractDurableEventsByIds(
      campaignId,
      previousBoundary.acceptedDurableEventIds,
      "/retry",
    );

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
          playerAction,
          chatHistoryLengthBeforeTurn: previousBoundary.chatHistoryLengthBeforeTurn ?? undefined,
        });
        try {
          const turnGenerator = processCleanGameplayTurn({
            campaignId,
            submittedPlayerAction: playerAction,
            normalizedPlayerAction: playerAction,
            quickActionSelection: null,
            judgeProvider: judgeResult.resolved.provider,
            storytellerProvider: stResult.resolved.provider,
            preTurnSnapshot: previousSnapshot,
          });

          let terminalEventType: TerminalTurnEventType | null = null;
          const writeRouteEvent = createRouteTurnEventWriter(campaignId, stream);
          for await (const event of turnGenerator) {
            if (event.type === "done") {
              if (!isCleanRuntimeDoneBoundaryData(event.data)) {
                throw new Error("Clean runtime emitted an invalid committed done boundary.");
              }
              settledTurnRollbackShield = true;
              await postTurnHooks.onPostTurn?.(turnSummaryFromDoneEvent(event) ?? {
                tick: event.data.tick,
                idempotencyKey: `clean-done-boundary:${event.data.recordId}`,
                oracleResult: null,
                toolCalls: [],
                acceptedDurableEventIds: [],
                producedDurableEventIds: [],
                narrativeText: "",
              });
              postTurnHooks.onDone(event, previousSnapshot);
              setCleanLastTurnSnapshot({
                campaignId,
                snapshot: previousSnapshot,
                playerAction,
                done: event.data,
              });
            }
            terminalEventType = noteTerminalTurnEvent(event, terminalEventType);

            await writeRouteEvent(event);
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
            await restoreSnapshot(campaignId, previousSnapshot);
            const retractedEvents = await retractPendingCommittedEventsForTick(campaignId, currentTick);
            if (retractedEvents.length > 0) {
              log.event("turn.rollback.pending-committed-events-retracted", {
                route: "/retry",
                tick: currentTick,
                count: retractedEvents.length,
              });
            }
          } catch (restoreError) {
            outcome = "error";
            log.error("Failed to restore pre-turn boundary after retry failure", restoreError);
          }
          clearLastTurnSnapshot(campaignId);
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              error: getPlayerSafeErrorMessage(
                error,
                "Retry failed. The previous turn state was restored.",
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
    await restoreSnapshot(campaignId, previousSnapshot);
    await retractDurableEventsByIds(
      campaignId,
      previousBoundary.acceptedDurableEventIds,
      "/undo",
    );

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
