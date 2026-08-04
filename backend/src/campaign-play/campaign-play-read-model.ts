import type {
  CampaignPlayJournalPage,
  CampaignPlaySseEvent,
  CampaignPlayState,
  CampaignPlayTurnReadResponse,
} from "@worldforge/shared";
import {
  campaignPlayJournalEntrySchema,
  campaignPlayJournalPageSchema,
  campaignPlayNarrationSchema,
  campaignPlayNarrationOperationSchema,
  campaignPlayPublicCharacterSchema,
  campaignPlayStateSchema,
  campaignPlayTurnReadResponseSchema,
} from "./contracts.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import {
  CampaignPlayTurnRepositoryError,
  createCampaignPlayTurnRepository,
  type LoadedCampaignPlayTurn,
} from "./campaign-play-turn-repository.js";
import { buildCampaignPlayOpeningOptions } from "./opening-options.js";
import { hashCampaignPlayProjection } from "./campaign-play-projection.js";

const PLAYER_ACCENTS = ["amber", "cobalt", "emerald", "rose", "slate", "violet"] as const;

export interface CampaignPlayReadModel {
  loadState(): CampaignPlayState;
  loadTurn(turnId: string): CampaignPlayTurnReadResponse;
  loadJournal(cursor: number, limit: number): CampaignPlayJournalPage;
  listTurnEvents(turnId: string, afterSequence: number): CampaignPlaySseEvent[];
}

function failCorrupt(message: string, cause?: unknown): never {
  throw new Error(message, { cause });
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    return failCorrupt(`Campaign Play ${label} contains invalid JSON.`, error);
  }
}

function hasInterruptedActorReplan(
  handle: CampaignPlayDatabaseHandle,
  turn: LoadedCampaignPlayTurn,
): boolean {
  if (turn.stage !== "primary_settled") return false;
  const row = handle.sqlite.prepare(`SELECT 1 AS interrupted
    FROM campaign_play_actor_jobs
    WHERE campaign_id = ? AND turn_id = ? AND stage = 'interrupted'
    LIMIT 1`).get(handle.campaignId, turn.turnId) as { interrupted: number } | undefined;
  return row?.interrupted === 1;
}

function publicTurn(handle: CampaignPlayDatabaseHandle, turn: LoadedCampaignPlayTurn) {
  const latest = turn.events.at(-1);
  if (!latest) failCorrupt("Campaign Play turn has no durable public events.");
  if (turn.nextEventSequence !== latest.sequence + 1) {
    failCorrupt("Campaign Play turn event sequence is inconsistent.");
  }
  if (turn.stage === "completed") {
    return {
      turnId: turn.turnId,
      turnKind: turn.turnKind,
      status: "completed" as const,
      progress: null,
      lastEventSequence: latest.sequence,
      retryEligible: false,
      submittedAt: turn.submittedAt,
      completedAt: turn.completedAt,
    };
  }
  if (turn.stage === "failed") {
    return {
      turnId: turn.turnId,
      turnKind: turn.turnKind,
      status: "failed" as const,
      progress: null,
      lastEventSequence: latest.sequence,
      retryEligible: false,
      submittedAt: turn.submittedAt,
      completedAt: turn.completedAt,
    };
  }
  if (turn.stage === "interrupted" || hasInterruptedActorReplan(handle, turn)) {
    return {
      turnId: turn.turnId,
      turnKind: turn.turnKind,
      status: "interrupted" as const,
      progress: null,
      lastEventSequence: latest.sequence,
      retryEligible: true,
      submittedAt: turn.submittedAt,
      completedAt: null,
    };
  }
  const progress = [...turn.events].reverse().find((event) => event.type === "turn.progressed");
  return {
    turnId: turn.turnId,
    turnKind: turn.turnKind,
    status: "processing" as const,
    progress: progress?.type === "turn.progressed" ? progress.progress : "interpreting" as const,
    lastEventSequence: latest.sequence,
    retryEligible: false,
    submittedAt: turn.submittedAt,
    completedAt: null,
  };
}

function publicCharacter(handle: CampaignPlayDatabaseHandle) {
  const row = handle.sqlite.prepare(`
    SELECT id, name, summary FROM actors
    WHERE campaign_id = ? AND kind = 'person' AND controller = 'human' AND role = 'player'
  `).get(handle.campaignId) as { id: string; name: string; summary: string } | undefined;
  if (!row) return null;
  const monogram = [...row.name].slice(0, 3).join("").toUpperCase();
  const accentIndex = Number.parseInt(hashCampaignPlayProjection({
    domain: "campaign_play_player_accent",
    campaignId: handle.campaignId,
    actorId: row.id,
  }).slice(0, 8), 16) % PLAYER_ACCENTS.length;
  return campaignPlayPublicCharacterSchema.parse({
    name: row.name,
    monogram,
    descriptor: [...row.summary].slice(0, 240).join(""),
    accent: PLAYER_ACCENTS[accentIndex],
  });
}

function completedNarration(handle: CampaignPlayDatabaseHandle, turnId: string) {
  const row = handle.sqlite.prepare(`
    SELECT narration_id AS narrationId, turn_id AS turnId, beats_json AS beatsJson,
      display_text AS displayText, suggested_actions_json AS suggestedActionsJson,
      effects_json AS effectsJson, created_at AS createdAt
    FROM campaign_play_proper_scenes
    WHERE campaign_id = ? AND turn_id = ?
    UNION ALL
    SELECT narration_id AS narrationId, turn_id AS turnId, beats_json AS beatsJson,
      display_text AS displayText, suggested_actions_json AS suggestedActionsJson,
      effects_json AS effectsJson, created_at AS createdAt
    FROM campaign_play_narrations
    WHERE campaign_id = ? AND turn_id = ? AND status = 'complete'
    LIMIT 1
  `).get(handle.campaignId, turnId, handle.campaignId, turnId) as {
    narrationId: string;
    turnId: string;
    beatsJson: string;
    displayText: string;
    suggestedActionsJson: string;
    effectsJson: string;
    createdAt: number;
  } | undefined;
  if (!row) return null;
  return campaignPlayNarrationSchema.parse({
    narrationId: row.narrationId,
    turnId: row.turnId,
    beats: parseJson(row.beatsJson, "narration beats"),
    displayText: row.displayText,
    suggestedActions: parseJson(row.suggestedActionsJson, "narration suggested actions"),
    effects: parseJson(row.effectsJson, "narration effects"),
    createdAt: row.createdAt,
  });
}

function narrationOperation(handle: CampaignPlayDatabaseHandle, turnId: string) {
  const row = handle.sqlite.prepare(`SELECT operation_id AS operationId,
      result_id AS resultId, turn_id AS turnId, narration_id AS narrationId,
      packet_hash AS packetHash, receipt_ids_json AS receiptIdsJson, status,
      current_attempt AS attempt, current_attempt_id AS attemptId,
      concise_display_text AS conciseDisplayText,
      concise_suggested_actions_json AS conciseSuggestedActionsJson,
      created_at AS createdAt, completed_at AS completedAt
    FROM campaign_play_narration_operations
    WHERE campaign_id = ? AND turn_id = ?`).get(handle.campaignId, turnId) as {
      operationId: string;
      resultId: string;
      turnId: string;
      narrationId: string;
      packetHash: string;
      receiptIdsJson: string;
      status: string;
      attempt: number;
      attemptId: string | null;
      conciseDisplayText: string;
      conciseSuggestedActionsJson: string;
      createdAt: number;
      completedAt: number | null;
    } | undefined;
  return row ? campaignPlayNarrationOperationSchema.parse({
    operationId: row.operationId,
    resultId: row.resultId,
    turnId: row.turnId,
    narrationId: row.narrationId,
    packetHash: row.packetHash,
    receiptIds: parseJson(row.receiptIdsJson, "narration operation receipt ids"),
    status: row.status,
    attemptId: row.attemptId,
    attempt: row.attempt,
    conciseResult: {
      displayText: row.conciseDisplayText,
      suggestedActions: parseJson(
        row.conciseSuggestedActionsJson,
        "narration operation concise actions",
      ),
    },
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }) : null;
}

function terminalFailureCode(turn: LoadedCampaignPlayTurn): string {
  const event = turn.events.at(-1);
  if (!event || event.type !== "turn.failed") {
    failCorrupt("Campaign Play failed turn lacks its public terminal event.");
  }
  return event.errorCode;
}

function assertCursor(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    failCorrupt(`Campaign Play ${label} must be a nonnegative safe integer.`);
  }
}

export function createCampaignPlayReadModel(
  handle: CampaignPlayDatabaseHandle,
): CampaignPlayReadModel {
  const stateRepository = createCampaignPlayStateRepository(handle);
  const turnRepository = createCampaignPlayTurnRepository(handle);

  return {
    loadState() {
      const loaded = stateRepository.loadState();
      if (!loaded) failCorrupt("Campaign Play state is missing.");
      const projection = loaded.publicState.projection as Record<string, unknown>;
      const active = turnRepository.loadActiveTurn();
      const activeTurn = active ? publicTurn(handle, active) : null;
      const narrationPending = activeTurn?.progress === "narrating" ||
        (activeTurn?.status === "interrupted" &&
          active?.interruptedStage === "visibility_projected");
      const phase = narrationPending
        ? "narration_pending"
        : activeTurn?.turnKind === "opening"
          ? "opening_active"
          : activeTurn ? "turn_active" : loaded.authority.setupPhase;
      const journal = projection.journal;
      if (!Array.isArray(journal)) failCorrupt("Campaign Play public projection lacks its journal.");
      return campaignPlayStateSchema.parse({
        acceptedWorldVersion: loaded.authority.acceptedWorldVersion,
        worldVersion: loaded.authority.worldVersion,
        runtimeRevision: loaded.authority.runtimeRevision,
        campaignId: handle.campaignId,
        phase,
        character: publicCharacter(handle),
        openingOptions: phase === "opening_required"
          ? buildCampaignPlayOpeningOptions(loaded)
          : [],
        currentLocation: projection.currentLocation,
        visibleActors: projection.visibleActors,
        visibleRoutes: projection.visibleRoutes,
        visiblePressures: projection.visiblePressures,
        possessions: projection.possessions,
        obligations: projection.obligations,
        narration: projection.narration,
        narrationOperation: projection.narrationOperation,
        utilityActions: projection.utilityActions,
        consequences: projection.consequences,
        activeTurn,
        journalCursor: journal.length,
        projectionHash: loaded.publicState.hash,
      });
    },

    loadTurn(turnId) {
      const state = stateRepository.loadState();
      const turn = turnRepository.loadTurn(turnId);
      if (!turn) {
        throw new CampaignPlayTurnRepositoryError(
          "turn_not_found",
          "Campaign Play turn was not found.",
        );
      }
      if (!state) failCorrupt("Campaign Play turn exists without durable state.");
      const turnDto = publicTurn(handle, turn);
      const journalCursor = handle.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_observations
        WHERE campaign_id = ? AND created_at <= ?
      `).get(handle.campaignId, turn.completedAt ?? turn.updatedAt) as { count: number };
      const result = turnDto.status === "completed"
        ? {
          status: "completed" as const,
          narration: completedNarration(handle, turn.turnId),
          narrationOperation: narrationOperation(handle, turn.turnId),
          consequences: (() => {
            const packet = handle.sqlite.prepare(`SELECT packet_json AS packetJson FROM campaign_play_narrations
              WHERE campaign_id = ? AND turn_id = ?`).get(handle.campaignId, turn.turnId) as { packetJson: string } | undefined;
            if (!packet) failCorrupt("Campaign Play completed turn lacks a durable public packet.");
            const parsed = parseJson(packet.packetJson, "public narrator packet") as { consequences?: unknown };
            return parsed.consequences;
          })(),
          journalCursor: journalCursor.count,
        }
        : turnDto.status === "interrupted"
          ? { status: "interrupted" as const, errorCode: "turn_interrupted" as const }
          : turnDto.status === "failed"
            ? { status: "failed" as const, errorCode: terminalFailureCode(turn) }
            : { status: "processing" as const };
      return campaignPlayTurnReadResponseSchema.parse({
        acceptedWorldVersion: state.authority.acceptedWorldVersion,
        worldVersion: state.authority.worldVersion,
        runtimeRevision: state.authority.runtimeRevision,
        campaignId: handle.campaignId,
        turn: turnDto,
        result,
      });
    },

    loadJournal(cursor, limit) {
      assertCursor(cursor, "journal cursor");
      if (!Number.isSafeInteger(limit) || limit < 1) {
        failCorrupt("Campaign Play journal limit must be a positive safe integer.");
      }
      const state = stateRepository.loadState();
      if (!state) failCorrupt("Campaign Play journal requires durable state.");
      const rows = handle.sqlite.prepare(`
        SELECT public_entry_json AS publicEntryJson
        FROM campaign_play_observations WHERE campaign_id = ?
        ORDER BY world_time_minutes, observation_id LIMIT ? OFFSET ?
      `).all(handle.campaignId, limit + 1, cursor) as Array<{ publicEntryJson: string }>;
      const pageRows = rows.slice(0, limit);
      return campaignPlayJournalPageSchema.parse({
        acceptedWorldVersion: state.authority.acceptedWorldVersion,
        worldVersion: state.authority.worldVersion,
        runtimeRevision: state.authority.runtimeRevision,
        campaignId: handle.campaignId,
        entries: pageRows.map((row) => campaignPlayJournalEntrySchema.parse(parseJson(row.publicEntryJson, "journal entry"))),
        nextCursor: rows.length > limit ? cursor + limit : null,
      });
    },

    listTurnEvents(turnId, afterSequence) {
      assertCursor(afterSequence, "turn event cursor");
      return turnRepository.listTurnEvents(turnId, afterSequence);
    },
  };
}
