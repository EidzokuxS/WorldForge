import crypto from "node:crypto";
import type { ChatMessage } from "@worldforge/shared";

import { appendChatMessages, getChatHistory } from "../../campaign/index.js";
import { getSqliteConnection } from "../../db/index.js";
import { withSqliteWriteLock } from "../../db/sqlite-write-lock.js";
import {
  assertCleanPlayerFacingTurnRecord,
  type CleanNarrationProof,
  type CleanNarratorView,
  type CleanPlayerFacingTurnDoneBoundary,
  type CleanPlayerFacingTurnEvidenceRef,
  type CleanPlayerFacingTurnRecord,
  type CleanSettledTurnPacket,
  type FrozenApiProjection,
  type GameplayRuntimeTurnInput,
} from "./contracts.js";

export interface CleanPlayerFacingTurnRecordStore {
  findByIdempotencyKey(campaignId: string, idempotencyKey: string): CleanPlayerFacingTurnRecord | null;
  findByInternalTurnId(campaignId: string, internalTurnId: string): CleanPlayerFacingTurnRecord | null;
  insert(record: CleanPlayerFacingTurnRecord): void;
}

export interface CleanPlayerFacingTurnChatAdapter {
  getHistory(campaignId: string): ChatMessage[];
  append(campaignId: string, messages: ChatMessage[]): void;
}

export interface CommitCleanPlayerFacingTurnInput {
  turn: GameplayRuntimeTurnInput;
  projection: FrozenApiProjection;
  settlement: {
    settledPacket: CleanSettledTurnPacket;
    narratorView: CleanNarratorView;
  };
  narration?: CleanNarrationProof;
  evidenceRefs: CleanPlayerFacingTurnEvidenceRef[];
  now?: number;
  chat?: CleanPlayerFacingTurnChatAdapter;
  store?: CleanPlayerFacingTurnRecordStore;
}

export interface CleanPlayerFacingTurnCommitResult {
  record: CleanPlayerFacingTurnRecord;
  doneBoundary: CleanPlayerFacingTurnDoneBoundary;
}

const defaultChatAdapter: CleanPlayerFacingTurnChatAdapter = {
  getHistory: getChatHistory,
  append: appendChatMessages,
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function publicId(prefix: "cgtr" | "cgturn" | "cgpacket", value: string): string {
  return `${prefix}_${sha256(value).slice(0, 24)}`;
}

export function buildCleanPublicTurnIds(turn: GameplayRuntimeTurnInput): {
  recordId: string;
  publicTurnId: string;
  publicPacketId: string;
} {
  const stableSeed = `${turn.campaignId}:${turn.turnId}:${turn.idempotencyKey}`;
  return {
    recordId: publicId("cgtr", stableSeed),
    publicTurnId: publicId("cgturn", `${stableSeed}:turn`),
    publicPacketId: publicId("cgpacket", `${stableSeed}:packet`),
  };
}

function parseStoredRecord(raw: unknown): CleanPlayerFacingTurnRecord | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  try {
    return assertCleanPlayerFacingTurnRecord(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function readStoredRecordByWhere(whereSql: string, valueA: string, valueB: string): CleanPlayerFacingTurnRecord | null {
  const row = getSqliteConnection()
    .prepare(`SELECT record_json AS recordJson FROM clean_gameplay_turn_records WHERE ${whereSql} LIMIT 1`)
    .get(valueA, valueB) as { recordJson?: unknown } | undefined;
  return parseStoredRecord(row?.recordJson);
}

export const sqliteCleanPlayerFacingTurnRecordStore: CleanPlayerFacingTurnRecordStore = {
  findByIdempotencyKey(campaignId, idempotencyKey) {
    return readStoredRecordByWhere(
      "campaign_id = ? AND idempotency_key = ?",
      campaignId,
      idempotencyKey,
    );
  },
  findByInternalTurnId(campaignId, internalTurnId) {
    return readStoredRecordByWhere(
      "campaign_id = ? AND internal_turn_id = ?",
      campaignId,
      internalTurnId,
    );
  },
  insert(record) {
    getSqliteConnection()
      .prepare(`
        INSERT INTO clean_gameplay_turn_records (
          record_id,
          campaign_id,
          internal_turn_id,
          public_turn_id,
          public_packet_id,
          idempotency_key,
          frame_id,
          user_message_index,
          assistant_message_index,
          user_message_sha256,
          assistant_message_sha256,
          record_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.recordId,
        record.campaignId,
        record.internalTurnId,
        record.publicTurnId,
        record.publicPacketId,
        record.idempotencyKey,
        record.internalFrameId,
        record.chat.userMessageIndex,
        record.chat.assistantMessageIndex,
        record.chat.userMessageSha256,
        record.chat.assistantMessageSha256,
        JSON.stringify(record),
        record.committedAt,
      );
  },
};

function assertExistingRecordTail(input: {
  record: CleanPlayerFacingTurnRecord;
  chat: CleanPlayerFacingTurnChatAdapter;
}): void {
  const history = input.chat.getHistory(input.record.campaignId);
  const user = history[input.record.chat.userMessageIndex];
  const assistant = history[input.record.chat.assistantMessageIndex];
  if (
    history.length !== input.record.doneBoundary.chatHistoryLengthAfterTurn
    || user?.role !== "user"
    || assistant?.role !== "assistant"
    || sha256(user.content) !== input.record.chat.userMessageSha256
    || sha256(assistant.content) !== input.record.chat.assistantMessageSha256
  ) {
    throw new Error("Clean player-facing turn record exists but the chat tail no longer matches it.");
  }
}

function buildRecord(input: {
  turn: GameplayRuntimeTurnInput;
  projection: FrozenApiProjection;
  settlement: {
    settledPacket: CleanSettledTurnPacket;
    narratorView: CleanNarratorView;
  };
  narration?: CleanNarrationProof;
  evidenceRefs: CleanPlayerFacingTurnEvidenceRef[];
  beforeLength: number;
  afterHistory: ChatMessage[];
  committedAt: number;
}): CleanPlayerFacingTurnRecord {
  const userIndex = input.beforeLength;
  const assistantIndex = input.beforeLength + 1;
  const user = input.afterHistory[userIndex];
  const assistant = input.afterHistory[assistantIndex];
  if (user?.role !== "user" || assistant?.role !== "assistant") {
    throw new Error("Clean turn commit expected a user/assistant chat tail.");
  }
  const { recordId, publicTurnId, publicPacketId } = buildCleanPublicTurnIds(input.turn);
  const userMessageSha256 = sha256(user.content);
  const assistantMessageSha256 = sha256(assistant.content);

  return assertCleanPlayerFacingTurnRecord({
    version: "gameplay-runtime.player-facing-turn-record.v1",
    runtime: "gameplay-cycle-runtime",
    route: "/api/chat/action",
    campaignId: input.turn.campaignId,
    recordId,
    publicTurnId,
    publicPacketId,
    internalTurnId: input.turn.turnId,
    internalFrameId: input.projection.frameId,
    idempotencyKey: input.turn.idempotencyKey,
    committedAt: input.committedAt,
    input: {
      submittedPlayerAction: input.turn.playerAction.submitted,
      normalizedPlayerAction: input.turn.playerAction.normalized,
      source: input.turn.playerAction.source,
    },
    base: {
      tick: input.turn.base.tick,
      worldVersion: input.turn.base.worldVersion,
      worldTimeMinutes: input.turn.base.worldTimeMinutes ?? 0,
      chatHistoryLengthBeforeTurn: input.turn.base.chatHistoryLengthBeforeTurn,
    },
    chat: {
      userMessageIndex: userIndex,
      assistantMessageIndex: assistantIndex,
      userMessageSha256,
      assistantMessageSha256,
    },
    terminalProjection: input.projection,
    settlement: input.settlement,
    ...(input.narration ? { narration: input.narration } : {}),
    evidenceRefs: input.evidenceRefs,
    durableEventIds: {
      accepted: [],
      produced: [],
    },
    doneBoundary: {
      runtime: "gameplay-cycle-runtime",
      recordId,
      turnId: publicTurnId,
      packetId: publicPacketId,
      mutationApplied: input.projection.mutationApplied,
      settled: true,
      chatHistoryLengthBeforeTurn: input.beforeLength,
      chatHistoryLengthAfterTurn: input.beforeLength + 2,
      userMessageSha256,
      assistantMessageSha256,
    },
  });
}

export async function commitCleanPlayerFacingTurn(
  input: CommitCleanPlayerFacingTurnInput,
): Promise<CleanPlayerFacingTurnCommitResult> {
  const chat = input.chat ?? defaultChatAdapter;
  const store = input.store ?? sqliteCleanPlayerFacingTurnRecordStore;
  const committedAt = input.now ?? Date.now();

  return withSqliteWriteLock("clean-player-facing-turn-commit", () => {
    const existingByIdempotency = store.findByIdempotencyKey(
      input.turn.campaignId,
      input.turn.idempotencyKey,
    );
    if (existingByIdempotency) {
      assertExistingRecordTail({ record: existingByIdempotency, chat });
      return {
        record: existingByIdempotency,
        doneBoundary: existingByIdempotency.doneBoundary,
      };
    }

    const existingByTurn = store.findByInternalTurnId(input.turn.campaignId, input.turn.turnId);
    if (existingByTurn) {
      throw new Error("Clean turn already has a player-facing record with a different idempotency key.");
    }

    const beforeHistory = chat.getHistory(input.turn.campaignId);
    const expectedBefore = input.turn.base.chatHistoryLengthBeforeTurn;
    if (beforeHistory.length !== expectedBefore) {
      throw new Error(
        `Clean turn chat history drifted before commit: expected ${expectedBefore}, got ${beforeHistory.length}.`,
      );
    }

    chat.append(input.turn.campaignId, [
      { role: "user", content: input.turn.playerAction.normalized },
      { role: "assistant", content: input.projection.narrativeText },
    ]);

    const afterHistory = chat.getHistory(input.turn.campaignId);
    if (afterHistory.length !== expectedBefore + 2) {
      throw new Error(
        `Clean turn chat append failed: expected ${expectedBefore + 2}, got ${afterHistory.length}.`,
      );
    }

    const record = buildRecord({
      turn: input.turn,
      projection: input.projection,
      settlement: input.settlement,
      narration: input.narration,
      evidenceRefs: input.evidenceRefs,
      beforeLength: expectedBefore,
      afterHistory,
      committedAt,
    });
    store.insert(record);

    return {
      record,
      doneBoundary: record.doneBoundary,
    };
  });
}
