import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  narratorAttempts,
  oracleDecisions,
  settledTurnPackets,
  turnSagaStatusValues,
  turnSagas,
  type narratorAttemptStatusValues,
} from "../db/schema.js";

export type TurnSagaStatus = (typeof turnSagaStatusValues)[number];
export type NarratorAttemptStatus = (typeof narratorAttemptStatusValues)[number];

export const TURN_SAGA_STATUSES = turnSagaStatusValues;
export const PENDING_NARRATION_STATUSES = [
  "resolved_pending_narration",
  "narrator_rendering",
  "narrator_repairing",
] as const satisfies readonly TurnSagaStatus[];

export class TurnSagaNotFoundError extends Error {
  constructor(public readonly selector: GetTurnSagaInput) {
    super("Turn saga not found.");
    this.name = "TurnSagaNotFoundError";
  }
}

export class TurnSagaTransitionError extends Error {
  constructor(
    public readonly sagaId: string,
    public readonly fromStatus: TurnSagaStatus,
    public readonly toStatus: TurnSagaStatus,
    message?: string,
  ) {
    super(message ?? `Illegal turn saga transition: ${fromStatus} -> ${toStatus}.`);
    this.name = "TurnSagaTransitionError";
  }
}

export class PendingNarrationError extends Error {
  constructor(public readonly pendingSaga: TurnSagaRecord) {
    super(
      `Campaign ${pendingSaga.campaignId} has pending narration for turn ${pendingSaga.turnId}.`,
    );
    this.name = "PendingNarrationError";
  }
}

export class PendingSettledTurnNarrationError extends PendingNarrationError {
  constructor(
    pendingSaga: TurnSagaRecord,
    public readonly causeError?: unknown,
  ) {
    super(pendingSaga);
    this.name = "PendingSettledTurnNarrationError";
  }
}

export class TurnSagaLockConflictError extends Error {
  constructor(public readonly saga: TurnSagaRecord) {
    super(`Turn saga ${saga.id} is already claimed by worker ${saga.activeWorkerId ?? "unknown"}.`);
    this.name = "TurnSagaLockConflictError";
  }
}

type TurnSagaRow = typeof turnSagas.$inferSelect;
type OracleDecisionRow = typeof oracleDecisions.$inferSelect;
type SettledTurnPacketRow = typeof settledTurnPackets.$inferSelect;
type NarratorAttemptRow = typeof narratorAttempts.$inferSelect;

export interface TurnSagaRecord {
  id: string;
  campaignId: string;
  turnId: string;
  playerId: string | null;
  actionId: string | null;
  actionText: string | null;
  sourceAction: unknown;
  status: TurnSagaStatus;
  statusReason: string | null;
  statusUpdatedAt: number;
  activeLockToken: string | null;
  activeWorkerId: string | null;
  activeStartedAt: number | null;
  requiresNarration: boolean;
  baseWorldVersion: number;
  resultWorldVersion: number | null;
  oracleDecisionId: string | null;
  settledTurnPacketId: string | null;
  latestNarratorAttemptId: string | null;
  provenance: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface OracleDecisionRecord {
  id: string;
  campaignId: string;
  sagaId: string;
  turnId: string;
  question: string;
  stakes: string;
  outcome: string;
  reasoning: string;
  mechanicalImplications: unknown;
  visibilityImplications: unknown;
  confidence: number | null;
  chance: number | null;
  requiresToolCommit: boolean;
  baseWorldVersion: number;
  acceptedWorldVersion: number | null;
  sourceRefs: string[];
  decision: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface SettledTurnPacketRecord {
  id: string;
  campaignId: string;
  sagaId: string;
  turnId: string;
  oracleDecisionId: string | null;
  canonicalTurnPacket: unknown;
  narratorPacket: unknown;
  sourceRefs: string[];
  acceptedToolResultRefs: string[];
  acceptedActorResultRefs: string[];
  dueWorldRefs: string[];
  requiresNarration: boolean;
  baseWorldVersion: number;
  resultWorldVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface NarratorAttemptRecord {
  id: string;
  campaignId: string;
  sagaId: string;
  settledTurnPacketId: string;
  turnId: string;
  attemptIndex: number;
  status: NarratorAttemptStatus;
  groundingResult: unknown;
  finalText: string | null;
  failureReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export type GetTurnSagaInput =
  | { sagaId: string }
  | { campaignId: string; turnId: string };

export type ClaimTurnSagaWorkerInput = GetTurnSagaInput & {
  workerId: string;
  lockToken?: string;
  staleAfterMs?: number;
  allowStaleReclaim?: boolean;
  nowMs?: number;
};

export type ReleaseTurnSagaWorkerInput = GetTurnSagaInput & {
  lockToken: string;
  nowMs?: number;
};

export type HeartbeatTurnSagaWorkerInput = GetTurnSagaInput & {
  lockToken: string;
  nowMs?: number;
};

export interface ClaimedTurnSaga {
  saga: TurnSagaRecord;
  lockToken: string;
  workerId: string;
}

export interface CreateTurnSagaInput {
  id?: string;
  campaignId: string;
  turnId: string;
  playerId?: string | null;
  actionId?: string | null;
  actionText?: string | null;
  sourceAction?: unknown;
  baseWorldVersion: number;
  requiresNarration?: boolean;
  activeLockToken?: string | null;
  activeWorkerId?: string | null;
  provenance?: Record<string, unknown>;
  nowMs?: number;
}

interface TransitionTurnSagaStatusFields {
  toStatus: TurnSagaStatus;
  fromStatus?: TurnSagaStatus;
  reason?: string | null;
  resultWorldVersion?: number | null;
  activeLockToken?: string | null;
  activeWorkerId?: string | null;
  lockToken?: string;
  nowMs?: number;
}

export type TransitionTurnSagaStatusInput =
  GetTurnSagaInput & TransitionTurnSagaStatusFields;

export interface PersistOracleDecisionInput {
  id?: string;
  sagaId: string;
  question: string;
  stakes: string;
  outcome: string;
  reasoning?: string;
  mechanicalImplications?: unknown;
  visibilityImplications?: unknown;
  confidence?: number | null;
  chance?: number | null;
  requiresToolCommit?: boolean;
  baseWorldVersion: number;
  acceptedWorldVersion?: number | null;
  sourceRefs?: readonly string[];
  decision?: unknown;
  nowMs?: number;
}

export interface PersistSettledTurnPacketInput {
  id?: string;
  sagaId: string;
  lockToken: string;
  oracleDecisionId?: string | null;
  canonicalTurnPacket: unknown;
  narratorPacket?: unknown;
  sourceRefs?: readonly string[];
  acceptedToolResultRefs?: readonly string[];
  acceptedActorResultRefs?: readonly string[];
  dueWorldRefs?: readonly string[];
  requiresNarration?: boolean;
  baseWorldVersion: number;
  resultWorldVersion: number;
  nowMs?: number;
}

export interface RecordNarratorAttemptInput {
  id?: string;
  sagaId: string;
  settledTurnPacketId?: string;
  attemptIndex?: number;
  status: NarratorAttemptStatus;
  groundingResult?: unknown;
  finalText?: string | null;
  failureReason?: string | null;
  lockToken?: string;
  nowMs?: number;
}

interface MarkTurnSagaFinalizedFields {
  narratorAttemptId?: string | null;
  reason?: string | null;
  lockToken?: string;
  nowMs?: number;
}

export type MarkTurnSagaFinalizedInput =
  GetTurnSagaInput & MarkTurnSagaFinalizedFields;

export type MergeTurnSagaProvenanceInput =
  GetTurnSagaInput & {
    patch: Record<string, unknown>;
    lockToken?: string;
    nowMs?: number;
  };

interface MarkTurnSagaFailedStateCorruptionFields {
  reason: string;
  nowMs?: number;
}

export type MarkTurnSagaFailedStateCorruptionInput =
  GetTurnSagaInput & MarkTurnSagaFailedStateCorruptionFields;

export type GetSettledTurnPacketInput =
  | { packetId: string; campaignId?: string }
  | { sagaId: string; campaignId?: string }
  | { campaignId: string; turnId: string };

const NEXT_STATUS_BY_STATUS: Partial<Record<TurnSagaStatus, TurnSagaStatus>> = {
  created: "collecting_context",
  collecting_context: "pre_turn_catchup",
  pre_turn_catchup: "gm_reading",
  gm_reading: "oracle_adjudicating",
  oracle_adjudicating: "tool_loop_running",
  tool_loop_running: "local_reaction_running",
  local_reaction_running: "world_consequence_running",
  world_consequence_running: "resolved_pending_narration",
  resolved_pending_narration: "narrator_rendering",
  narrator_rendering: "narrator_repairing",
  narrator_repairing: "finalized",
};

const TERMINAL_STATUSES = new Set<TurnSagaStatus>([
  "finalized",
  "failed_state_corruption",
]);

function now(input?: number): number {
  return input ?? Date.now();
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function parseStringArray(value: string): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function stringifyJson(value: unknown, fallback: unknown): string {
  try {
    const serialized = JSON.stringify(value ?? fallback);
    return serialized === undefined ? JSON.stringify(fallback) : serialized;
  } catch {
    return JSON.stringify(fallback);
  }
}

function stringifyStringArray(value: readonly string[] | undefined): string {
  return JSON.stringify([...(value ?? [])]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeJsonRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = merged[key];
    merged[key] = isPlainRecord(existing) && isPlainRecord(value)
      ? mergeJsonRecords(existing, value)
      : value;
  }
  return merged;
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertWorldVersionMatch(
  saga: TurnSagaRow,
  baseWorldVersion: number,
): void {
  assertNonNegativeInteger("baseWorldVersion", baseWorldVersion);
  if (saga.baseWorldVersion !== baseWorldVersion) {
    throw new Error(
      `Turn saga ${saga.id} baseWorldVersion mismatch: expected ${saga.baseWorldVersion}, got ${baseWorldVersion}.`,
    );
  }
}

function toTurnSaga(row: TurnSagaRow): TurnSagaRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    turnId: row.turnId,
    playerId: row.playerId ?? null,
    actionId: row.actionId ?? null,
    actionText: row.actionText ?? null,
    sourceAction: parseJson(row.sourceActionJson),
    status: row.status,
    statusReason: row.statusReason ?? null,
    statusUpdatedAt: row.statusUpdatedAt,
    activeLockToken: row.activeLockToken ?? null,
    activeWorkerId: row.activeWorkerId ?? null,
    activeStartedAt: row.activeStartedAt ?? null,
    requiresNarration: row.requiresNarration,
    baseWorldVersion: row.baseWorldVersion,
    resultWorldVersion: row.resultWorldVersion ?? null,
    oracleDecisionId: row.oracleDecisionId ?? null,
    settledTurnPacketId: row.settledTurnPacketId ?? null,
    latestNarratorAttemptId: row.latestNarratorAttemptId ?? null,
    provenance: parseJsonRecord(row.provenanceJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOracleDecision(row: OracleDecisionRow): OracleDecisionRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    sagaId: row.sagaId,
    turnId: row.turnId,
    question: row.question,
    stakes: row.stakes,
    outcome: row.outcome,
    reasoning: row.reasoning,
    mechanicalImplications: parseJson(row.mechanicalImplicationsJson),
    visibilityImplications: parseJson(row.visibilityImplicationsJson),
    confidence: row.confidence ?? null,
    chance: row.chance ?? null,
    requiresToolCommit: row.requiresToolCommit,
    baseWorldVersion: row.baseWorldVersion,
    acceptedWorldVersion: row.acceptedWorldVersion ?? null,
    sourceRefs: parseStringArray(row.sourceRefs),
    decision: parseJson(row.decisionJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSettledTurnPacket(row: SettledTurnPacketRow): SettledTurnPacketRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    sagaId: row.sagaId,
    turnId: row.turnId,
    oracleDecisionId: row.oracleDecisionId ?? null,
    canonicalTurnPacket: parseJson(row.canonicalTurnPacketJson),
    narratorPacket: parseJson(row.narratorPacketJson),
    sourceRefs: parseStringArray(row.sourceRefs),
    acceptedToolResultRefs: parseStringArray(row.acceptedToolResultRefs),
    acceptedActorResultRefs: parseStringArray(row.acceptedActorResultRefs),
    dueWorldRefs: parseStringArray(row.dueWorldRefs),
    requiresNarration: row.requiresNarration,
    baseWorldVersion: row.baseWorldVersion,
    resultWorldVersion: row.resultWorldVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toNarratorAttempt(row: NarratorAttemptRow): NarratorAttemptRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    sagaId: row.sagaId,
    settledTurnPacketId: row.settledTurnPacketId,
    turnId: row.turnId,
    attemptIndex: row.attemptIndex,
    status: row.status,
    groundingResult: parseJson(row.groundingResultJson),
    finalText: row.finalText ?? null,
    failureReason: row.failureReason ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getTurnSagaRow(input: GetTurnSagaInput): TurnSagaRow | null {
  const db = getDb();
  if ("sagaId" in input) {
    return db.select().from(turnSagas).where(eq(turnSagas.id, input.sagaId)).get() ?? null;
  }

  return db
    .select()
    .from(turnSagas)
    .where(
      and(
        eq(turnSagas.campaignId, input.campaignId),
        eq(turnSagas.turnId, input.turnId),
      ),
    )
    .get() ?? null;
}

function requireTurnSagaRow(input: GetTurnSagaInput): TurnSagaRow {
  const row = getTurnSagaRow(input);
  if (!row) {
    throw new TurnSagaNotFoundError(input);
  }
  return row;
}

function assertLegalTransition(row: TurnSagaRow, toStatus: TurnSagaStatus): void {
  if (TERMINAL_STATUSES.has(row.status)) {
    throw new TurnSagaTransitionError(
      row.id,
      row.status,
      toStatus,
      `Turn saga ${row.id} is terminal at ${row.status}.`,
    );
  }

  if (toStatus === "failed_state_corruption") {
    return;
  }

  const expected = NEXT_STATUS_BY_STATUS[row.status];
  if (expected !== toStatus) {
    throw new TurnSagaTransitionError(row.id, row.status, toStatus);
  }
}

function updateSagaStatus(
  row: TurnSagaRow,
  input: TransitionTurnSagaStatusFields,
): TurnSagaRecord {
  assertLockTokenIfProvided(row, input.lockToken);
  const timestamp = now(input.nowMs);
  const updates: Partial<typeof turnSagas.$inferInsert> = {
    status: input.toStatus,
    statusReason: input.reason ?? null,
    statusUpdatedAt: timestamp,
    updatedAt: timestamp,
  };

  if (input.resultWorldVersion !== undefined) {
    updates.resultWorldVersion = input.resultWorldVersion;
  }
  if (input.activeLockToken !== undefined) {
    updates.activeLockToken = input.activeLockToken;
  }
  if (input.activeWorkerId !== undefined) {
    updates.activeWorkerId = input.activeWorkerId;
    updates.activeStartedAt = input.activeWorkerId ? timestamp : null;
  }

  const result = getDb()
    .update(turnSagas)
    .set(updates)
    .where(and(
      eq(turnSagas.id, row.id),
      eq(turnSagas.status, row.status),
      ...lockTokenPredicate(input.lockToken),
    ))
    .run();

  if (result.changes !== 1) {
    throw new TurnSagaTransitionError(
      row.id,
      row.status,
      input.toStatus,
      `Turn saga ${row.id} changed before status update could commit.`,
    );
  }

  return toTurnSaga(requireTurnSagaRow({ sagaId: row.id }));
}

function finalizeSagaRow(
  row: TurnSagaRow,
  input: MarkTurnSagaFinalizedFields,
  narratorAttemptId: string | null,
): TurnSagaRecord {
  assertLockTokenIfProvided(row, input.lockToken);
  const timestamp = now(input.nowMs);
  const updates: Partial<typeof turnSagas.$inferInsert> = {
    status: "finalized",
    statusReason: input.reason ?? null,
    statusUpdatedAt: timestamp,
    activeLockToken: null,
    activeWorkerId: null,
    activeStartedAt: null,
    updatedAt: timestamp,
  };

  if (narratorAttemptId) {
    updates.latestNarratorAttemptId = narratorAttemptId;
  }

  const result = getDb()
    .update(turnSagas)
    .set(updates)
    .where(and(
      eq(turnSagas.id, row.id),
      eq(turnSagas.status, row.status),
      ...lockTokenPredicate(input.lockToken),
    ))
    .run();

  if (result.changes !== 1) {
    throw new TurnSagaTransitionError(
      row.id,
      row.status,
      "finalized",
      `Turn saga ${row.id} changed before finalization could commit.`,
    );
  }

  return toTurnSaga(requireTurnSagaRow({ sagaId: row.id }));
}

function requireSuccessfulNarratorAttemptForFinalization(
  saga: TurnSagaRow,
  narratorAttemptId: string,
): NarratorAttemptRow {
  const attempt = getDb()
    .select()
    .from(narratorAttempts)
    .where(eq(narratorAttempts.id, narratorAttemptId))
    .get();

  if (
    !attempt
    || attempt.sagaId !== saga.id
    || attempt.campaignId !== saga.campaignId
    || attempt.status !== "succeeded"
    || !attempt.finalText?.trim()
  ) {
    throw new Error(
      `NarratorAttempt ${narratorAttemptId} is not a successful final-prose attempt for saga ${saga.id}.`,
    );
  }

  if (
    !saga.settledTurnPacketId
    || attempt.settledTurnPacketId !== saga.settledTurnPacketId
  ) {
    throw new Error(
      `NarratorAttempt ${narratorAttemptId} is not attached to saga ${saga.id}'s settled packet.`,
    );
  }

  return attempt;
}

function isActiveLock(row: TurnSagaRow, timestamp: number, staleAfterMs: number): boolean {
  return Boolean(
    row.activeLockToken
    && row.activeStartedAt !== null
    && timestamp - row.activeStartedAt < staleAfterMs,
  );
}

function assertLockTokenIfProvided(row: TurnSagaRow, lockToken?: string): void {
  if (lockToken !== undefined && row.activeLockToken !== lockToken) {
    throw new TurnSagaLockConflictError(toTurnSaga(row));
  }
}

function lockTokenPredicate(lockToken?: string) {
  return lockToken === undefined ? [] : [eq(turnSagas.activeLockToken, lockToken)];
}

export function createTurnSaga(input: CreateTurnSagaInput): TurnSagaRecord {
  assertNonNegativeInteger("baseWorldVersion", input.baseWorldVersion);
  const timestamp = now(input.nowMs);
  const id = input.id ?? randomUUID();

  getDb()
    .insert(turnSagas)
    .values({
      id,
      campaignId: input.campaignId,
      turnId: input.turnId,
      playerId: input.playerId ?? null,
      actionId: input.actionId ?? null,
      actionText: input.actionText ?? null,
      sourceActionJson: stringifyJson(input.sourceAction ?? {}, {}),
      status: "created",
      statusReason: null,
      statusUpdatedAt: timestamp,
      activeLockToken: input.activeLockToken ?? null,
      activeWorkerId: input.activeWorkerId ?? null,
      activeStartedAt: input.activeWorkerId ? timestamp : null,
      requiresNarration: input.requiresNarration ?? true,
      baseWorldVersion: input.baseWorldVersion,
      resultWorldVersion: null,
      oracleDecisionId: null,
      settledTurnPacketId: null,
      latestNarratorAttemptId: null,
      provenanceJson: stringifyJson(input.provenance ?? {}, {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  return toTurnSaga(requireTurnSagaRow({ sagaId: id }));
}

export function getTurnSaga(input: GetTurnSagaInput): TurnSagaRecord | null {
  const row = getTurnSagaRow(input);
  return row ? toTurnSaga(row) : null;
}

export function claimTurnSagaWorker(
  input: ClaimTurnSagaWorkerInput,
): ClaimedTurnSaga {
  const row = requireTurnSagaRow(input);
  const timestamp = now(input.nowMs);
  const allowStaleReclaim = input.allowStaleReclaim ?? true;
  const staleAfterMs = input.staleAfterMs ?? 5 * 60_000;
  if (
    allowStaleReclaim
      ? isActiveLock(row, timestamp, staleAfterMs)
      : row.activeLockToken !== null
  ) {
    throw new TurnSagaLockConflictError(toTurnSaga(row));
  }

  const lockToken = input.lockToken ?? randomUUID();
  const currentLockPredicate = row.activeLockToken
    ? eq(turnSagas.activeLockToken, row.activeLockToken)
    : isNull(turnSagas.activeLockToken);

  const result = getDb()
    .update(turnSagas)
    .set({
      activeLockToken: lockToken,
      activeWorkerId: input.workerId,
      activeStartedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(and(
      eq(turnSagas.id, row.id),
      eq(turnSagas.status, row.status),
      currentLockPredicate,
    ))
    .run();

  if (result.changes !== 1) {
    const latest = requireTurnSagaRow({ sagaId: row.id });
    throw new TurnSagaLockConflictError(toTurnSaga(latest));
  }

  return {
    saga: toTurnSaga(requireTurnSagaRow({ sagaId: row.id })),
    lockToken,
    workerId: input.workerId,
  };
}

export function releaseTurnSagaWorker(
  input: ReleaseTurnSagaWorkerInput,
): TurnSagaRecord {
  const row = requireTurnSagaRow(input);
  if (row.activeLockToken === null) {
    return toTurnSaga(row);
  }
  if (row.activeLockToken !== input.lockToken) {
    throw new TurnSagaLockConflictError(toTurnSaga(row));
  }

  const timestamp = now(input.nowMs);
  const result = getDb()
    .update(turnSagas)
    .set({
      activeLockToken: null,
      activeWorkerId: null,
      activeStartedAt: null,
      updatedAt: timestamp,
    })
    .where(and(
      eq(turnSagas.id, row.id),
      eq(turnSagas.activeLockToken, input.lockToken),
    ))
    .run();

  if (result.changes !== 1) {
    const latest = requireTurnSagaRow({ sagaId: row.id });
    throw new TurnSagaLockConflictError(toTurnSaga(latest));
  }

  return toTurnSaga(requireTurnSagaRow({ sagaId: row.id }));
}

export function heartbeatTurnSagaWorker(
  input: HeartbeatTurnSagaWorkerInput,
): TurnSagaRecord {
  const row = requireTurnSagaRow(input);
  if (row.activeLockToken !== input.lockToken) {
    throw new TurnSagaLockConflictError(toTurnSaga(row));
  }

  const timestamp = now(input.nowMs);
  const result = getDb()
    .update(turnSagas)
    .set({
      activeStartedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(and(
      eq(turnSagas.id, row.id),
      eq(turnSagas.activeLockToken, input.lockToken),
    ))
    .run();

  if (result.changes !== 1) {
    const latest = requireTurnSagaRow({ sagaId: row.id });
    throw new TurnSagaLockConflictError(toTurnSaga(latest));
  }

  return toTurnSaga(requireTurnSagaRow({ sagaId: row.id }));
}

export function transitionTurnSagaStatus(
  input: TransitionTurnSagaStatusInput,
): TurnSagaRecord {
  const row = requireTurnSagaRow(input);
  if (input.fromStatus !== undefined && row.status !== input.fromStatus) {
    throw new TurnSagaTransitionError(
      row.id,
      row.status,
      input.toStatus,
      `Turn saga ${row.id} expected ${input.fromStatus}, found ${row.status}.`,
    );
  }
  assertLegalTransition(row, input.toStatus);
  return updateSagaStatus(row, input);
}

export const updateTurnSagaStatus = transitionTurnSagaStatus;

export function mergeTurnSagaProvenance(
  input: MergeTurnSagaProvenanceInput,
): TurnSagaRecord {
  const saga = requireTurnSagaRow(input);
  assertLockTokenIfProvided(saga, input.lockToken);
  const timestamp = now(input.nowMs);
  const provenance = mergeJsonRecords(parseJsonRecord(saga.provenanceJson), input.patch);

  const result = getDb()
    .update(turnSagas)
    .set({
      provenanceJson: stringifyJson(provenance, {}),
      updatedAt: timestamp,
    })
    .where(and(
      eq(turnSagas.id, saga.id),
      ...lockTokenPredicate(input.lockToken),
    ))
    .run();

  if (result.changes !== 1) {
    const latest = requireTurnSagaRow({ sagaId: saga.id });
    throw new TurnSagaLockConflictError(toTurnSaga(latest));
  }

  return toTurnSaga(requireTurnSagaRow({ sagaId: saga.id }));
}

export function persistOracleDecision(
  input: PersistOracleDecisionInput,
): OracleDecisionRecord {
  const saga = requireTurnSagaRow({ sagaId: input.sagaId });
  assertWorldVersionMatch(saga, input.baseWorldVersion);
  if (
    input.acceptedWorldVersion !== undefined
    && input.acceptedWorldVersion !== null
  ) {
    assertNonNegativeInteger("acceptedWorldVersion", input.acceptedWorldVersion);
    if (input.acceptedWorldVersion < input.baseWorldVersion) {
      throw new Error("acceptedWorldVersion cannot be lower than baseWorldVersion.");
    }
  }

  const timestamp = now(input.nowMs);
  const id = input.id ?? randomUUID();
  getDb()
    .insert(oracleDecisions)
    .values({
      id,
      campaignId: saga.campaignId,
      sagaId: saga.id,
      turnId: saga.turnId,
      question: input.question,
      stakes: input.stakes,
      outcome: input.outcome,
      reasoning: input.reasoning ?? "",
      mechanicalImplicationsJson: stringifyJson(input.mechanicalImplications ?? [], []),
      visibilityImplicationsJson: stringifyJson(input.visibilityImplications ?? [], []),
      confidence: input.confidence ?? null,
      chance: input.chance ?? null,
      requiresToolCommit: input.requiresToolCommit ?? false,
      baseWorldVersion: input.baseWorldVersion,
      acceptedWorldVersion: input.acceptedWorldVersion ?? null,
      sourceRefs: stringifyStringArray(input.sourceRefs),
      decisionJson: stringifyJson(input.decision ?? {}, {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  getDb()
    .update(turnSagas)
    .set({
      oracleDecisionId: id,
      updatedAt: timestamp,
    })
    .where(eq(turnSagas.id, saga.id))
    .run();

  const row = getDb()
    .select()
    .from(oracleDecisions)
    .where(eq(oracleDecisions.id, id))
    .get();
  if (!row) {
    throw new Error(`OracleDecision ${id} failed to persist.`);
  }
  return toOracleDecision(row);
}

export function persistSettledTurnPacket(
  input: PersistSettledTurnPacketInput,
): SettledTurnPacketRecord {
  const saga = requireTurnSagaRow({ sagaId: input.sagaId });
  assertLockTokenIfProvided(saga, input.lockToken);
  if (saga.status !== "world_consequence_running") {
    throw new TurnSagaTransitionError(
      saga.id,
      saga.status,
      "world_consequence_running",
      "SettledTurnPacket requires world_consequence_running status.",
    );
  }
  assertWorldVersionMatch(saga, input.baseWorldVersion);
  assertNonNegativeInteger("resultWorldVersion", input.resultWorldVersion);
  if (input.resultWorldVersion < input.baseWorldVersion) {
    throw new Error("resultWorldVersion cannot be lower than baseWorldVersion.");
  }

  if (input.oracleDecisionId) {
    const decision = getDb()
      .select()
      .from(oracleDecisions)
      .where(eq(oracleDecisions.id, input.oracleDecisionId))
      .get();
    if (!decision || decision.sagaId !== saga.id || decision.campaignId !== saga.campaignId) {
      throw new Error(`OracleDecision ${input.oracleDecisionId} is not attached to saga ${saga.id}.`);
    }
  }

  const timestamp = now(input.nowMs);
  const id = input.id ?? randomUUID();
  const requiresNarration = input.requiresNarration ?? true;
  const row = getDb().transaction((tx) => {
    tx
      .insert(settledTurnPackets)
      .values({
        id,
        campaignId: saga.campaignId,
        sagaId: saga.id,
        turnId: saga.turnId,
        oracleDecisionId: input.oracleDecisionId ?? null,
        canonicalTurnPacketJson: stringifyJson(input.canonicalTurnPacket, {}),
        narratorPacketJson: stringifyJson(input.narratorPacket ?? {}, {}),
        sourceRefs: stringifyStringArray(input.sourceRefs),
        acceptedToolResultRefs: stringifyStringArray(input.acceptedToolResultRefs),
        acceptedActorResultRefs: stringifyStringArray(input.acceptedActorResultRefs),
        dueWorldRefs: stringifyStringArray(input.dueWorldRefs),
        requiresNarration,
        baseWorldVersion: input.baseWorldVersion,
        resultWorldVersion: input.resultWorldVersion,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    const updates: Partial<typeof turnSagas.$inferInsert> = {
      settledTurnPacketId: id,
      resultWorldVersion: input.resultWorldVersion,
      requiresNarration,
      updatedAt: timestamp,
    };

    if (requiresNarration) {
      updates.status = "resolved_pending_narration";
      updates.statusReason = "Settled turn packet persisted; awaiting narration.";
      updates.statusUpdatedAt = timestamp;
    }

    const result = tx
      .update(turnSagas)
      .set(updates)
      .where(
        and(
          eq(turnSagas.id, saga.id),
          eq(turnSagas.status, "world_consequence_running"),
          eq(turnSagas.activeLockToken, input.lockToken),
        ),
      )
      .run();

    if (result.changes !== 1) {
      throw new TurnSagaTransitionError(
        saga.id,
        saga.status,
        requiresNarration ? "resolved_pending_narration" : saga.status,
        `Turn saga ${saga.id} changed before settled packet could commit.`,
      );
    }

    const persisted = tx
      .select()
      .from(settledTurnPackets)
      .where(eq(settledTurnPackets.id, id))
      .get();
    if (!persisted) {
      throw new Error(`SettledTurnPacket ${id} failed to persist.`);
    }
    return persisted;
  });

  return toSettledTurnPacket(row);
}

export function recordNarratorAttempt(
  input: RecordNarratorAttemptInput,
): NarratorAttemptRecord {
  const saga = requireTurnSagaRow({ sagaId: input.sagaId });
  assertLockTokenIfProvided(saga, input.lockToken);
  if (!PENDING_NARRATION_STATUSES.includes(saga.status as typeof PENDING_NARRATION_STATUSES[number])) {
    throw new TurnSagaTransitionError(
      saga.id,
      saga.status,
      saga.status,
      "Narrator attempts require resolved, rendering, or repairing saga status.",
    );
  }

  const settledTurnPacketId = input.settledTurnPacketId ?? saga.settledTurnPacketId;
  if (!settledTurnPacketId) {
    throw new Error(`Turn saga ${saga.id} has no settled packet for narrator attempt.`);
  }
  const packet = getDb()
    .select()
    .from(settledTurnPackets)
    .where(eq(settledTurnPackets.id, settledTurnPacketId))
    .get();
  if (!packet || packet.sagaId !== saga.id || packet.campaignId !== saga.campaignId) {
    throw new Error(`SettledTurnPacket ${settledTurnPacketId} is not attached to saga ${saga.id}.`);
  }

  if (input.status === "succeeded" && !input.finalText?.trim()) {
    throw new Error("Successful narrator attempt requires finalText.");
  }
  if (input.status === "failed" && !input.failureReason?.trim()) {
    throw new Error("Failed narrator attempt requires failureReason.");
  }

  const existingAttempts = getDb()
    .select({ attemptIndex: narratorAttempts.attemptIndex })
    .from(narratorAttempts)
    .where(eq(narratorAttempts.sagaId, saga.id))
    .all();
  const attemptIndex = input.attemptIndex
    ?? existingAttempts.reduce((max, row) => Math.max(max, row.attemptIndex), 0) + 1;
  if (!Number.isInteger(attemptIndex) || attemptIndex < 1) {
    throw new Error("attemptIndex must be a positive integer.");
  }

  const timestamp = now(input.nowMs);
  const id = input.id ?? randomUUID();
  getDb().transaction((tx) => {
    tx
      .insert(narratorAttempts)
      .values({
        id,
        campaignId: saga.campaignId,
        sagaId: saga.id,
        settledTurnPacketId,
        turnId: saga.turnId,
        attemptIndex,
        status: input.status,
        groundingResultJson: stringifyJson(input.groundingResult ?? {}, {}),
        finalText: input.finalText ?? null,
        failureReason: input.failureReason ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    const result = tx
      .update(turnSagas)
      .set({
        latestNarratorAttemptId: id,
        updatedAt: timestamp,
      })
      .where(and(
        eq(turnSagas.id, saga.id),
        ...lockTokenPredicate(input.lockToken),
      ))
      .run();

    if (result.changes !== 1) {
      const latest = requireTurnSagaRow({ sagaId: saga.id });
      throw new TurnSagaLockConflictError(toTurnSaga(latest));
    }
  });

  const row = getDb()
    .select()
    .from(narratorAttempts)
    .where(eq(narratorAttempts.id, id))
    .get();
  if (!row) {
    throw new Error(`NarratorAttempt ${id} failed to persist.`);
  }
  return toNarratorAttempt(row);
}

export function findLatestSuccessfulNarratorAttempt(input: {
  sagaId: string;
  settledTurnPacketId: string;
  campaignId?: string;
}): NarratorAttemptRecord | null {
  const filters = [
    eq(narratorAttempts.sagaId, input.sagaId),
    eq(narratorAttempts.settledTurnPacketId, input.settledTurnPacketId),
    eq(narratorAttempts.status, "succeeded"),
  ];
  if (input.campaignId) {
    filters.push(eq(narratorAttempts.campaignId, input.campaignId));
  }

  const row = getDb()
    .select()
    .from(narratorAttempts)
    .where(and(...filters))
    .orderBy(desc(narratorAttempts.attemptIndex), desc(narratorAttempts.createdAt))
    .get();

  return row && row.finalText?.trim() ? toNarratorAttempt(row) : null;
}

export function markTurnSagaFinalized(
  input: MarkTurnSagaFinalizedInput,
): TurnSagaRecord {
  const saga = requireTurnSagaRow(input);
  const narratorAttemptId = input.narratorAttemptId
    ?? (saga.requiresNarration ? saga.latestNarratorAttemptId : null);
  const narratorAttempt = narratorAttemptId
    ? requireSuccessfulNarratorAttemptForFinalization(saga, narratorAttemptId)
    : null;

  if (saga.requiresNarration) {
    if (!narratorAttempt) {
      throw new Error(
        `Turn saga ${saga.id} requires a successful narrator attempt before finalization.`,
      );
    }
    if (
      saga.status !== "narrator_rendering"
      && saga.status !== "narrator_repairing"
    ) {
      throw new TurnSagaTransitionError(saga.id, saga.status, "finalized");
    }
    return finalizeSagaRow(saga, input, narratorAttempt.id);
  }

  if (saga.status === "world_consequence_running") {
    return finalizeSagaRow(saga, input, narratorAttempt?.id ?? null);
  }

  assertLegalTransition(saga, "finalized");
  return finalizeSagaRow(saga, input, narratorAttempt?.id ?? null);
}

export function markTurnSagaFinalizedIfNeeded(
  input: MarkTurnSagaFinalizedInput,
): TurnSagaRecord {
  const saga = requireTurnSagaRow(input);
  if (saga.status !== "finalized") {
    return markTurnSagaFinalized(input);
  }
  assertLockTokenIfProvided(saga, input.lockToken);

  const narratorAttemptId = input.narratorAttemptId
    ?? (saga.requiresNarration ? saga.latestNarratorAttemptId : null);
  if (saga.requiresNarration) {
    if (!narratorAttemptId || saga.latestNarratorAttemptId !== narratorAttemptId) {
      throw new TurnSagaTransitionError(
        saga.id,
        saga.status,
        "finalized",
        `Turn saga ${saga.id} is already finalized with a different narrator attempt.`,
      );
    }
    requireSuccessfulNarratorAttemptForFinalization(saga, narratorAttemptId);
  } else if (
    narratorAttemptId
    && saga.latestNarratorAttemptId
    && saga.latestNarratorAttemptId !== narratorAttemptId
  ) {
    throw new TurnSagaTransitionError(
      saga.id,
      saga.status,
      "finalized",
      `Turn saga ${saga.id} is already finalized with a different narrator attempt.`,
    );
  }

  return toTurnSaga(saga);
}

export function markTurnSagaFailedStateCorruption(
  input: MarkTurnSagaFailedStateCorruptionInput,
): TurnSagaRecord {
  const saga = requireTurnSagaRow(input);
  if (TERMINAL_STATUSES.has(saga.status)) {
    throw new TurnSagaTransitionError(
      saga.id,
      saga.status,
      "failed_state_corruption",
      `Turn saga ${saga.id} is terminal at ${saga.status}.`,
    );
  }

  return updateSagaStatus(saga, {
    toStatus: "failed_state_corruption",
    reason: input.reason,
    nowMs: input.nowMs,
  });
}

export function getSettledTurnPacket(
  input: GetSettledTurnPacketInput,
): SettledTurnPacketRecord | null {
  const db = getDb();
  let row: SettledTurnPacketRow | undefined;

  if ("packetId" in input) {
    row = input.campaignId
      ? db
        .select()
        .from(settledTurnPackets)
        .where(
          and(
            eq(settledTurnPackets.id, input.packetId),
            eq(settledTurnPackets.campaignId, input.campaignId),
          ),
        )
        .get()
      : db
        .select()
        .from(settledTurnPackets)
        .where(eq(settledTurnPackets.id, input.packetId))
        .get();
  } else if ("sagaId" in input) {
    row = input.campaignId
      ? db
        .select()
        .from(settledTurnPackets)
        .where(
          and(
            eq(settledTurnPackets.sagaId, input.sagaId),
            eq(settledTurnPackets.campaignId, input.campaignId),
          ),
        )
        .get()
      : db
        .select()
        .from(settledTurnPackets)
        .where(eq(settledTurnPackets.sagaId, input.sagaId))
        .get();
  } else {
    row = db
      .select()
      .from(settledTurnPackets)
      .where(
        and(
          eq(settledTurnPackets.campaignId, input.campaignId),
          eq(settledTurnPackets.turnId, input.turnId),
        ),
      )
      .get();
  }

  return row ? toSettledTurnPacket(row) : null;
}

export function findPendingNarrationSaga(input: {
  campaignId: string;
}): TurnSagaRecord | null {
  const pendingNarration = and(
    eq(turnSagas.requiresNarration, true),
    inArray(turnSagas.status, [...PENDING_NARRATION_STATUSES]),
  );
  const repairBlockingWorldConsequence = and(
    eq(turnSagas.status, "world_consequence_running"),
    or(
      isNotNull(turnSagas.activeLockToken),
      isNotNull(turnSagas.activeWorkerId),
      isNotNull(turnSagas.oracleDecisionId),
      isNotNull(turnSagas.settledTurnPacketId),
      isNotNull(turnSagas.resultWorldVersion),
      eq(turnSagas.requiresNarration, true),
    ),
  );
  const row = getDb()
    .select()
    .from(turnSagas)
    .where(
      and(
        eq(turnSagas.campaignId, input.campaignId),
        or(pendingNarration, repairBlockingWorldConsequence),
      ),
    )
    .orderBy(asc(turnSagas.createdAt))
    .get();

  return row ? toTurnSaga(row) : null;
}

export function assertNoPendingNarrationBeforeNewTurn(input: {
  campaignId: string;
}): void {
  const pendingSaga = findPendingNarrationSaga(input);
  if (pendingSaga) {
    throw new PendingNarrationError(pendingSaga);
  }
}
