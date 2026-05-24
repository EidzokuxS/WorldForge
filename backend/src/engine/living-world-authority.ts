import crypto from "node:crypto";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  actorKnowledgeRecords,
  actorProcessStates,
  authorityTraces,
  factionOperations,
  factionReports,
  worldThreads,
  simulationJobs,
  simulationProposals,
  turnClockLedger,
  worldClocks,
} from "../db/schema.js";
import type { ToolResultAuthority } from "./tool-result.js";
import {
  TURN_CLOCK_LEDGER_ENTRY_SCHEMA,
  type ClockLedgerReasonKind,
  type TurnClockLedgerEntry,
} from "./gameplay-control-plane-contract.js";

export type AuthoritySourceEntity = {
  type: string;
  id?: string | null;
};

export type WorldClockState = {
  campaignId: string;
  worldVersion: number;
  worldTimeMinutes: number;
  currentTick: number;
  updatedAt: number;
};

export type PersistedTurnClockLedgerEntry = TurnClockLedgerEntry & {
  createdAt: number;
};

export class WorldVersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldVersionConflictError";
  }
}

function now(): number {
  return Date.now();
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stringifyArray(value: readonly string[] | undefined): string {
  return JSON.stringify([...(value ?? [])]);
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function clockReceiptId(input: {
  campaignId: string;
  sourceReceiptRef: string | null;
  turnId: string;
  resultWorldVersion: number;
  deltaMinutes: number;
  reasonKind: ClockLedgerReasonKind;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update(stableJson(input))
    .digest("hex")
    .slice(0, 32);
  return `clock_${digest}`;
}

function authoritySourceReceiptRef(toolResultId: string): string {
  return `authority:${toolResultId}`;
}

function clockReasonKindForAuthority(input: {
  operation: string;
  elapsedWorldTimeMinutes: number;
  explicitReason?: ClockLedgerReasonKind;
}): ClockLedgerReasonKind {
  if (input.explicitReason) return input.explicitReason;
  if (input.elapsedWorldTimeMinutes === 0) return "zero_time_status";
  if (input.operation.includes("advance_time")) return "tool_time_effect";
  if (input.operation.includes("travel") || input.operation.includes("move")) return "travel";
  if (input.operation.includes("wait")) return "wait";
  return "tool_time_effect";
}

function toolResultAuthorityFromTrace(
  trace: typeof authorityTraces.$inferSelect,
): ToolResultAuthority {
  return {
    toolResultId: trace.toolResultId ?? "",
    campaignId: trace.campaignId,
    sourceEntity: {
      type: trace.sourceEntityType,
      id: trace.sourceEntityId,
    },
    baseWorldVersion: trace.baseWorldVersion,
    resultWorldVersion: trace.resultWorldVersion,
    worldTimeMinutes: trace.worldTimeMinutes,
    elapsedWorldTimeMinutes: trace.elapsedWorldTimeMinutes,
    stateDeltaRefs: parseStringArray(trace.stateDeltaRefs),
    eventRefs: parseStringArray(trace.eventIds),
    witnesses: parseStringArray(trace.witnesses),
    knowledgeOutputs: [],
    visibilityOutputs: [],
    resources: [],
  };
}

function existingAuthorityTraceByToolResultId(input: {
  campaignId: string;
  toolResultId: string | null | undefined;
}): typeof authorityTraces.$inferSelect | null {
  if (!input.toolResultId) return null;
  const row = getDb()
    .select()
    .from(authorityTraces)
    .where(and(
      eq(authorityTraces.campaignId, input.campaignId),
      eq(authorityTraces.toolResultId, input.toolResultId),
    ))
    .get();
  if (!row) return null;
  if (row.campaignId !== input.campaignId || row.toolResultId !== input.toolResultId) {
    return null;
  }
  return row;
}

function toClockState(row: typeof worldClocks.$inferSelect): WorldClockState {
  return {
    campaignId: row.campaignId,
    worldVersion: Math.max(0, row.worldVersion ?? 0),
    worldTimeMinutes: Math.max(0, row.worldTimeMinutes ?? row.currentTick ?? 0),
    currentTick: Math.max(0, row.currentTick ?? row.worldTimeMinutes ?? 0),
    updatedAt: row.updatedAt ?? now(),
  };
}

export function ensureWorldClock(input: {
  campaignId: string;
  currentTick?: number;
  worldTimeMinutes?: number;
}): WorldClockState {
  const db = getDb();
  const existing = db
    .select()
    .from(worldClocks)
    .where(eq(worldClocks.campaignId, input.campaignId))
    .get();
  if (existing) {
    return toClockState(existing);
  }

  const tick = Math.max(0, input.currentTick ?? 0);
  const worldTimeMinutes = Math.max(0, input.worldTimeMinutes ?? 0);
  const row = {
    campaignId: input.campaignId,
    worldVersion: 0,
    worldTimeMinutes,
    currentTick: tick,
    updatedAt: now(),
  } satisfies typeof worldClocks.$inferInsert;

  db.insert(worldClocks).values(row).run();
  return row;
}

export function readWorldClock(campaignId: string): WorldClockState {
  return ensureWorldClock({ campaignId });
}

export function readTurnClockLedger(campaignId: string): PersistedTurnClockLedgerEntry[] {
  return getDb()
    .select()
    .from(turnClockLedger)
    .where(eq(turnClockLedger.campaignId, campaignId))
    .orderBy(asc(turnClockLedger.createdAt), asc(turnClockLedger.clockReceiptId))
    .all()
    .map((row) => ({
      clockReceiptId: row.clockReceiptId,
      campaignId: row.campaignId,
      turnId: row.turnId,
      uiTurnOrdinal: row.uiTurnOrdinal,
      baseWorldVersion: row.baseWorldVersion,
      deltaMinutes: row.deltaMinutes,
      reasonKind: row.reasonKind,
      sourceReceiptRef: row.sourceReceiptRef,
      resultWorldTimeMinutes: row.resultWorldTimeMinutes,
      resultWorldVersion: row.resultWorldVersion,
      createdAt: row.createdAt,
    }));
}

export function syncWorldClockTurnBoundary(input: {
  campaignId: string;
  currentTick: number;
  worldTimeMinutes?: number;
}): WorldClockState {
  const db = getDb();
  const targetTick = Math.max(0, input.currentTick);
  const requestedWorldTime = input.worldTimeMinutes == null
    ? null
    : Math.max(0, input.worldTimeMinutes);
  const existing = db
    .select()
    .from(worldClocks)
    .where(eq(worldClocks.campaignId, input.campaignId))
    .get();

  if (!existing) {
    return ensureWorldClock({
      campaignId: input.campaignId,
      currentTick: targetTick,
      worldTimeMinutes: requestedWorldTime ?? 0,
    });
  }

  const clock = toClockState(existing);
  if (requestedWorldTime !== null && requestedWorldTime > clock.worldTimeMinutes) {
    throw new WorldVersionConflictError(
      `World time cannot be advanced by turn-boundary sync for campaign ${input.campaignId}; commit a clock ledger receipt instead.`,
    );
  }
  if (clock.currentTick >= targetTick) {
    return clock;
  }

  const update = db
    .update(worldClocks)
    .set({
      currentTick: Math.max(clock.currentTick, targetTick),
      updatedAt: now(),
    })
    .where(
      and(
        eq(worldClocks.campaignId, input.campaignId),
        eq(worldClocks.currentTick, existing.currentTick),
      ),
    )
    .run();

  if (update.changes !== 1) {
    const latest = readWorldClock(input.campaignId);
    if (latest.currentTick >= targetTick) {
      return latest;
    }
    throw new WorldVersionConflictError(
      `World clock changed while syncing turn boundary for campaign ${input.campaignId}.`,
    );
  }

  return readWorldClock(input.campaignId);
}

export function validateBaseWorldVersion(input: {
  campaignId: string;
  baseWorldVersion: number;
  currentTick?: number;
}): WorldClockState {
  const clock = ensureWorldClock({
    campaignId: input.campaignId,
    currentTick: input.currentTick,
  });
  if (clock.worldVersion !== input.baseWorldVersion) {
    throw new WorldVersionConflictError(
      `Stale world version for campaign ${input.campaignId}: expected ${clock.worldVersion}, got ${input.baseWorldVersion}.`,
    );
  }
  return clock;
}

export function commitAuthorityTrace(input: {
  campaignId: string;
  operation: string;
  baseWorldVersion: number;
  sourceEntity: AuthoritySourceEntity;
  elapsedWorldTimeMinutes?: number;
  clockReasonKind?: ClockLedgerReasonKind;
  turnId?: string;
  uiTurnOrdinal?: number;
  currentTick?: number;
  toolResultId?: string;
  eventIds?: string[];
  stateDeltaRefs?: string[];
  witnesses?: string[];
  metadata?: unknown;
}): ToolResultAuthority {
  const db = getDb();
  const toolResultId = input.toolResultId ?? crypto.randomUUID();
  const existingTrace = existingAuthorityTraceByToolResultId({
    campaignId: input.campaignId,
    toolResultId,
  });
  if (existingTrace) {
    if (existingTrace.operation !== input.operation) {
      throw new WorldVersionConflictError(
        `Tool result id ${toolResultId} for campaign ${input.campaignId} already belongs to ${existingTrace.operation}, not ${input.operation}.`,
      );
    }
    return toolResultAuthorityFromTrace(existingTrace);
  }

  return db.transaction(() => {
    const clock = validateBaseWorldVersion({
      campaignId: input.campaignId,
      baseWorldVersion: input.baseWorldVersion,
      currentTick: input.currentTick,
    });
    const elapsedWorldTimeMinutes = Math.max(0, input.elapsedWorldTimeMinutes ?? 0);
    const resultWorldVersion = clock.worldVersion + 1;
    const resultWorldTimeMinutes = clock.worldTimeMinutes + elapsedWorldTimeMinutes;
    const resultTick = Math.max(
      clock.currentTick,
      input.currentTick ?? clock.currentTick,
      resultWorldTimeMinutes,
    );
    const timestamp = now();

    const clockUpdate = db.update(worldClocks)
      .set({
        worldVersion: resultWorldVersion,
        worldTimeMinutes: resultWorldTimeMinutes,
        currentTick: resultTick,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(worldClocks.campaignId, input.campaignId),
          eq(worldClocks.worldVersion, clock.worldVersion),
        ),
      )
      .run();
    if (clockUpdate.changes !== 1) {
      throw new WorldVersionConflictError(
        `World version changed while committing ${input.operation} for campaign ${input.campaignId}.`,
      );
    }

    db.insert(authorityTraces)
      .values({
        id: crypto.randomUUID(),
        campaignId: input.campaignId,
        operation: input.operation,
        sourceEntityType: input.sourceEntity.type,
        sourceEntityId: input.sourceEntity.id ?? null,
        baseWorldVersion: clock.worldVersion,
        resultWorldVersion,
        worldTimeMinutes: resultWorldTimeMinutes,
        elapsedWorldTimeMinutes,
        toolResultId,
        eventIds: stringifyArray(input.eventIds),
        stateDeltaRefs: stringifyArray(input.stateDeltaRefs),
        witnesses: stringifyArray(input.witnesses),
        metadata: stringifyJson(input.metadata),
        createdAt: timestamp,
      })
      .run();

    const sourceReceiptRef = authoritySourceReceiptRef(toolResultId);
    const reasonKind = clockReasonKindForAuthority({
      operation: input.operation,
      elapsedWorldTimeMinutes,
      explicitReason: input.clockReasonKind,
    });
    const ledgerEntry = TURN_CLOCK_LEDGER_ENTRY_SCHEMA.parse({
      clockReceiptId: clockReceiptId({
        campaignId: input.campaignId,
        sourceReceiptRef,
        turnId: input.turnId ?? sourceReceiptRef,
        resultWorldVersion,
        deltaMinutes: elapsedWorldTimeMinutes,
        reasonKind,
      }),
      campaignId: input.campaignId,
      turnId: input.turnId ?? sourceReceiptRef,
      uiTurnOrdinal: Math.max(0, input.uiTurnOrdinal ?? input.currentTick ?? clock.currentTick),
      baseWorldVersion: clock.worldVersion,
      deltaMinutes: elapsedWorldTimeMinutes,
      reasonKind,
      sourceReceiptRef,
      resultWorldTimeMinutes,
      resultWorldVersion,
    });

    db.insert(turnClockLedger)
      .values({
        ...ledgerEntry,
        createdAt: timestamp,
      } satisfies typeof turnClockLedger.$inferInsert)
      .run();

    return {
      toolResultId,
      campaignId: input.campaignId,
      sourceEntity: input.sourceEntity,
      baseWorldVersion: clock.worldVersion,
      resultWorldVersion,
      worldTimeMinutes: resultWorldTimeMinutes,
      elapsedWorldTimeMinutes,
      stateDeltaRefs: input.stateDeltaRefs ?? [],
      eventRefs: input.eventIds ?? [],
      witnesses: input.witnesses ?? [],
      knowledgeOutputs: [],
      visibilityOutputs: [],
      resources: [],
    };
  });
}

export function queueSimulationJob(input: {
  campaignId: string;
  jobType: string;
  baseWorldVersion: number;
  sourceEntity: AuthoritySourceEntity;
  idempotencyKey?: string | null;
  scheduledWorldTimeMinutes?: number;
  priority?: number;
  payload?: unknown;
}): string {
  const clock = validateBaseWorldVersion({
    campaignId: input.campaignId,
    baseWorldVersion: input.baseWorldVersion,
  });
  if (input.idempotencyKey) {
    const existing = getDb()
      .select({ id: simulationJobs.id })
      .from(simulationJobs)
      .where(and(
        eq(simulationJobs.campaignId, input.campaignId),
        eq(simulationJobs.idempotencyKey, input.idempotencyKey),
      ))
      .get();
    if (existing) {
      return existing.id;
    }
  }
  const jobId = crypto.randomUUID();
  const timestamp = now();
  const insert = getDb()
    .insert(simulationJobs)
    .values({
      id: jobId,
      campaignId: input.campaignId,
      jobType: input.jobType,
      idempotencyKey: input.idempotencyKey ?? null,
      status: "queued",
      priority: input.priority ?? 0,
      baseWorldVersion: clock.worldVersion,
      resultWorldVersion: null,
      scheduledWorldTimeMinutes:
        input.scheduledWorldTimeMinutes ?? clock.worldTimeMinutes,
      createdWorldTimeMinutes: clock.worldTimeMinutes,
      sourceEntityType: input.sourceEntity.type,
      sourceEntityId: input.sourceEntity.id ?? null,
      payload: stringifyJson(input.payload),
      canceledReason: null,
      supersededByJobId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  const result = input.idempotencyKey
    ? insert
        .onConflictDoNothing({
          target: [simulationJobs.campaignId, simulationJobs.idempotencyKey],
        })
        .run()
    : insert.run();
  if (result.changes === 1) {
    return jobId;
  }
  const existing = input.idempotencyKey
    ? getDb()
        .select({ id: simulationJobs.id })
        .from(simulationJobs)
        .where(and(
          eq(simulationJobs.campaignId, input.campaignId),
          eq(simulationJobs.idempotencyKey, input.idempotencyKey),
        ))
        .get()
    : null;
  if (!existing) {
    throw new Error(`Simulation job idempotency collision could not be resolved for campaign ${input.campaignId}.`);
  }
  return existing.id;
}

export function recordSimulationProposal(input: {
  campaignId: string;
  proposalType: string;
  baseWorldVersion: number;
  sourceEntity: AuthoritySourceEntity;
  jobId?: string | null;
  idempotencyKey?: string | null;
  proposedWorldVersion?: number | null;
  payload?: unknown;
  toolResultId?: string | null;
}): string {
  const clock = validateBaseWorldVersion({
    campaignId: input.campaignId,
    baseWorldVersion: input.baseWorldVersion,
  });
  if (input.idempotencyKey) {
    const existing = getDb()
      .select({ id: simulationProposals.id })
      .from(simulationProposals)
      .where(and(
        eq(simulationProposals.campaignId, input.campaignId),
        eq(simulationProposals.idempotencyKey, input.idempotencyKey),
      ))
      .get();
    if (existing) {
      return existing.id;
    }
  }
  const proposalId = crypto.randomUUID();
  const timestamp = now();
  const insert = getDb()
    .insert(simulationProposals)
    .values({
      id: proposalId,
      campaignId: input.campaignId,
      jobId: input.jobId ?? null,
      proposalType: input.proposalType,
      idempotencyKey: input.idempotencyKey ?? null,
      status: "pending",
      baseWorldVersion: clock.worldVersion,
      proposedWorldVersion: input.proposedWorldVersion ?? null,
      committedWorldVersion: null,
      sourceEntityType: input.sourceEntity.type,
      sourceEntityId: input.sourceEntity.id ?? null,
      payload: stringifyJson(input.payload),
      toolResultId: input.toolResultId ?? null,
      rejectionReason: null,
      createdWorldTimeMinutes: clock.worldTimeMinutes,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  const result = input.idempotencyKey
    ? insert
        .onConflictDoNothing({
          target: [
            simulationProposals.campaignId,
            simulationProposals.idempotencyKey,
          ],
        })
        .run()
    : insert.run();
  if (result.changes === 1) {
    return proposalId;
  }
  const existing = input.idempotencyKey
    ? getDb()
        .select({ id: simulationProposals.id })
        .from(simulationProposals)
        .where(and(
          eq(simulationProposals.campaignId, input.campaignId),
          eq(simulationProposals.idempotencyKey, input.idempotencyKey),
        ))
        .get()
    : null;
  if (!existing) {
    throw new Error(`Simulation proposal idempotency collision could not be resolved for campaign ${input.campaignId}.`);
  }
  return existing.id;
}

export function upsertActorProcessState(input: {
  campaignId: string;
  actorType: string;
  actorId: string;
  status?: "dormant" | "queued" | "running" | "waiting" | "disabled";
  lastWorldVersion: number;
  lastWakeWorldTimeMinutes?: number | null;
  nextWakeWorldTimeMinutes?: number | null;
  processState?: unknown;
}): string {
  const timestamp = now();
  const id = crypto.randomUUID();
  getDb()
    .insert(actorProcessStates)
    .values({
      id,
      campaignId: input.campaignId,
      actorType: input.actorType,
      actorId: input.actorId,
      status: input.status ?? "dormant",
      lastWorldVersion: input.lastWorldVersion,
      lastWakeWorldTimeMinutes: input.lastWakeWorldTimeMinutes ?? null,
      nextWakeWorldTimeMinutes: input.nextWakeWorldTimeMinutes ?? null,
      memoryCursor: null,
      processState: stringifyJson(input.processState),
      disabledReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [
        actorProcessStates.campaignId,
        actorProcessStates.actorType,
        actorProcessStates.actorId,
      ],
      set: {
        status: input.status ?? "dormant",
        lastWorldVersion: input.lastWorldVersion,
        lastWakeWorldTimeMinutes: input.lastWakeWorldTimeMinutes ?? null,
        nextWakeWorldTimeMinutes: input.nextWakeWorldTimeMinutes ?? null,
        processState: stringifyJson(input.processState),
        disabledReason: null,
        updatedAt: timestamp,
      },
    })
    .run();
  return id;
}

export function invalidateAuthorityAfterRestore(input: {
  campaignId: string;
  restoredWorldVersion: number;
  restoredWorldTimeMinutes: number;
  reason: string;
}): void {
  const timestamp = now();
  const priorClock = readWorldClock(input.campaignId);
  const futureJobFilter = and(
    eq(simulationJobs.campaignId, input.campaignId),
    inArray(simulationJobs.status, ["queued", "running", "completed", "failed"]),
    or(
      gt(simulationJobs.baseWorldVersion, input.restoredWorldVersion),
      gt(simulationJobs.resultWorldVersion, input.restoredWorldVersion),
      gt(simulationJobs.scheduledWorldTimeMinutes, input.restoredWorldTimeMinutes),
      gt(simulationJobs.createdWorldTimeMinutes, input.restoredWorldTimeMinutes),
    ),
  );

  const futureProposalFilter = and(
    eq(simulationProposals.campaignId, input.campaignId),
    inArray(simulationProposals.status, ["pending", "committed"]),
    or(
      gt(simulationProposals.baseWorldVersion, input.restoredWorldVersion),
      gt(simulationProposals.proposedWorldVersion, input.restoredWorldVersion),
      gt(simulationProposals.committedWorldVersion, input.restoredWorldVersion),
      gt(simulationProposals.createdWorldTimeMinutes, input.restoredWorldTimeMinutes),
    ),
  );

  getDb()
    .update(simulationJobs)
    .set({
      status: "canceled",
      canceledReason: input.reason,
      updatedAt: timestamp,
    })
    .where(futureJobFilter)
    .run();

  getDb()
    .update(simulationProposals)
    .set({
      status: "canceled",
      rejectionReason: input.reason,
      updatedAt: timestamp,
    })
    .where(futureProposalFilter)
    .run();

  getDb()
    .update(actorProcessStates)
    .set({
      status: "disabled",
      disabledReason: input.reason,
      nextWakeWorldTimeMinutes: null,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(actorProcessStates.campaignId, input.campaignId),
        gt(actorProcessStates.lastWorldVersion, input.restoredWorldVersion),
      ),
    )
    .run();

  getDb()
    .update(actorKnowledgeRecords)
    .set({
      invalidatedAtWorldVersion: input.restoredWorldVersion,
      metadata: JSON.stringify({ invalidationReason: input.reason }),
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(actorKnowledgeRecords.campaignId, input.campaignId),
        or(
          gt(actorKnowledgeRecords.baseWorldVersion, input.restoredWorldVersion),
          gt(actorKnowledgeRecords.validFromWorldVersion, input.restoredWorldVersion),
          gt(actorKnowledgeRecords.observedAtWorldVersion, input.restoredWorldVersion),
        ),
      ),
    )
    .run();

  getDb()
    .update(factionReports)
    .set({
      status: "invalidated",
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(factionReports.campaignId, input.campaignId),
        inArray(factionReports.status, ["in_transit", "available"]),
        or(
          gt(factionReports.baseWorldVersion, input.restoredWorldVersion),
          gt(factionReports.createdWorldTimeMinutes, input.restoredWorldTimeMinutes),
          gt(factionReports.deliverAtWorldTimeMinutes, input.restoredWorldTimeMinutes),
          gt(factionReports.deliveredWorldTimeMinutes, input.restoredWorldTimeMinutes),
        ),
      ),
    )
    .run();

  getDb()
    .update(factionOperations)
    .set({
      status: "canceled",
      blockedReason: input.reason,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(factionOperations.campaignId, input.campaignId),
        inArray(factionOperations.status, ["proposed", "committed"]),
        or(
          gt(factionOperations.baseWorldVersion, input.restoredWorldVersion),
          gt(factionOperations.committedWorldVersion, input.restoredWorldVersion),
        ),
      ),
    )
    .run();

  getDb()
    .update(worldThreads)
    .set({
      status: "invalidated",
      metadata: JSON.stringify({ invalidationReason: input.reason }),
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(worldThreads.campaignId, input.campaignId),
        inArray(worldThreads.status, ["active", "paused", "resolved"]),
        or(
          gt(worldThreads.baseWorldVersion, input.restoredWorldVersion),
          gt(worldThreads.lastAdvancedWorldVersion, input.restoredWorldVersion),
          gt(worldThreads.createdWorldTimeMinutes, input.restoredWorldTimeMinutes),
          gt(worldThreads.updatedWorldTimeMinutes, input.restoredWorldTimeMinutes),
          gt(worldThreads.nextDueWorldTimeMinutes, input.restoredWorldTimeMinutes),
        ),
      ),
    )
    .run();

  getDb()
    .update(worldClocks)
    .set({
      worldVersion: input.restoredWorldVersion,
      worldTimeMinutes: input.restoredWorldTimeMinutes,
      currentTick: input.restoredWorldTimeMinutes,
      updatedAt: timestamp,
    })
    .where(eq(worldClocks.campaignId, input.campaignId))
    .run();

  const sourceReceiptRef = `restore:${input.restoredWorldVersion}:${input.restoredWorldTimeMinutes}`;
  const ledgerEntry = TURN_CLOCK_LEDGER_ENTRY_SCHEMA.parse({
    clockReceiptId: clockReceiptId({
      campaignId: input.campaignId,
      sourceReceiptRef,
      turnId: sourceReceiptRef,
      resultWorldVersion: input.restoredWorldVersion,
      deltaMinutes: 0,
      reasonKind: "replay_restore",
    }),
    campaignId: input.campaignId,
    turnId: sourceReceiptRef,
    uiTurnOrdinal: input.restoredWorldTimeMinutes,
    baseWorldVersion: priorClock.worldVersion,
    deltaMinutes: 0,
    reasonKind: "replay_restore",
    sourceReceiptRef,
    resultWorldTimeMinutes: input.restoredWorldTimeMinutes,
    resultWorldVersion: input.restoredWorldVersion,
  });
  getDb()
    .insert(turnClockLedger)
    .values({
      ...ledgerEntry,
      createdAt: timestamp,
    } satisfies typeof turnClockLedger.$inferInsert)
    .onConflictDoNothing({ target: turnClockLedger.clockReceiptId })
    .run();
}
