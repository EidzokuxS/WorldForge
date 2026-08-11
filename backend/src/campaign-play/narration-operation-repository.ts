import type {
  CampaignPlayNarration,
  CampaignPlayNarrationOperation,
  CampaignPlayNarrationRecoveryRequest,
  CampaignPlaySuggestedAction,
} from "@worldforge/shared";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  campaignPlayNarrationSchema,
  campaignPlayNarratorPacketSchema,
  campaignPlaySseEventSchema,
} from "./contracts.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import type {
  CampaignPlayExternalInterruptionEvidence,
  CampaignPlayModelExecutionEvidence,
  CampaignPlayRequestedModel,
} from "./campaign-play-turn-repository.js";

export const CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS = 90_000;
export const CAMPAIGN_PLAY_MANUAL_NARRATION_WINDOW_MS = 90_000;

export type CampaignPlayNarrationRecoveryKind = "automatic" | "manual";

export class CampaignPlayNarrationOperationError extends Error {
  constructor(
    readonly code:
      | "operation_not_found"
      | "operation_not_recoverable"
      | "operation_fence_lost"
      | "operation_stale"
      | "operation_corrupt",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayNarrationOperationError";
  }
}

export interface CampaignPlayNarrationAttemptToken {
  operationId: string;
  resultId: string;
  turnId: string;
  narrationId: string;
  packetHash: string;
  packetJson: string;
  receiptIds: string[];
  attemptId: string;
  attempt: number;
  workerEpoch: number;
  owner: string;
  expiresAt: number;
  deadlineAt: number;
  createdAt: number;
}

interface OperationRow {
  operationId: string;
  campaignId: string;
  turnId: string;
  resultId: string;
  narrationId: string;
  packetHash: string;
  receiptIdsJson: string;
  conciseDisplayText: string;
  conciseSuggestedActionsJson: string;
  status: "pending" | "running" | "failed" | "complete";
  currentAttempt: number;
  currentAttemptId: string | null;
  errorCode: string | null;
  leaseOwner: string | null;
  leaseEpoch: number;
  leaseExpiresAt: number | null;
  automaticDeadlineAt: number;
  activeDeadlineAt: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface PendingPacketRow {
  narrationId: string;
  packetHash: string;
  packetJson: string;
  createdAt: number;
}

function parseReceiptIds(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (cause) {
    throw new CampaignPlayNarrationOperationError(
      "operation_corrupt",
      "Campaign Play narration receipt identity is not valid JSON.",
      { cause },
    );
  }
  if (
    !Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || item.length === 0) ||
    new Set(parsed).size !== parsed.length
  ) {
    throw new CampaignPlayNarrationOperationError(
      "operation_corrupt",
      "Campaign Play narration receipt identity is invalid.",
    );
  }
  return parsed;
}

function conciseResult(packetJson: string): {
  displayText: string;
  suggestedActions: CampaignPlaySuggestedAction[];
} {
  const packet = campaignPlayNarratorPacketSchema.parse(JSON.parse(packetJson) as unknown);
  const consequenceText = packet.consequences.map((entry) => entry.whatChanged.trim())
    .filter((entry) => entry.length > 0);
  const observationText = packet.newObservations.map((entry) => entry.text.trim())
    .filter((entry) => entry.length > 0);
  const displayText = consequenceText.length > 0
    ? consequenceText.join(" ")
    : observationText.length > 0
    ? observationText.join(" ")
    : packet.actionContext?.clarificationQuestion ?? "The situation holds.";
  return {
    displayText,
    suggestedActions: packet.availableIntents
      .slice(0, 4)
      .map((intent) => ({ choiceHandle: intent.handle, label: intent.label })),
  };
}

function selectOperation(
  handle: CampaignPlayDatabaseHandle,
  key: "turn_id" | "operation_id",
  value: string,
): OperationRow | null {
  return (handle.sqlite.prepare(`SELECT operation_id AS operationId,
      campaign_id AS campaignId, turn_id AS turnId, result_id AS resultId,
      narration_id AS narrationId, packet_hash AS packetHash,
      receipt_ids_json AS receiptIdsJson, concise_display_text AS conciseDisplayText,
      concise_suggested_actions_json AS conciseSuggestedActionsJson, status,
      current_attempt AS currentAttempt, current_attempt_id AS currentAttemptId,
      error_code AS errorCode, lease_owner AS leaseOwner, lease_epoch AS leaseEpoch,
      lease_expires_at AS leaseExpiresAt,
      automatic_deadline_at AS automaticDeadlineAt,
      active_deadline_at AS activeDeadlineAt,
      created_at AS createdAt,
      updated_at AS updatedAt, completed_at AS completedAt
    FROM campaign_play_narration_operations
    WHERE campaign_id = ? AND ${key} = ?`).get(handle.campaignId, value) as OperationRow | undefined) ?? null;
}

function operationView(row: OperationRow): CampaignPlayNarrationOperation {
  return {
    operationId: row.operationId,
    resultId: row.resultId,
    turnId: row.turnId,
    narrationId: row.narrationId,
    packetHash: row.packetHash,
    receiptIds: parseReceiptIds(row.receiptIdsJson),
    status: row.status,
    attemptId: row.currentAttemptId,
    attempt: row.currentAttempt,
    conciseResult: {
      displayText: row.conciseDisplayText,
      suggestedActions: JSON.parse(row.conciseSuggestedActionsJson) as CampaignPlaySuggestedAction[],
    },
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function currentResultTurnId(handle: CampaignPlayDatabaseHandle): string | null {
  return (handle.sqlite.prepare(`SELECT result.turn_id AS turnId
    FROM campaign_play_turn_results result
    JOIN campaign_play_turns turn ON turn.id = result.turn_id
    JOIN campaign_play_runtime_events event
      ON event.campaign_id = result.campaign_id AND event.turn_id = result.turn_id
      AND event.kind = 'turn_completed'
    WHERE result.campaign_id = ? AND turn.turn_kind = 'player_action'
      AND turn.stage = 'completed'
    ORDER BY event.sequence DESC LIMIT 1`).get(
      handle.campaignId,
    ) as { turnId: string } | undefined)?.turnId ?? null;
}

function packetForOperation(
  handle: CampaignPlayDatabaseHandle,
  operation: OperationRow,
): PendingPacketRow {
  const row = handle.sqlite.prepare(`SELECT narration_id AS narrationId,
      packet_hash AS packetHash, packet_json AS packetJson, created_at AS createdAt
    FROM campaign_play_narrations
    WHERE campaign_id = ? AND turn_id = ? AND narration_id = ?
      AND packet_hash = ?`).get(
        handle.campaignId,
        operation.turnId,
        operation.narrationId,
        operation.packetHash,
      ) as PendingPacketRow | undefined;
  if (!row) {
    throw new CampaignPlayNarrationOperationError(
      "operation_corrupt",
      "Campaign Play narration operation lost its immutable visible packet.",
    );
  }
  const packet = campaignPlayNarratorPacketSchema.parse(JSON.parse(row.packetJson) as unknown);
  if (
    canonicalizeCampaignPlayProjection(packet) !== row.packetJson ||
    packet.turnId !== operation.turnId
  ) {
    throw new CampaignPlayNarrationOperationError(
      "operation_corrupt",
      "Campaign Play narration operation packet identity is invalid.",
    );
  }
  return row;
}

export function createCampaignPlayNarrationOperationRepository(
  handle: CampaignPlayDatabaseHandle,
) {
  const stateRepository = createCampaignPlayStateRepository(handle);

  const commitVisibleResult = (turnId: string, completedAt: number): CampaignPlayNarrationOperation => {
    const existing = selectOperation(handle, "turn_id", turnId);
    if (existing) return operationView(existing);
    const state = stateRepository.loadState();
    const turn = handle.sqlite.prepare(`SELECT id AS turnId, stage, turn_kind AS turnKind,
        public_packet_hash AS publicPacketHash, worker_epoch AS workerEpoch,
        worker_lease_owner AS workerLeaseOwner, worker_lease_expires_at AS workerLeaseExpiresAt,
        submitted_at AS submittedAt, next_event_sequence AS nextEventSequence, updated_at AS updatedAt
      FROM campaign_play_turns WHERE campaign_id = ? AND id = ?`).get(
        handle.campaignId,
        turnId,
      ) as {
        turnId: string;
        stage: string;
        turnKind: string;
        publicPacketHash: string | null;
        workerEpoch: number;
      workerLeaseOwner: string | null;
      workerLeaseExpiresAt: number | null;
      submittedAt: number;
      nextEventSequence: number;
      updatedAt: number;
      } | undefined;
    if (
      !state || !turn || turn.turnKind !== "player_action" || turn.stage !== "visibility_projected" ||
      turn.publicPacketHash === null || turn.workerLeaseOwner !== null ||
      turn.workerLeaseExpiresAt !== null || completedAt < turn.updatedAt
    ) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play visible result no longer matches its action-ready boundary.",
      );
    }
    const packet = handle.sqlite.prepare(`SELECT narration_id AS narrationId,
        packet_hash AS packetHash, packet_json AS packetJson, created_at AS createdAt
      FROM campaign_play_narrations
      WHERE campaign_id = ? AND turn_id = ? AND status = 'pending' AND packet_hash = ?`).get(
        handle.campaignId,
        turnId,
        turn.publicPacketHash,
      ) as PendingPacketRow | undefined;
    if (!packet) {
      throw new CampaignPlayNarrationOperationError(
        "operation_corrupt",
        "Campaign Play visible result lacks its immutable narration packet.",
      );
    }
    const automaticDeadlineAt = completedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS;
    if (!Number.isSafeInteger(automaticDeadlineAt) || automaticDeadlineAt < completedAt) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play narration operation has an invalid hard deadline.",
      );
    }
    const receiptIds = (handle.sqlite.prepare(`SELECT receipt_id AS receiptId
      FROM campaign_play_receipts WHERE campaign_id = ? AND turn_id = ?
      ORDER BY result_world_version, receipt_id`).all(handle.campaignId, turnId) as Array<{
        receiptId: string;
      }>).map((row) => row.receiptId);
    const receiptsJson = canonicalizeCampaignPlayProjection(receiptIds);
    const concise = conciseResult(packet.packetJson);
    const resultId = `result:${hashCampaignPlayProjection({
      domain: "campaign_play_visible_result",
      campaignId: handle.campaignId,
      turnId,
      packetHash: packet.packetHash,
      receiptIds,
    }).slice(0, 40)}`;
    const operationId = `narration-operation:${hashCampaignPlayProjection({
      domain: "campaign_play_narration_operation",
      resultId,
      narrationId: packet.narrationId,
      packetHash: packet.packetHash,
    }).slice(0, 40)}`;
    const mutationId = hashCampaignPlayProjection({
      domain: "campaign_play_visible_result_ready",
      campaignId: handle.campaignId,
      turnId,
      operationId,
      workerEpoch: turn.workerEpoch,
    });
    stateRepository.commitRuntime({
      event: {
        eventId: mutationId,
        turnId,
        kind: "turn_completed",
        workerEpoch: turn.workerEpoch,
        protectedPayloadHash: hashCampaignPlayProjection({
          domain: "campaign_play_visible_result_ready_payload",
          resultId,
          operationId,
          packetHash: packet.packetHash,
          receiptIds,
        }),
        createdAt: completedAt,
      },
      mutate(context) {
        const updated = context.sqlite.prepare(`UPDATE campaign_play_turns
          SET stage = 'completed', final_world_version = ?, next_event_sequence = ?,
            updated_at = ?, completed_at = ?
          WHERE id = ? AND campaign_id = ? AND stage = 'visibility_projected'
            AND public_packet_hash = ? AND worker_epoch = ?
            AND worker_lease_owner IS NULL AND worker_lease_expires_at IS NULL
            AND next_event_sequence = ? AND updated_at = ?`).run(
              context.targetWorldVersion,
              turn.nextEventSequence + 1,
              completedAt,
              completedAt,
              turnId,
              handle.campaignId,
              packet.packetHash,
              turn.workerEpoch,
              turn.nextEventSequence,
              turn.updatedAt,
            );
        if (updated.changes !== 1) {
          throw new CampaignPlayNarrationOperationError(
            "operation_fence_lost",
            "Campaign Play visible result lost its completion compare-and-swap.",
          );
        }
        const result = context.sqlite.prepare(`SELECT terminal_reason AS terminalReason
          FROM campaign_play_turn_results WHERE campaign_id = ? AND turn_id = ?`).get(
            handle.campaignId,
            turnId,
          ) as { terminalReason: string } | undefined;
        if (!result || result.terminalReason === "terminal_failure") {
          throw new CampaignPlayNarrationOperationError(
            "operation_corrupt",
            "Campaign Play visible result lacks its authoritative turn result.",
          );
        }
        context.sqlite.prepare(`INSERT INTO campaign_play_narration_operations (
          operation_id, campaign_id, turn_id, result_id, narration_id, packet_hash,
          receipt_ids_json, concise_display_text, concise_suggested_actions_json,
          status, lease_expires_at, automatic_deadline_at, active_deadline_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?)`).run(
          operationId,
          handle.campaignId,
          turnId,
          resultId,
          packet.narrationId,
          packet.packetHash,
          receiptsJson,
          concise.displayText,
          canonicalizeCampaignPlayProjection(concise.suggestedActions),
          automaticDeadlineAt,
          automaticDeadlineAt,
          completedAt,
          completedAt,
        );
        const event = campaignPlaySseEventSchema.parse({
          type: "turn.completed",
          turnId,
          sequence: turn.nextEventSequence,
          acceptedWorldVersion: state.authority.acceptedWorldVersion,
          worldVersion: context.targetWorldVersion,
          runtimeRevision: context.targetRuntimeRevision,
          createdAt: completedAt,
          retryEligible: false,
        });
        context.sqlite.prepare(`INSERT INTO campaign_play_turn_events
          (event_id, campaign_id, turn_id, sequence, event_type, payload_json, sse_cursor, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            mutationId,
            handle.campaignId,
            turnId,
            event.sequence,
            event.type,
            canonicalizeCampaignPlayProjection(event),
            `${turnId}:${event.sequence}`,
            completedAt,
          );
      },
    });
    const committed = selectOperation(handle, "turn_id", turnId);
    if (!committed) {
      throw new CampaignPlayNarrationOperationError(
        "operation_corrupt",
        "Campaign Play narration operation disappeared after visible-result completion.",
      );
    }
    return operationView(committed);
  };

  const claim = (input: {
    turnId: string;
    owner: string;
    requested: CampaignPlayRequestedModel;
    claimedAt: number;
    leaseExpiresAt: number;
  }): CampaignPlayNarrationAttemptToken | null => handle.sqlite.transaction(() => {
    const operation = selectOperation(handle, "turn_id", input.turnId);
    if (!operation) return null;
    if (operation.status === "complete" || operation.status === "running") return null;
    if (operation.status !== "pending") {
      throw new CampaignPlayNarrationOperationError(
        "operation_not_recoverable",
        "Campaign Play proper-scene recovery must be requested before a failed operation can run again.",
      );
    }
    if (
      input.owner.length === 0 || input.leaseExpiresAt <= input.claimedAt ||
      input.requested.strategy !== "strict_object"
    ) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play narration claim has invalid fencing fields.",
      );
    }
    const packet = packetForOperation(handle, operation);
    const attempt = operation.currentAttempt + 1;
    const workerEpoch = operation.leaseEpoch + 1;
    const attemptId = `narration-attempt:${hashCampaignPlayProjection({
      domain: "campaign_play_narration_attempt",
      operationId: operation.operationId,
      attempt,
      workerEpoch,
    }).slice(0, 40)}`;
    if (input.claimedAt >= operation.activeDeadlineAt) {
      const attemptUpdate = handle.sqlite.prepare(`INSERT INTO campaign_play_narration_attempts (
        attempt_id, operation_id, campaign_id, turn_id, attempt, status, worker_epoch,
        requested_provider_id, requested_model, requested_strategy, duration_ms,
        schema_outcome, error_code, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?, 'strict_object', 0,
        'transport_error', 'stage_timeout', ?, ?)`).run(
          attemptId,
          operation.operationId,
          handle.campaignId,
          operation.turnId,
          attempt,
          workerEpoch,
          input.requested.providerId,
          input.requested.model,
          input.claimedAt,
          input.claimedAt,
        );
      const operationUpdate = handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
        SET status = 'failed', current_attempt = ?, current_attempt_id = ?,
          error_code = 'stage_timeout', lease_owner = NULL,
          lease_expires_at = NULL, updated_at = ?
        WHERE operation_id = ? AND campaign_id = ? AND status = 'pending'
          AND current_attempt = ? AND current_attempt_id IS NULL
          AND lease_owner IS NULL AND lease_expires_at IS NULL`).run(
            attempt,
            attemptId,
            input.claimedAt,
            operation.operationId,
            handle.campaignId,
            operation.currentAttempt,
          );
      if (attemptUpdate.changes !== 1 || operationUpdate.changes !== 1) {
        throw new CampaignPlayNarrationOperationError(
          "operation_fence_lost",
          "Campaign Play narration deadline claim lost its pending operation.",
        );
      }
      return null;
    }
    const effectiveLeaseExpiresAt = Math.min(input.leaseExpiresAt, operation.activeDeadlineAt);
    if (effectiveLeaseExpiresAt <= input.claimedAt) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play narration claim has no remaining hard-deadline lease.",
      );
    }
    const update = handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
      SET status = 'running', current_attempt = ?, current_attempt_id = ?,
        lease_owner = ?, lease_epoch = ?, lease_expires_at = ?, updated_at = ?
      WHERE operation_id = ? AND campaign_id = ? AND status = 'pending'
        AND current_attempt = ? AND current_attempt_id IS NULL
        AND lease_owner IS NULL AND lease_expires_at IS NULL`).run(
          attempt,
          attemptId,
          input.owner,
          workerEpoch,
          effectiveLeaseExpiresAt,
          input.claimedAt,
          operation.operationId,
          handle.campaignId,
          operation.currentAttempt,
        );
    if (update.changes !== 1) return null;
    handle.sqlite.prepare(`INSERT INTO campaign_play_narration_attempts (
      attempt_id, operation_id, campaign_id, turn_id, attempt, status, worker_epoch,
      requested_provider_id, requested_model, requested_strategy, schema_outcome, created_at
    ) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, 'strict_object', 'pending', ?)`).run(
      attemptId,
      operation.operationId,
      handle.campaignId,
      operation.turnId,
      attempt,
      workerEpoch,
      input.requested.providerId,
      input.requested.model,
      input.claimedAt,
    );
    return {
      operationId: operation.operationId,
      resultId: operation.resultId,
      turnId: operation.turnId,
      narrationId: operation.narrationId,
      packetHash: operation.packetHash,
      packetJson: packet.packetJson,
      receiptIds: parseReceiptIds(operation.receiptIdsJson),
      attemptId,
      attempt,
      workerEpoch,
      owner: input.owner,
      expiresAt: effectiveLeaseExpiresAt,
      deadlineAt: operation.activeDeadlineAt,
      createdAt: packet.createdAt,
    };
  }).immediate();

  const renew = (
    token: CampaignPlayNarrationAttemptToken,
    renewedAt: number,
    leaseExpiresAt: number,
  ): CampaignPlayNarrationAttemptToken => handle.sqlite.transaction(() => {
    const effectiveLeaseExpiresAt = Math.min(leaseExpiresAt, token.deadlineAt);
    if (
      renewedAt >= token.expiresAt || renewedAt >= token.deadlineAt ||
      effectiveLeaseExpiresAt <= renewedAt
    ) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play narration lease renewal missed its boundary.",
      );
    }
    const updated = handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
      SET lease_expires_at = ?, updated_at = ?
      WHERE operation_id = ? AND campaign_id = ? AND status = 'running'
        AND current_attempt_id = ? AND lease_owner = ? AND lease_epoch = ?
        AND lease_expires_at = ?`).run(
          effectiveLeaseExpiresAt,
          renewedAt,
          token.operationId,
          handle.campaignId,
          token.attemptId,
          token.owner,
          token.workerEpoch,
          token.expiresAt,
        );
    if (updated.changes !== 1) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play narration lease renewal lost its compare-and-swap.",
      );
    }
    return { ...token, expiresAt: effectiveLeaseExpiresAt };
  }).immediate();

  const failAttempt = (input: {
    token: CampaignPlayNarrationAttemptToken;
    evidence: CampaignPlayExternalInterruptionEvidence;
    failedAt: number;
  }): CampaignPlayNarrationOperation => handle.sqlite.transaction(() => {
    const { token, evidence } = input;
    const attemptUpdate = handle.sqlite.prepare(`UPDATE campaign_play_narration_attempts
      SET status = 'failed', actual_provider_id = ?, actual_model = ?, actual_strategy = ?,
        input_tokens = ?, output_tokens = ?, duration_ms = ?, finish_reason = ?,
        schema_outcome = ?, error_code = ?, completed_at = ?
      WHERE attempt_id = ? AND operation_id = ? AND campaign_id = ?
        AND status = 'running' AND worker_epoch = ?`).run(
          evidence.actualProviderId,
          evidence.actualModel,
          evidence.actualStrategy,
          evidence.inputTokens,
          evidence.outputTokens,
          evidence.durationMs,
          evidence.finishReason,
          evidence.schemaOutcome,
          evidence.errorCode,
          input.failedAt,
          token.attemptId,
          token.operationId,
          handle.campaignId,
          token.workerEpoch,
        );
    const operationUpdate = handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
      SET status = 'failed', error_code = ?, lease_owner = NULL,
        lease_expires_at = NULL, updated_at = ?
      WHERE operation_id = ? AND campaign_id = ? AND status = 'running'
        AND current_attempt_id = ? AND lease_owner = ? AND lease_epoch = ?`).run(
          evidence.errorCode,
          input.failedAt,
          token.operationId,
          handle.campaignId,
          token.attemptId,
          token.owner,
          token.workerEpoch,
        );
    if (attemptUpdate.changes === 0 && operationUpdate.changes === 0) {
      const current = selectOperation(handle, "operation_id", token.operationId);
      if (
        current?.status === "failed" && current.currentAttemptId === token.attemptId &&
        current.currentAttempt === token.attempt
      ) {
        return operationView(current);
      }
    }
    if (attemptUpdate.changes !== 1 || operationUpdate.changes !== 1) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play narration failure lost its exact attempt.",
      );
    }
    return operationView(selectOperation(handle, "operation_id", token.operationId)!);
  }).immediate();

  const accept = (input: {
    token: CampaignPlayNarrationAttemptToken;
    narration: CampaignPlayNarration;
    evidence: CampaignPlayModelExecutionEvidence;
    acceptedAt: number;
  }): CampaignPlayNarrationOperation => handle.sqlite.transaction(() => {
    const narration = campaignPlayNarrationSchema.parse(input.narration);
    const { token } = input;
    if (narration.narrationId !== token.narrationId || narration.turnId !== token.turnId) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play proper scene belongs to another immutable result.",
      );
    }
    const operation = selectOperation(handle, "operation_id", token.operationId);
    if (!operation) {
      throw new CampaignPlayNarrationOperationError(
        "operation_not_found",
        "Campaign Play narration operation was not found.",
      );
    }
    const artifactHash = hashCampaignPlayProjection({
      domain: "campaign_play_proper_scene",
      operationId: token.operationId,
      packetHash: token.packetHash,
      narration,
    });
    const existingScene = handle.sqlite.prepare(`SELECT artifact_hash AS artifactHash
      FROM campaign_play_proper_scenes WHERE operation_id = ?`).get(
        token.operationId,
      ) as { artifactHash: string } | undefined;
    if (operation.status === "complete" && existingScene?.artifactHash === artifactHash) {
      return operationView(operation);
    }
    if (
      operation.status !== "running" || operation.currentAttemptId !== token.attemptId ||
      operation.leaseOwner !== token.owner || operation.leaseEpoch !== token.workerEpoch ||
      operation.leaseExpiresAt !== token.expiresAt || operation.activeDeadlineAt !== token.deadlineAt ||
      input.acceptedAt >= token.expiresAt || input.acceptedAt >= operation.activeDeadlineAt
    ) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play proper scene lost its exact attempt fence.",
      );
    }
    if (currentResultTurnId(handle) !== token.turnId) {
      const staleEvidence = {
        durationMs: input.evidence.durationMs,
        completedAt: input.acceptedAt,
        errorCode: "stale_artifact",
      };
      handle.sqlite.prepare(`UPDATE campaign_play_narration_attempts
        SET status = 'stale', actual_provider_id = ?, actual_model = ?, actual_strategy = ?,
          input_tokens = ?, output_tokens = ?, duration_ms = ?, finish_reason = ?,
          schema_outcome = 'invalid', error_code = ?, completed_at = ?
        WHERE attempt_id = ? AND status = 'running'`).run(
          input.evidence.actualProviderId,
          input.evidence.actualModel,
          input.evidence.actualStrategy,
          input.evidence.inputTokens,
          input.evidence.outputTokens,
          staleEvidence.durationMs,
          input.evidence.finishReason,
          staleEvidence.errorCode,
          staleEvidence.completedAt,
          token.attemptId,
        );
      handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
        SET status = 'failed', error_code = 'stale_artifact', lease_owner = NULL,
          lease_expires_at = NULL, updated_at = ?
        WHERE operation_id = ? AND status = 'running' AND current_attempt_id = ?`).run(
          input.acceptedAt,
          token.operationId,
          token.attemptId,
        );
      return operationView(selectOperation(handle, "operation_id", token.operationId)!);
    }
    const attemptUpdate = handle.sqlite.prepare(`UPDATE campaign_play_narration_attempts
      SET status = 'accepted', actual_provider_id = ?, actual_model = ?, actual_strategy = ?,
        input_tokens = ?, output_tokens = ?, duration_ms = ?, finish_reason = ?,
        schema_outcome = 'valid', artifact_hash = ?, completed_at = ?
      WHERE attempt_id = ? AND operation_id = ? AND campaign_id = ?
        AND status = 'running' AND worker_epoch = ?`).run(
          input.evidence.actualProviderId,
          input.evidence.actualModel,
          input.evidence.actualStrategy,
          input.evidence.inputTokens,
          input.evidence.outputTokens,
          input.evidence.durationMs,
          input.evidence.finishReason,
          artifactHash,
          input.acceptedAt,
          token.attemptId,
          token.operationId,
          handle.campaignId,
          token.workerEpoch,
        );
    if (attemptUpdate.changes !== 1) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play proper scene lost its running attempt.",
      );
    }
    handle.sqlite.prepare(`INSERT INTO campaign_play_proper_scenes (
      narration_id, operation_id, campaign_id, turn_id, packet_hash, attempt_id,
      beats_json, display_text, suggested_actions_json, effects_json, artifact_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      narration.narrationId,
      token.operationId,
      handle.campaignId,
      token.turnId,
      token.packetHash,
      token.attemptId,
      canonicalizeCampaignPlayProjection(narration.beats),
      narration.displayText,
      canonicalizeCampaignPlayProjection(narration.suggestedActions),
      canonicalizeCampaignPlayProjection(narration.effects),
      artifactHash,
      narration.createdAt,
    );
    const operationUpdate = handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
      SET status = 'complete', error_code = NULL, lease_owner = NULL,
        lease_expires_at = NULL, updated_at = ?, completed_at = ?
      WHERE operation_id = ? AND campaign_id = ? AND status = 'running'
        AND current_attempt_id = ? AND lease_owner = ? AND lease_epoch = ?
        AND ? < active_deadline_at`).run(
          input.acceptedAt,
          input.acceptedAt,
          token.operationId,
          handle.campaignId,
          token.attemptId,
          token.owner,
          token.workerEpoch,
          input.acceptedAt,
        );
    if (operationUpdate.changes !== 1) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play proper scene lost its operation compare-and-swap.",
      );
    }
    return operationView(selectOperation(handle, "operation_id", token.operationId)!);
  }).immediate();

  const prepareRecovery = (
    request: CampaignPlayNarrationRecoveryRequest,
    preparedAt: number,
    kind: CampaignPlayNarrationRecoveryKind = "manual",
  ): CampaignPlayNarrationOperation => handle.sqlite.transaction(() => {
    const operation = selectOperation(handle, "operation_id", request.operationId);
    if (!operation) {
      throw new CampaignPlayNarrationOperationError(
        "operation_not_found",
        "Campaign Play narration operation was not found.",
      );
    }
    const receiptIdsJson = canonicalizeCampaignPlayProjection(request.receiptIds);
    if (
      operation.resultId !== request.resultId || operation.narrationId !== request.narrationId ||
      operation.packetHash !== request.packetHash || operation.receiptIdsJson !== receiptIdsJson
    ) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play narration recovery identity does not match the visible result.",
      );
    }
    if (operation.status !== "failed" || currentResultTurnId(handle) !== operation.turnId) {
      throw new CampaignPlayNarrationOperationError(
        "operation_not_recoverable",
        "Campaign Play narration operation is not the current failed proper scene.",
      );
    }
    packetForOperation(handle, operation);
    const activeDeadlineAt = kind === "automatic"
      ? operation.errorCode === "stage_timeout"
        ? preparedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS
        : operation.automaticDeadlineAt
      : preparedAt + CAMPAIGN_PLAY_MANUAL_NARRATION_WINDOW_MS;
    if (
      !Number.isSafeInteger(activeDeadlineAt) || activeDeadlineAt <= preparedAt ||
      (kind === "automatic" && operation.errorCode !== "stage_timeout" &&
        preparedAt >= operation.automaticDeadlineAt)
    ) {
      throw new CampaignPlayNarrationOperationError(
        "operation_not_recoverable",
        "Campaign Play narration recovery window has expired.",
      );
    }
    const updated = handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
      SET status = 'pending', current_attempt_id = NULL, error_code = NULL,
        lease_owner = NULL, lease_expires_at = NULL, active_deadline_at = ?, updated_at = ?
      WHERE operation_id = ? AND campaign_id = ? AND status = 'failed'
        AND current_attempt = ? AND current_attempt_id = ?`).run(
          activeDeadlineAt,
          preparedAt,
          operation.operationId,
          handle.campaignId,
          operation.currentAttempt,
          operation.currentAttemptId,
        );
    if (updated.changes !== 1) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Campaign Play narration recovery lost its failed operation.",
      );
    }
    return operationView(selectOperation(handle, "operation_id", operation.operationId)!);
  }).immediate();

  const interruptExpired = (
    observedAt: number,
  ): CampaignPlayNarrationOperation | null => handle.sqlite.transaction(() => {
    const operation = handle.sqlite.prepare(`SELECT operation_id AS operationId
      FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND status = 'running'
        AND (active_deadline_at <= ? OR lease_expires_at <= ?)
      ORDER BY CASE WHEN active_deadline_at <= ? THEN 0 ELSE 1 END,
        lease_expires_at, operation_id LIMIT 1`).get(
        handle.campaignId,
        observedAt,
        observedAt,
        observedAt,
      ) as { operationId: string } | undefined;
    if (!operation) return null;
    const row = selectOperation(handle, "operation_id", operation.operationId)!;
    const attempt = handle.sqlite.prepare(`SELECT created_at AS createdAt
      FROM campaign_play_narration_attempts
      WHERE campaign_id = ? AND attempt_id = ? AND status = 'running'`).get(
        handle.campaignId,
        row.currentAttemptId,
      ) as { createdAt: number } | undefined;
    if (!attempt || row.currentAttemptId === null || row.leaseExpiresAt === null) {
      throw new CampaignPlayNarrationOperationError(
        "operation_corrupt",
        "Expired narration operation lacks its running attempt authority.",
      );
    }
    const errorCode = row.activeDeadlineAt <= observedAt
      ? "stage_timeout"
      : "provider_unavailable";
    const attemptUpdate = handle.sqlite.prepare(`UPDATE campaign_play_narration_attempts
      SET status = 'failed', duration_ms = ?, schema_outcome = 'transport_error',
        error_code = ?, completed_at = ?
      WHERE campaign_id = ? AND attempt_id = ? AND status = 'running'
        AND worker_epoch = ?`).run(
          Math.max(0, observedAt - attempt.createdAt),
          errorCode,
          observedAt,
          handle.campaignId,
          row.currentAttemptId,
          row.leaseEpoch,
        );
    const operationUpdate = handle.sqlite.prepare(`UPDATE campaign_play_narration_operations
      SET status = 'failed', error_code = ?, lease_owner = NULL,
        lease_expires_at = NULL, updated_at = ?
      WHERE campaign_id = ? AND operation_id = ? AND status = 'running'
        AND current_attempt_id = ? AND lease_epoch = ? AND lease_expires_at = ?
        AND (active_deadline_at <= ? OR lease_expires_at <= ?)`).run(
          errorCode,
          observedAt,
          handle.campaignId,
          row.operationId,
          row.currentAttemptId,
          row.leaseEpoch,
          row.leaseExpiresAt,
          observedAt,
          observedAt,
        );
    if (attemptUpdate.changes !== 1 || operationUpdate.changes !== 1) {
      throw new CampaignPlayNarrationOperationError(
        "operation_fence_lost",
        "Expired narration operation lost its exact attempt fence.",
      );
    }
    return operationView(selectOperation(handle, "operation_id", row.operationId)!);
  }).immediate();

  return {
    commitVisibleResult,
    claim,
    renew,
    failAttempt,
    accept,
    prepareRecovery,
    interruptExpired,
    loadByTurn(turnId: string): CampaignPlayNarrationOperation | null {
      const row = selectOperation(handle, "turn_id", turnId);
      return row ? operationView(row) : null;
    },
    loadPendingTurnId(): string | null {
      return (handle.sqlite.prepare(`SELECT turn_id AS turnId
        FROM campaign_play_narration_operations
        WHERE campaign_id = ? AND status = 'pending'
        ORDER BY created_at DESC, operation_id DESC LIMIT 1`).get(
          handle.campaignId,
        ) as { turnId: string } | undefined)?.turnId ?? null;
    },
  };
}
