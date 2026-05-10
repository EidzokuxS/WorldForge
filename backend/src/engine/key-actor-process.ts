import { and, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { actorProcessStates, npcs } from "../db/schema.js";
import {
  readWorldClock,
  upsertActorProcessState,
} from "./living-world-authority.js";

export const KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES = 30;
export const KEY_ACTOR_AGENCY_DEBT_WAKE_THRESHOLD = 3;

export type ActorProcessStatus =
  | "dormant"
  | "queued"
  | "running"
  | "waiting"
  | "disabled";

export type ActorProcessRoute =
  | "required_before_done"
  | "proposal_after_done"
  | "deterministic_continuation"
  | "sleeping";

export interface KeyActorPlanStep {
  id: string;
  summary: string;
  deterministic?: boolean;
  writeScopes?: string[];
  deadlineWorldTimeMinutes?: number | null;
  action?: KeyActorDeterministicPlanAction | null;
}

export type KeyActorDeterministicPlanAction =
  | {
      kind: "travel";
      destinationLocationId?: string | null;
      destinationLocationName?: string | null;
      summary?: string | null;
    }
  | {
      kind: "wait";
      durationWorldTimeMinutes?: number | null;
      summary?: string | null;
    }
  | {
      kind: "record_event";
      summary: string;
      locationRef?: string | null;
      importance?: number | null;
    };

export interface KeyActorInboxItem {
  id: string;
  route: "direct_observation" | "report" | "rumor" | "system";
  summary: string;
  priority: number;
  worldVersion?: number | null;
  worldTimeMinutes?: number | null;
}

export interface KeyActorInterrupt {
  id: string;
  reason: string;
  priority: number;
  worldVersion?: number | null;
  worldTimeMinutes?: number | null;
}

export interface KeyActorWriteScopeReservation {
  scope: string;
  reservedAtWorldVersion: number;
  expiresAtWorldTimeMinutes?: number | null;
}

export interface KeyActorProcessState {
  version: 1;
  goals: string[];
  activePlan: KeyActorPlanStep | null;
  nextDecisionReason: string | null;
  interrupts: KeyActorInterrupt[];
  inbox: KeyActorInboxItem[];
  privateBeliefCursor: string | null;
  agencyDebt: number;
  reservations: KeyActorWriteScopeReservation[];
}

export interface KeyActorProcessActor {
  id: string;
  name: string;
  tier: "temporary" | "persistent" | "key";
  currentLocationId: string | null;
  currentSceneLocationId: string | null;
  goals: string;
  beliefs: string;
}

export interface KeyActorProcess {
  id: string;
  campaignId: string;
  actorType: "npc";
  actorId: string;
  status: ActorProcessStatus;
  lastWorldVersion: number;
  lastWakeWorldTimeMinutes: number | null;
  nextWakeWorldTimeMinutes: number | null;
  memoryCursor: string | null;
  disabledReason: string | null;
  state: KeyActorProcessState;
  actor: KeyActorProcessActor;
}

export interface BackfillKeyActorProcessesResult {
  campaignId: string;
  insertedActorIds: string[];
  existingActorIds: string[];
}

export interface ActorProcessUpdateResult {
  status: "updated" | "stale_rejected" | "not_found";
  actorId: string;
  previousWorldVersion?: number;
  resultWorldVersion?: number;
}

type ActorProcessRow = typeof actorProcessStates.$inferSelect;
type NpcRow = typeof npcs.$inferSelect;

function now(): number {
  return Date.now();
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter(Boolean);
}

function parseGoals(goalsJson: string | null | undefined): string[] {
  const parsed = parseJsonRecord(goalsJson);
  return [
    ...parseStringArray(parsed.short_term),
    ...parseStringArray(parsed.long_term),
  ];
}

function clampPriority(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(10, Math.round(value)))
    : 0;
}

function normalizePlanStep(value: unknown): KeyActorPlanStep | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  if (!summary) {
    return null;
  }
  return {
    id: typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : "active-plan",
    summary,
    deterministic: record.deterministic === true,
    writeScopes: parseStringArray(record.writeScopes),
    deadlineWorldTimeMinutes:
      typeof record.deadlineWorldTimeMinutes === "number"
        ? Math.max(0, record.deadlineWorldTimeMinutes)
        : null,
    action: normalizeDeterministicPlanAction(record.action),
  };
}

function normalizeDeterministicPlanAction(value: unknown): KeyActorDeterministicPlanAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind.trim() : "";
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";

  if (kind === "travel") {
    const destinationLocationId =
      typeof record.destinationLocationId === "string"
        ? record.destinationLocationId.trim()
        : "";
    const destinationLocationName =
      typeof record.destinationLocationName === "string"
        ? record.destinationLocationName.trim()
        : "";
    if (!destinationLocationId && !destinationLocationName) {
      return null;
    }
    return {
      kind,
      destinationLocationId: destinationLocationId || null,
      destinationLocationName: destinationLocationName || null,
      summary: summary || null,
    };
  }

  if (kind === "wait") {
    return {
      kind,
      durationWorldTimeMinutes:
        typeof record.durationWorldTimeMinutes === "number"
          ? Math.max(0, Math.round(record.durationWorldTimeMinutes))
          : null,
      summary: summary || null,
    };
  }

  if (kind === "record_event" && summary) {
    return {
      kind,
      summary,
      locationRef:
        typeof record.locationRef === "string" && record.locationRef.trim()
          ? record.locationRef.trim()
          : null,
      importance:
        typeof record.importance === "number"
          ? Math.max(1, Math.min(10, Math.round(record.importance)))
          : null,
    };
  }

  return null;
}

function normalizeInboxItems(value: unknown): KeyActorInboxItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const summary = typeof record.summary === "string" ? record.summary.trim() : "";
    if (!summary) {
      return [];
    }
    const route = record.route === "direct_observation"
      || record.route === "report"
      || record.route === "rumor"
      || record.route === "system"
      ? record.route
      : "system";
    return [{
      id: typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `inbox-${index + 1}`,
      route,
      summary,
      priority: clampPriority(record.priority),
      worldVersion:
        typeof record.worldVersion === "number" ? record.worldVersion : null,
      worldTimeMinutes:
        typeof record.worldTimeMinutes === "number" ? record.worldTimeMinutes : null,
    }];
  });
}

function normalizeInterrupts(value: unknown): KeyActorInterrupt[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const reason = typeof record.reason === "string" ? record.reason.trim() : "";
    if (!reason) {
      return [];
    }
    return [{
      id: typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `interrupt-${index + 1}`,
      reason,
      priority: clampPriority(record.priority),
      worldVersion:
        typeof record.worldVersion === "number" ? record.worldVersion : null,
      worldTimeMinutes:
        typeof record.worldTimeMinutes === "number" ? record.worldTimeMinutes : null,
    }];
  });
}

function normalizeReservations(value: unknown): KeyActorWriteScopeReservation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const scope = typeof record.scope === "string" ? record.scope.trim() : "";
    if (!scope) {
      return [];
    }
    return [{
      scope,
      reservedAtWorldVersion:
        typeof record.reservedAtWorldVersion === "number"
          ? record.reservedAtWorldVersion
          : 0,
      expiresAtWorldTimeMinutes:
        typeof record.expiresAtWorldTimeMinutes === "number"
          ? record.expiresAtWorldTimeMinutes
          : null,
    }];
  });
}

export function createInitialKeyActorProcessState(input: {
  goals?: string[];
  worldVersion?: number;
}): KeyActorProcessState {
  return {
    version: 1,
    goals: [...(input.goals ?? [])],
    activePlan: null,
    nextDecisionReason: "initial_backfill",
    interrupts: [],
    inbox: [],
    privateBeliefCursor: null,
    agencyDebt: 0,
    reservations: input.worldVersion !== undefined ? [] : [],
  };
}

export function normalizeKeyActorProcessState(
  value: unknown,
  fallbackGoals: string[] = [],
): KeyActorProcessState {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    version: 1,
    goals: parseStringArray(record.goals).length > 0
      ? parseStringArray(record.goals)
      : [...fallbackGoals],
    activePlan: normalizePlanStep(record.activePlan),
    nextDecisionReason:
      typeof record.nextDecisionReason === "string"
        ? record.nextDecisionReason
        : null,
    interrupts: normalizeInterrupts(record.interrupts),
    inbox: normalizeInboxItems(record.inbox),
    privateBeliefCursor:
      typeof record.privateBeliefCursor === "string"
        ? record.privateBeliefCursor
        : null,
    agencyDebt:
      typeof record.agencyDebt === "number" && Number.isFinite(record.agencyDebt)
        ? Math.max(0, record.agencyDebt)
        : 0,
    reservations: normalizeReservations(record.reservations),
  };
}

function parseStoredProcessState(row: ActorProcessRow, actor: NpcRow): KeyActorProcessState {
  return normalizeKeyActorProcessState(
    parseJsonRecord(row.processState),
    parseGoals(actor.goals),
  );
}

function toActorProcess(row: ActorProcessRow, actor: NpcRow): KeyActorProcess {
  return {
    id: row.id,
    campaignId: row.campaignId,
    actorType: "npc",
    actorId: row.actorId,
    status: row.status,
    lastWorldVersion: row.lastWorldVersion,
    lastWakeWorldTimeMinutes: row.lastWakeWorldTimeMinutes ?? null,
    nextWakeWorldTimeMinutes: row.nextWakeWorldTimeMinutes ?? null,
    memoryCursor: row.memoryCursor ?? null,
    disabledReason: row.disabledReason ?? null,
    state: parseStoredProcessState(row, actor),
    actor: {
      id: actor.id,
      name: actor.name,
      tier: actor.tier,
      currentLocationId: actor.currentLocationId ?? null,
      currentSceneLocationId: actor.currentSceneLocationId ?? null,
      goals: actor.goals,
      beliefs: actor.beliefs,
    },
  };
}

export function backfillKeyActorProcessesForCampaign(input: {
  campaignId: string;
  worldVersion?: number;
  worldTimeMinutes?: number;
  nextWakeDelayMinutes?: number;
}): BackfillKeyActorProcessesResult {
  const db = getDb();
  const clock = readWorldClock(input.campaignId);
  const worldVersion = input.worldVersion ?? clock.worldVersion;
  const worldTimeMinutes = input.worldTimeMinutes ?? clock.worldTimeMinutes;
  const nextWakeDelayMinutes =
    input.nextWakeDelayMinutes ?? KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES;
  const keyActors = db
    .select()
    .from(npcs)
    .where(and(eq(npcs.campaignId, input.campaignId), eq(npcs.tier, "key")))
    .all();
  const existingRows = db
    .select()
    .from(actorProcessStates)
    .where(
      and(
        eq(actorProcessStates.campaignId, input.campaignId),
        eq(actorProcessStates.actorType, "npc"),
      ),
    )
    .all();
  const existingActorIds = new Set(existingRows.map((row) => row.actorId));
  const insertedActorIds: string[] = [];

  for (const actor of keyActors) {
    if (existingActorIds.has(actor.id)) {
      continue;
    }
    upsertActorProcessState({
      campaignId: input.campaignId,
      actorType: "npc",
      actorId: actor.id,
      status: "dormant",
      lastWorldVersion: worldVersion,
      lastWakeWorldTimeMinutes: null,
      nextWakeWorldTimeMinutes: worldTimeMinutes + nextWakeDelayMinutes,
      processState: createInitialKeyActorProcessState({
        goals: parseGoals(actor.goals),
        worldVersion,
      }),
    });
    insertedActorIds.push(actor.id);
  }

  return {
    campaignId: input.campaignId,
    insertedActorIds,
    existingActorIds: [...existingActorIds],
  };
}

export function promotePersistentNpcToActorProcess(input: {
  campaignId: string;
  npcId: string;
  worldVersion?: number;
  worldTimeMinutes?: number;
  nextWakeDelayMinutes?: number;
  reason?: string;
}): boolean {
  const db = getDb();
  const actor = db
    .select()
    .from(npcs)
    .where(and(eq(npcs.campaignId, input.campaignId), eq(npcs.id, input.npcId)))
    .get();
  if (!actor || actor.tier !== "persistent") {
    return false;
  }
  const clock = readWorldClock(input.campaignId);
  const worldVersion = input.worldVersion ?? clock.worldVersion;
  const worldTimeMinutes = input.worldTimeMinutes ?? clock.worldTimeMinutes;
  upsertActorProcessState({
    campaignId: input.campaignId,
    actorType: "npc",
    actorId: actor.id,
    status: "dormant",
    lastWorldVersion: worldVersion,
    lastWakeWorldTimeMinutes: null,
    nextWakeWorldTimeMinutes:
      worldTimeMinutes
      + (input.nextWakeDelayMinutes ?? KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES),
    processState: {
      ...createInitialKeyActorProcessState({
        goals: parseGoals(actor.goals),
        worldVersion,
      }),
      nextDecisionReason: input.reason ?? "persistent_promoted",
    },
  });
  return true;
}

function normalizeSceneScope(locationId?: string | null, sceneScopeId?: string | null): string | null {
  if (!locationId) {
    return null;
  }
  return sceneScopeId && sceneScopeId !== locationId ? sceneScopeId : locationId;
}

export function listDueKeyActorProcessActorIds(input: {
  campaignId: string;
  worldTimeMinutes: number;
}): string[] {
  return getDb()
    .select({ actorId: actorProcessStates.actorId })
    .from(actorProcessStates)
    .where(
      and(
        eq(actorProcessStates.campaignId, input.campaignId),
        eq(actorProcessStates.actorType, "npc"),
        lte(actorProcessStates.nextWakeWorldTimeMinutes, input.worldTimeMinutes),
      ),
    )
    .all()
    .map((row) => row.actorId);
}

export function listKeyActorProcessActorIdsInScope(input: {
  campaignId: string;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  includeBroadLocation?: boolean;
}): string[] {
  if (!input.playerLocationId) {
    return [];
  }

  const rows = getDb()
    .select({
      id: npcs.id,
      tier: npcs.tier,
      currentLocationId: npcs.currentLocationId,
      currentSceneLocationId: npcs.currentSceneLocationId,
    })
    .from(npcs)
    .where(
      and(
        eq(npcs.campaignId, input.campaignId),
        eq(npcs.currentLocationId, input.playerLocationId),
      ),
    )
    .all();
  const playerScope = normalizeSceneScope(input.playerLocationId, input.playerSceneScopeId);

  return rows.flatMap((row) => {
    if (row.tier !== "key" && row.tier !== "persistent") {
      return [];
    }
    const actorScope = normalizeSceneScope(row.currentLocationId, row.currentSceneLocationId);
    if (actorScope === playerScope || input.includeBroadLocation === true) {
      return [row.id];
    }
    return [];
  });
}

export function listKeyActorProcessesByActorIds(input: {
  campaignId: string;
  actorIds: readonly string[];
  backfill?: boolean;
}): KeyActorProcess[] {
  const actorIds = [...new Set(input.actorIds)].filter(Boolean);
  if (actorIds.length === 0) {
    return [];
  }
  if (input.backfill === true) {
    backfillKeyActorProcessesForCampaign({ campaignId: input.campaignId });
  }

  const rows = getDb()
    .select()
    .from(actorProcessStates)
    .where(
      and(
        eq(actorProcessStates.campaignId, input.campaignId),
        eq(actorProcessStates.actorType, "npc"),
        inArray(actorProcessStates.actorId, actorIds),
      ),
    )
    .all();
  if (rows.length === 0) {
    return [];
  }
  const actors = getDb()
    .select()
    .from(npcs)
    .where(
      and(
        eq(npcs.campaignId, input.campaignId),
        inArray(npcs.id, rows.map((row) => row.actorId)),
      ),
    )
    .all();
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));

  return rows.flatMap((row) => {
    const actor = actorById.get(row.actorId);
    if (!actor) {
      return [];
    }
    if (actor.tier !== "key" && actor.tier !== "persistent") {
      return [];
    }
    return [toActorProcess(row, actor)];
  });
}

export function listKeyActorProcessesForCampaign(input: {
  campaignId: string;
  backfill?: boolean;
}): KeyActorProcess[] {
  if (input.backfill !== false) {
    backfillKeyActorProcessesForCampaign({ campaignId: input.campaignId });
  }

  const db = getDb();
  const rows = db
    .select()
    .from(actorProcessStates)
    .where(
      and(
        eq(actorProcessStates.campaignId, input.campaignId),
        eq(actorProcessStates.actorType, "npc"),
      ),
    )
    .all();
  if (rows.length === 0) {
    return [];
  }
  const actors = db
    .select()
    .from(npcs)
    .where(
      and(
        eq(npcs.campaignId, input.campaignId),
        inArray(npcs.id, rows.map((row) => row.actorId)),
      ),
    )
    .all();
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));

  return rows.flatMap((row) => {
    const actor = actorById.get(row.actorId);
    if (!actor) {
      return [];
    }
    if (actor.tier !== "key" && actor.tier !== "persistent") {
      return [];
    }
    return [toActorProcess(row, actor)];
  });
}

export function updateActorProcessAfterDecision(input: {
  campaignId: string;
  actorId: string;
  expectedBaseWorldVersion: number;
  resultWorldVersion: number;
  lastWakeWorldTimeMinutes?: number | null;
  nextWakeWorldTimeMinutes?: number | null;
  status?: ActorProcessStatus;
  processState: KeyActorProcessState;
}): ActorProcessUpdateResult {
  const db = getDb();
  const row = db
    .select()
    .from(actorProcessStates)
    .where(
      and(
        eq(actorProcessStates.campaignId, input.campaignId),
        eq(actorProcessStates.actorType, "npc"),
        eq(actorProcessStates.actorId, input.actorId),
      ),
    )
    .get();
  if (!row) {
    return { status: "not_found", actorId: input.actorId };
  }
  if (row.lastWorldVersion > input.expectedBaseWorldVersion) {
    return {
      status: "stale_rejected",
      actorId: input.actorId,
      previousWorldVersion: row.lastWorldVersion,
    };
  }

  const updateResult = db
    .update(actorProcessStates)
    .set({
      status: input.status ?? "waiting",
      lastWorldVersion: input.resultWorldVersion,
      lastWakeWorldTimeMinutes: input.lastWakeWorldTimeMinutes ?? row.lastWakeWorldTimeMinutes,
      nextWakeWorldTimeMinutes: input.nextWakeWorldTimeMinutes ?? null,
      processState: JSON.stringify(input.processState),
      disabledReason: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(actorProcessStates.campaignId, input.campaignId),
        eq(actorProcessStates.actorType, "npc"),
        eq(actorProcessStates.actorId, input.actorId),
        eq(actorProcessStates.lastWorldVersion, row.lastWorldVersion),
      ),
    )
    .run();

  if (updateResult.changes !== 1) {
    return {
      status: "stale_rejected",
      actorId: input.actorId,
      previousWorldVersion: row.lastWorldVersion,
    };
  }
  return {
    status: "updated",
    actorId: input.actorId,
    previousWorldVersion: row.lastWorldVersion,
    resultWorldVersion: input.resultWorldVersion,
  };
}
