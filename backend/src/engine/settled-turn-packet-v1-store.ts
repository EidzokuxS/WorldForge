import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  narratorAttempts,
  settledTurnPackets,
  turnSagas,
} from "../db/schema.js";
import type { SettledTurnPacketV1 } from "./gameplay-turn-cycle-v1.js";

export interface PersistedSettledTurnPacketV1 {
  packetId: string;
  sagaId: string;
}

export interface NarrationAttemptV1 {
  attemptId: string;
  sagaId: string;
  packetId: string;
  attemptIndex: number;
}

function now(value?: number): number {
  return value ?? Date.now();
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function stringifyStringArray(values: readonly unknown[]): string {
  return JSON.stringify(uniqueStrings(values));
}

function parseJson(value: string): unknown {
  return JSON.parse(value);
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) result.add(trimmed);
  }
  return [...result];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function acceptedToolResultRefsFromPacketV1(
  packet: Pick<SettledTurnPacketV1, "acceptedToolResults">,
): string[] {
  return uniqueStrings(packet.acceptedToolResults.flatMap((accepted) => [
    accepted.result.authority?.toolResultId,
    `${accepted.stepId}:${accepted.toolName}`,
  ]));
}

export function acceptedActorResultRefsFromPacketV1(
  packet: Partial<Pick<SettledTurnPacketV1, "acceptedActorResults">>,
): string[] {
  return uniqueStrings((packet.acceptedActorResults ?? []).flatMap((accepted) => [
    accepted.result.authority?.toolResultId,
    `${accepted.settlementId}:${accepted.actorId}:${accepted.toolName}`,
  ]));
}

export function durableEventIdsFromPacketV1(
  packet: Pick<SettledTurnPacketV1, "acceptedToolResults">
    & Partial<Pick<SettledTurnPacketV1, "acceptedActorResults">>,
): string[] {
  const toolEventIds = packet.acceptedToolResults.flatMap((accepted) => {
    const resultEventId = isRecord(accepted.result.result)
      ? accepted.result.result.eventId
      : null;
    return [
      ...(accepted.result.authority?.eventRefs ?? []),
      resultEventId,
    ];
  });
  const actorEventIds = (packet.acceptedActorResults ?? []).flatMap((accepted) => {
    const resultEventId = isRecord(accepted.result.result)
      ? accepted.result.result.eventId
      : null;
    return [
      ...(accepted.result.authority?.eventRefs ?? []),
      resultEventId,
    ];
  });
  return uniqueStrings([...toolEventIds, ...actorEventIds]);
}

export function persistSettledTurnPacketV1(input: {
  packet: SettledTurnPacketV1;
  nowMs?: number;
}): PersistedSettledTurnPacketV1 {
  const timestamp = now(input.nowMs);
  const sagaId = randomUUID();
  const acceptedToolResultRefs = acceptedToolResultRefsFromPacketV1(input.packet);
  const acceptedActorResultRefs = acceptedActorResultRefsFromPacketV1(input.packet);
  const durableEventIds = durableEventIdsFromPacketV1(input.packet);
  const sourceRefs = uniqueStrings([
    ...input.packet.gmRead.evidenceRefs,
    ...input.packet.acceptedToolResults.flatMap((accepted) => accepted.result.modelSafeRefs ?? []),
    ...input.packet.acceptedActorResults.flatMap((accepted) => accepted.result.modelSafeRefs ?? []),
  ]);

  getDb().transaction((tx) => {
    tx.insert(turnSagas).values({
      id: sagaId,
      campaignId: input.packet.campaignId,
      turnId: input.packet.turnId,
      actionText: input.packet.playerAction,
      sourceActionJson: stringifyJson({
        processor: "gameplay-turn-cycle-v1",
        playerAction: input.packet.playerAction,
        gmReadPath: input.packet.gmRead.path,
      }),
      status: "resolved_pending_narration",
      statusReason: "SettledTurnPacketV1 persisted; awaiting narration.",
      statusUpdatedAt: timestamp,
      requiresNarration: true,
      baseWorldVersion: input.packet.baseWorldVersion,
      resultWorldVersion: input.packet.resultWorldVersion,
      settledTurnPacketId: input.packet.packetId,
      provenanceJson: stringifyJson({
        processor: "gameplay-turn-cycle-v1",
        role: "settled-packet-anchor",
      }),
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    tx.insert(settledTurnPackets).values({
      id: input.packet.packetId,
      campaignId: input.packet.campaignId,
      sagaId,
      turnId: input.packet.turnId,
      oracleDecisionId: null,
      canonicalTurnPacketJson: stringifyJson(input.packet),
      narratorPacketJson: stringifyJson({
        version: "settled-turn-packet-v1.narrator-source",
        packetId: input.packet.packetId,
        source: "canonicalTurnPacketJson",
      }),
      sourceRefs: stringifyStringArray(sourceRefs),
      acceptedToolResultRefs: stringifyStringArray(acceptedToolResultRefs),
      acceptedActorResultRefs: stringifyStringArray(acceptedActorResultRefs),
      acceptedDurableEventIds: stringifyStringArray(durableEventIds),
      producedDurableEventIds: stringifyStringArray(durableEventIds),
      dueWorldRefs: "[]",
      requiresNarration: true,
      baseWorldVersion: input.packet.baseWorldVersion,
      resultWorldVersion: input.packet.resultWorldVersion,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();
  });

  return { packetId: input.packet.packetId, sagaId };
}

export function readSettledTurnPacketV1(input:
  | { campaignId: string; packetId: string; turnId?: never }
  | { campaignId: string; turnId: string; packetId?: never }
): SettledTurnPacketV1 | null {
  if ("packetId" in input && input.packetId) {
    const row = getDb().select().from(settledTurnPackets).where(and(
        eq(settledTurnPackets.campaignId, input.campaignId),
        eq(settledTurnPackets.id, input.packetId),
      )).get();
    if (!row) return null;
    return parseJson(row.canonicalTurnPacketJson) as SettledTurnPacketV1;
  }

  const turnId = input.turnId;
  if (!turnId) return null;

  const row = getDb().select().from(settledTurnPackets).where(and(
    eq(settledTurnPackets.campaignId, input.campaignId),
    eq(settledTurnPackets.turnId, turnId),
  )).get();
  if (!row) return null;
  return parseJson(row.canonicalTurnPacketJson) as SettledTurnPacketV1;
}

function requirePacketRow(input: {
  campaignId: string;
  packetId: string;
}) {
  const row = getDb()
    .select()
    .from(settledTurnPackets)
    .where(and(
      eq(settledTurnPackets.campaignId, input.campaignId),
      eq(settledTurnPackets.id, input.packetId),
    ))
    .get();
  if (!row) {
    throw new Error(`SettledTurnPacketV1 ${input.packetId} not found.`);
  }
  return row;
}

export function recordNarrationAttemptStartedV1(input: {
  campaignId: string;
  packetId: string;
  nowMs?: number;
}): NarrationAttemptV1 {
  const packet = requirePacketRow(input);
  const existing = getDb()
    .select({ attemptIndex: narratorAttempts.attemptIndex })
    .from(narratorAttempts)
    .where(eq(narratorAttempts.sagaId, packet.sagaId))
    .orderBy(desc(narratorAttempts.attemptIndex))
    .get();
  const attemptIndex = (existing?.attemptIndex ?? 0) + 1;
  const attemptId = randomUUID();
  const timestamp = now(input.nowMs);

  getDb().transaction((tx) => {
    tx.insert(narratorAttempts).values({
      id: attemptId,
      campaignId: packet.campaignId,
      sagaId: packet.sagaId,
      settledTurnPacketId: packet.id,
      turnId: packet.turnId,
      attemptIndex,
      status: "started",
      groundingResultJson: "{}",
      finalText: null,
      failureReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    tx.update(turnSagas).set({
      status: "narrator_rendering",
      statusReason: "Narration attempt started for SettledTurnPacketV1.",
      statusUpdatedAt: timestamp,
      latestNarratorAttemptId: attemptId,
      updatedAt: timestamp,
    }).where(eq(turnSagas.id, packet.sagaId)).run();
  });

  return { attemptId, sagaId: packet.sagaId, packetId: packet.id, attemptIndex };
}

export function recordNarrationAttemptFailedV1(input: {
  attemptId: string;
  reason: string;
  nowMs?: number;
}): void {
  const timestamp = now(input.nowMs);
  const attempt = getDb()
    .select()
    .from(narratorAttempts)
    .where(eq(narratorAttempts.id, input.attemptId))
    .get();
  if (!attempt) throw new Error(`NarratorAttempt ${input.attemptId} not found.`);

  getDb().transaction((tx) => {
    tx.update(narratorAttempts).set({
      status: "failed",
      failureReason: input.reason,
      finalText: null,
      updatedAt: timestamp,
    }).where(and(
      eq(narratorAttempts.id, input.attemptId),
      eq(narratorAttempts.status, "started"),
    )).run();

    tx.update(turnSagas).set({
      status: "resolved_pending_narration",
      statusReason: "Narration failed; durable SettledTurnPacketV1 awaits retry.",
      statusUpdatedAt: timestamp,
      latestNarratorAttemptId: input.attemptId,
      updatedAt: timestamp,
    }).where(eq(turnSagas.id, attempt.sagaId)).run();
  });
}

export function recordNarrationAttemptSucceededV1(input: {
  attemptId: string;
  finalText: string;
  groundingResult?: unknown;
  nowMs?: number;
}): void {
  if (!input.finalText.trim()) {
    throw new Error("Successful narration attempt requires finalText.");
  }
  const timestamp = now(input.nowMs);
  getDb().update(narratorAttempts).set({
    status: "succeeded",
    groundingResultJson: stringifyJson(input.groundingResult ?? {}),
    finalText: input.finalText,
    failureReason: null,
    updatedAt: timestamp,
  }).where(and(
    eq(narratorAttempts.id, input.attemptId),
    eq(narratorAttempts.status, "started"),
  )).run();
}

export function markSettledTurnProjectedV1(input: {
  campaignId: string;
  packetId: string;
  narratorAttemptId: string;
  nowMs?: number;
}): void {
  const packet = requirePacketRow(input);
  const attempt = getDb()
    .select()
    .from(narratorAttempts)
    .where(and(
      eq(narratorAttempts.id, input.narratorAttemptId),
      eq(narratorAttempts.settledTurnPacketId, packet.id),
      eq(narratorAttempts.status, "succeeded"),
    ))
    .get();
  if (!attempt) {
    throw new Error(`Successful NarratorAttempt ${input.narratorAttemptId} not found.`);
  }
  const timestamp = now(input.nowMs);
  getDb().transaction((tx) => {
    tx.update(turnSagas).set({
      status: "finalized",
      statusReason: "SettledTurnPacketV1 projected to player-visible chat.",
      statusUpdatedAt: timestamp,
      latestNarratorAttemptId: input.narratorAttemptId,
      updatedAt: timestamp,
    }).where(and(
      eq(turnSagas.id, packet.sagaId),
      eq(turnSagas.campaignId, input.campaignId),
    )).run();

    tx.update(settledTurnPackets).set({
      updatedAt: timestamp,
    }).where(eq(settledTurnPackets.id, packet.id)).run();
  });
}
