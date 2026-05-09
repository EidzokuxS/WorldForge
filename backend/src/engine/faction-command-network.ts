import crypto from "node:crypto";
import { and, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  factionCommandNodes,
  factionOperations,
  factionReports,
  factionResourceLedger,
  factionResources,
  factions,
} from "../db/schema.js";
import {
  buildCommandNodeFrame,
  type ActorFrameExternalFactInput,
  type CommandNodeFrame,
} from "./actor-frame.js";
import {
  commitAuthorityTrace,
  readWorldClock,
  validateBaseWorldVersion,
} from "./living-world-authority.js";
import {
  recordActorKnowledge,
  type ActorKnowledgeRoute,
} from "./knowledge-model.js";
import { recordLocationRecentEvent } from "./location-events.js";
import type { ToolResultAuthority } from "./tool-result.js";

export type FactionReportRoute =
  | "direct_observation"
  | "report_message"
  | "rumor"
  | "public_record";

export type FactionReportStatus =
  | "in_transit"
  | "available"
  | "consumed"
  | "invalidated";

export type FactionOperationStatus =
  | "proposed"
  | "committed"
  | "blocked"
  | "canceled";

export interface FactionCommandNodeRecord {
  id: string;
  campaignId: string;
  factionId: string;
  label: string;
  locationId: string | null;
  authorityActorId: string | null;
  status: "active" | "paused" | "disabled";
  standingOrders: string[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface FactionReportRecord {
  id: string;
  campaignId: string;
  factionId: string;
  commandNodeId: string;
  sourceActorId: string | null;
  sourceLocationId: string | null;
  route: FactionReportRoute;
  status: FactionReportStatus;
  summary: string;
  sourceEventIds: string[];
  sourceKnowledgeIds: string[];
  hiddenCauseTerms: string[];
  baseWorldVersion: number;
  createdWorldTimeMinutes: number;
  deliverAtWorldTimeMinutes: number;
  deliveredWorldTimeMinutes: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FactionResourceRecord {
  id: string;
  campaignId: string;
  factionId: string;
  resourceKey: string;
  label: string;
  quantity: number;
  reservedQuantity: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface FactionOperationRecord {
  id: string;
  campaignId: string;
  factionId: string;
  commandNodeId: string;
  status: FactionOperationStatus;
  operationKind: string;
  summary: string;
  requiredReportIds: string[];
  resourceCosts: Record<string, number>;
  targetLocationId: string | null;
  baseWorldVersion: number;
  committedWorldVersion: number | null;
  authorityTraceId: string | null;
  blockedReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export type FactionOperationProposalResult =
  | { status: "proposed"; operation: FactionOperationRecord }
  | { status: "blocked"; reason: string; operation: FactionOperationRecord | null };

export type FactionOperationCommitResult =
  | {
      status: "committed";
      operation: FactionOperationRecord;
      authority: ToolResultAuthority;
    }
  | { status: "blocked"; reason: string; operation: FactionOperationRecord | null };

type LocationId = string;

function now(): number {
  return Date.now();
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeStringArray(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function stringifyArray(values: readonly string[] | undefined): string {
  return JSON.stringify(normalizeStringArray(values));
}

function stringifyRecord(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {});
}

function hydrateCommandNode(
  row: typeof factionCommandNodes.$inferSelect,
): FactionCommandNodeRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    factionId: row.factionId,
    label: row.label,
    locationId: row.locationId,
    authorityActorId: row.authorityActorId,
    status: row.status,
    standingOrders: parseStringArray(row.standingOrders),
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hydrateReport(row: typeof factionReports.$inferSelect): FactionReportRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    factionId: row.factionId,
    commandNodeId: row.commandNodeId,
    sourceActorId: row.sourceActorId,
    sourceLocationId: row.sourceLocationId,
    route: row.route,
    status: row.status,
    summary: row.summary,
    sourceEventIds: parseStringArray(row.sourceEventIds),
    sourceKnowledgeIds: parseStringArray(row.sourceKnowledgeIds),
    hiddenCauseTerms: parseStringArray(row.hiddenCauseTerms),
    baseWorldVersion: row.baseWorldVersion,
    createdWorldTimeMinutes: row.createdWorldTimeMinutes,
    deliverAtWorldTimeMinutes: row.deliverAtWorldTimeMinutes,
    deliveredWorldTimeMinutes: row.deliveredWorldTimeMinutes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hydrateResource(row: typeof factionResources.$inferSelect): FactionResourceRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    factionId: row.factionId,
    resourceKey: row.resourceKey,
    label: row.label,
    quantity: row.quantity,
    reservedQuantity: row.reservedQuantity,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hydrateOperation(row: typeof factionOperations.$inferSelect): FactionOperationRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    factionId: row.factionId,
    commandNodeId: row.commandNodeId,
    status: row.status,
    operationKind: row.operationKind,
    summary: row.summary,
    requiredReportIds: parseStringArray(row.requiredReportIds),
    resourceCosts: normalizeResourceCosts(parseJsonRecord(row.resourceCosts)),
    targetLocationId: row.targetLocationId,
    baseWorldVersion: row.baseWorldVersion,
    committedWorldVersion: row.committedWorldVersion,
    authorityTraceId: row.authorityTraceId,
    blockedReason: row.blockedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function defaultNodeLabel(factionName: string): string {
  return `${factionName} command`;
}

function readFaction(input: { campaignId: string; factionId: string }) {
  return getDb()
    .select()
    .from(factions)
    .where(
      and(
        eq(factions.campaignId, input.campaignId),
        eq(factions.id, input.factionId),
      ),
    )
    .get();
}

export function ensureFactionCommandNode(input: {
  campaignId: string;
  factionId: string;
  label?: string;
  locationId?: string | null;
  authorityActorId?: string | null;
  standingOrders?: readonly string[];
  metadata?: Record<string, unknown>;
}): FactionCommandNodeRecord {
  const faction = readFaction(input);
  if (!faction) {
    throw new Error(`Faction command node cannot attach to missing faction ${input.factionId}.`);
  }
  const label = input.label?.trim() || defaultNodeLabel(faction.name);
  const existing = getDb()
    .select()
    .from(factionCommandNodes)
    .where(
      and(
        eq(factionCommandNodes.campaignId, input.campaignId),
        eq(factionCommandNodes.factionId, input.factionId),
        eq(factionCommandNodes.label, label),
      ),
    )
    .get();
  if (existing) {
    return hydrateCommandNode(existing);
  }

  const timestamp = now();
  const row = {
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    factionId: input.factionId,
    label,
    locationId: input.locationId ?? null,
    authorityActorId: input.authorityActorId ?? null,
    status: "active",
    standingOrders: stringifyArray(input.standingOrders ?? parseStringArray(faction.goals)),
    metadata: stringifyRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies typeof factionCommandNodes.$inferInsert;
  getDb().insert(factionCommandNodes).values(row).run();
  return hydrateCommandNode(row as typeof factionCommandNodes.$inferSelect);
}

export function ensureFactionResource(input: {
  campaignId: string;
  factionId: string;
  resourceKey: string;
  label?: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}): FactionResourceRecord {
  const resourceKey = input.resourceKey.trim();
  if (!resourceKey) {
    throw new Error("Faction resource key cannot be empty.");
  }
  const label = input.label?.trim() || resourceKey;
  const existing = getDb()
    .select()
    .from(factionResources)
    .where(
      and(
        eq(factionResources.campaignId, input.campaignId),
        eq(factionResources.factionId, input.factionId),
        eq(factionResources.resourceKey, resourceKey),
      ),
    )
    .get();
  if (existing) {
    return hydrateResource(existing);
  }

  const timestamp = now();
  const row = {
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    factionId: input.factionId,
    resourceKey,
    label,
    quantity: Math.max(0, Math.round(input.quantity ?? 0)),
    reservedQuantity: 0,
    metadata: stringifyRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies typeof factionResources.$inferInsert;
  getDb().insert(factionResources).values(row).run();
  return hydrateResource(row as typeof factionResources.$inferSelect);
}

export function createFactionReport(input: {
  campaignId: string;
  factionId: string;
  commandNodeId?: string | null;
  summary: string;
  route: FactionReportRoute;
  sourceActorId?: string | null;
  sourceLocationId?: string | null;
  sourceEventIds?: readonly string[];
  sourceKnowledgeIds?: readonly string[];
  hiddenCauseTerms?: readonly string[];
  deliveryDelayWorldTimeMinutes?: number;
}): FactionReportRecord {
  const summary = input.summary.trim();
  if (!summary) {
    throw new Error("Faction report summary cannot be empty.");
  }
  const commandNode = input.commandNodeId
    ? getDb()
        .select()
        .from(factionCommandNodes)
        .where(
          and(
            eq(factionCommandNodes.campaignId, input.campaignId),
            eq(factionCommandNodes.id, input.commandNodeId),
            eq(factionCommandNodes.factionId, input.factionId),
          ),
        )
        .get()
    : ensureFactionCommandNode({
        campaignId: input.campaignId,
        factionId: input.factionId,
      });
  if (!commandNode) {
    throw new Error(`Faction report cannot route to missing command node ${input.commandNodeId}.`);
  }

  const node = "standingOrders" in commandNode
    ? commandNode as FactionCommandNodeRecord
    : hydrateCommandNode(commandNode);
  const clock = readWorldClock(input.campaignId);
  const delay = Math.max(0, Math.round(input.deliveryDelayWorldTimeMinutes ?? 0));
  const timestamp = now();
  const reportId = crypto.randomUUID();
  const sourceEventIds = normalizeStringArray(input.sourceEventIds);
  const sourceKnowledgeIds = normalizeStringArray(input.sourceKnowledgeIds);
  const row = {
    id: reportId,
    campaignId: input.campaignId,
    factionId: input.factionId,
    commandNodeId: node.id,
    sourceActorId: input.sourceActorId ?? null,
    sourceLocationId: input.sourceLocationId ?? null,
    route: input.route,
    status: delay > 0 ? "in_transit" : "available",
    summary,
    sourceEventIds: JSON.stringify(sourceEventIds),
    sourceKnowledgeIds: JSON.stringify(sourceKnowledgeIds),
    hiddenCauseTerms: stringifyArray(input.hiddenCauseTerms),
    baseWorldVersion: clock.worldVersion,
    createdWorldTimeMinutes: clock.worldTimeMinutes,
    deliverAtWorldTimeMinutes: clock.worldTimeMinutes + delay,
    deliveredWorldTimeMinutes: delay > 0 ? null : clock.worldTimeMinutes,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies typeof factionReports.$inferInsert;

  getDb().insert(factionReports).values(row).run();
  const knowledge = recordActorKnowledge({
    campaignId: input.campaignId,
    actorId: `command-node:${node.id}`,
    route: input.route as ActorKnowledgeRoute,
    truthStatus: input.route === "rumor" ? "rumored" : "reported",
    statement: summary,
    sourceActorId: input.sourceActorId ?? null,
    sourceEventIds,
    sourceKnowledgeIds,
    subjectRefs: [input.factionId, node.id, input.sourceLocationId ?? ""],
    privacy: input.route === "public_record" ? "public" : "shared",
    deliveredWorldTimeMinutes: row.deliveredWorldTimeMinutes,
    metadata: { factionReportId: reportId },
  });
  const reportKnowledgeIds = [knowledge.id, ...sourceKnowledgeIds];
  getDb()
    .update(factionReports)
    .set({
      sourceKnowledgeIds: JSON.stringify(reportKnowledgeIds),
      updatedAt: timestamp,
    })
    .where(eq(factionReports.id, reportId))
    .run();

  return hydrateReport({
    ...row,
    sourceKnowledgeIds: JSON.stringify(reportKnowledgeIds),
  } as typeof factionReports.$inferSelect);
}

export function markDeliverableFactionReports(input: {
  campaignId: string;
  worldTimeMinutes?: number;
}): void {
  const clock = readWorldClock(input.campaignId);
  const worldTimeMinutes = input.worldTimeMinutes ?? clock.worldTimeMinutes;
  getDb()
    .update(factionReports)
    .set({
      status: "available",
      deliveredWorldTimeMinutes: worldTimeMinutes,
      updatedAt: now(),
    })
    .where(
      and(
        eq(factionReports.campaignId, input.campaignId),
        eq(factionReports.status, "in_transit"),
        lte(factionReports.deliverAtWorldTimeMinutes, worldTimeMinutes),
      ),
    )
    .run();
}

export function listAvailableFactionReports(input: {
  campaignId: string;
  commandNodeId: string;
  limit?: number;
}): FactionReportRecord[] {
  markDeliverableFactionReports({ campaignId: input.campaignId });
  return getDb()
    .select()
    .from(factionReports)
    .where(
      and(
        eq(factionReports.campaignId, input.campaignId),
        eq(factionReports.commandNodeId, input.commandNodeId),
        eq(factionReports.status, "available"),
      ),
    )
    .limit(input.limit ?? 12)
    .all()
    .map(hydrateReport);
}

function normalizeResourceCosts(value: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error(`Invalid faction resource cost for ${normalizedKey}.`);
    }
    result[normalizedKey] = Math.round(numeric);
  }
  return result;
}

function costEntries(costs: Record<string, number>): Array<[string, number]> {
  return Object.entries(costs).filter(([, cost]) => cost > 0);
}

function validateReportsForOperation(input: {
  campaignId: string;
  factionId: string;
  commandNodeId: string;
  requiredReportIds: readonly string[];
}): string | null {
  const requiredReportIds = normalizeStringArray(input.requiredReportIds);
  if (requiredReportIds.length === 0) {
    return null;
  }
  markDeliverableFactionReports({ campaignId: input.campaignId });
  const reports = getDb()
    .select()
    .from(factionReports)
    .where(
      and(
        eq(factionReports.campaignId, input.campaignId),
        eq(factionReports.factionId, input.factionId),
        eq(factionReports.commandNodeId, input.commandNodeId),
        inArray(factionReports.id, requiredReportIds),
      ),
    )
    .all();
  const availableIds = new Set(
    reports.filter((report) => report.status === "available").map((report) => report.id),
  );
  const missing = requiredReportIds.filter((reportId) => !availableIds.has(reportId));
  return missing.length > 0
    ? `missing_or_unavailable_reports:${missing.join(",")}`
    : null;
}

function validateResourcesForOperation(input: {
  campaignId: string;
  factionId: string;
  resourceCosts: Record<string, number>;
}): string | null {
  const costs = costEntries(input.resourceCosts);
  if (costs.length === 0) {
    return "missing_resource_route";
  }
  const rows = getDb()
    .select()
    .from(factionResources)
    .where(
      and(
        eq(factionResources.campaignId, input.campaignId),
        eq(factionResources.factionId, input.factionId),
        inArray(factionResources.resourceKey, costs.map(([key]) => key)),
      ),
    )
    .all()
    .map(hydrateResource);
  const byKey = new Map(rows.map((resource) => [resource.resourceKey, resource]));
  for (const [key, cost] of costs) {
    const resource = byKey.get(key);
    const available = (resource?.quantity ?? 0) - (resource?.reservedQuantity ?? 0);
    if (available < cost) {
      return `insufficient_resource:${key}`;
    }
  }
  return null;
}

function insertOperation(input: {
  campaignId: string;
  factionId: string;
  commandNodeId: string;
  status: FactionOperationStatus;
  operationKind: string;
  summary: string;
  requiredReportIds: readonly string[];
  resourceCosts: Record<string, number>;
  targetLocationId?: LocationId | null;
  baseWorldVersion: number;
  blockedReason?: string | null;
}): FactionOperationRecord {
  const timestamp = now();
  const row = {
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    factionId: input.factionId,
    commandNodeId: input.commandNodeId,
    status: input.status,
    operationKind: input.operationKind,
    summary: input.summary,
    requiredReportIds: stringifyArray(input.requiredReportIds),
    resourceCosts: JSON.stringify(input.resourceCosts),
    targetLocationId: input.targetLocationId ?? null,
    baseWorldVersion: input.baseWorldVersion,
    committedWorldVersion: null,
    authorityTraceId: null,
    blockedReason: input.blockedReason ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies typeof factionOperations.$inferInsert;
  getDb().insert(factionOperations).values(row).run();
  return hydrateOperation(row as typeof factionOperations.$inferSelect);
}

export function proposeFactionOperation(input: {
  campaignId: string;
  factionId: string;
  commandNodeId: string;
  operationKind: string;
  summary: string;
  requiredReportIds?: readonly string[];
  resourceCosts: Record<string, number>;
  targetLocationId?: string | null;
  baseWorldVersion?: number;
}): FactionOperationProposalResult {
  const summary = input.summary.trim();
  if (!summary) {
    throw new Error("Faction operation summary cannot be empty.");
  }
  const clock = readWorldClock(input.campaignId);
  const baseWorldVersion = input.baseWorldVersion ?? clock.worldVersion;
  validateBaseWorldVersion({
    campaignId: input.campaignId,
    baseWorldVersion,
  });

  const nodeRow = getDb()
    .select()
    .from(factionCommandNodes)
    .where(
      and(
        eq(factionCommandNodes.campaignId, input.campaignId),
        eq(factionCommandNodes.id, input.commandNodeId),
        eq(factionCommandNodes.factionId, input.factionId),
      ),
    )
    .get();
  if (!nodeRow) {
    return { status: "blocked", reason: "missing_command_node", operation: null };
  }

  const node = hydrateCommandNode(nodeRow);
  const requiredReportIds = normalizeStringArray(input.requiredReportIds);
  if (requiredReportIds.length === 0 && node.standingOrders.length === 0) {
    const operation = insertOperation({
      ...input,
      status: "blocked",
      summary,
      requiredReportIds,
      resourceCosts: normalizeResourceCosts(input.resourceCosts),
      baseWorldVersion,
      blockedReason: "missing_report_or_standing_order",
    });
    return { status: "blocked", reason: "missing_report_or_standing_order", operation };
  }

  const resourceCosts = normalizeResourceCosts(input.resourceCosts);
  const reportError = validateReportsForOperation({
    campaignId: input.campaignId,
    factionId: input.factionId,
    commandNodeId: input.commandNodeId,
    requiredReportIds,
  });
  const resourceError = validateResourcesForOperation({
    campaignId: input.campaignId,
    factionId: input.factionId,
    resourceCosts,
  });
  const blockedReason = reportError ?? resourceError;
  const operation = insertOperation({
    campaignId: input.campaignId,
    factionId: input.factionId,
    commandNodeId: input.commandNodeId,
    status: blockedReason ? "blocked" : "proposed",
    operationKind: input.operationKind,
    summary,
    requiredReportIds,
    resourceCosts,
    targetLocationId: input.targetLocationId ?? null,
    baseWorldVersion,
    blockedReason,
  });

  return blockedReason
    ? { status: "blocked", reason: blockedReason, operation }
    : { status: "proposed", operation };
}

function blockOperation(
  operation: FactionOperationRecord | null,
  reason: string,
): FactionOperationCommitResult {
  if (operation) {
    getDb()
      .update(factionOperations)
      .set({
        status: "blocked",
        blockedReason: reason,
        updatedAt: now(),
      })
      .where(eq(factionOperations.id, operation.id))
      .run();
  }
  return { status: "blocked", reason, operation };
}

export function commitFactionOperation(input: {
  campaignId: string;
  operationId: string;
  surfaceSummary?: string | null;
  surfaceLocationRef?: string | null;
  elapsedWorldTimeMinutes?: number;
}): FactionOperationCommitResult {
  const row = getDb()
    .select()
    .from(factionOperations)
    .where(
      and(
        eq(factionOperations.campaignId, input.campaignId),
        eq(factionOperations.id, input.operationId),
      ),
    )
    .get();
  if (!row) {
    return { status: "blocked", reason: "operation_not_found", operation: null };
  }
  const operation = hydrateOperation(row);
  if (operation.status !== "proposed") {
    return blockOperation(operation, `operation_not_proposed:${operation.status}`);
  }

  const reportError = validateReportsForOperation({
    campaignId: operation.campaignId,
    factionId: operation.factionId,
    commandNodeId: operation.commandNodeId,
    requiredReportIds: operation.requiredReportIds,
  });
  if (reportError) {
    return blockOperation(operation, reportError);
  }
  const resourceError = validateResourcesForOperation({
    campaignId: operation.campaignId,
    factionId: operation.factionId,
    resourceCosts: operation.resourceCosts,
  });
  if (resourceError) {
    return blockOperation(operation, resourceError);
  }

  const authority = commitAuthorityTrace({
    campaignId: operation.campaignId,
    operation: `faction:${operation.operationKind}`,
    baseWorldVersion: operation.baseWorldVersion,
    sourceEntity: { type: "faction_command_node", id: operation.commandNodeId },
    elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes ?? 1,
    eventIds: [operation.id, ...operation.requiredReportIds],
    stateDeltaRefs: [
      `faction:${operation.factionId}`,
      `faction-command-node:${operation.commandNodeId}`,
      ...Object.keys(operation.resourceCosts).map((key) => `faction-resource:${key}`),
    ],
    metadata: {
      operationId: operation.id,
      operationKind: operation.operationKind,
      summary: operation.summary,
      requiredReportIds: operation.requiredReportIds,
      resourceCosts: operation.resourceCosts,
    },
  });

  const timestamp = now();
  const resultWorldVersion =
    authority.resultWorldVersion ?? operation.baseWorldVersion + 1;
  const resultWorldTimeMinutes =
    authority.worldTimeMinutes
    ?? readWorldClock(operation.campaignId).worldTimeMinutes;
  for (const [resourceKey, cost] of costEntries(operation.resourceCosts)) {
    const resource = getDb()
      .select()
      .from(factionResources)
      .where(
        and(
          eq(factionResources.campaignId, operation.campaignId),
          eq(factionResources.factionId, operation.factionId),
          eq(factionResources.resourceKey, resourceKey),
        ),
      )
      .get();
    if (!resource) continue;
    getDb()
      .update(factionResources)
      .set({
        quantity: Math.max(0, resource.quantity - cost),
        updatedAt: timestamp,
      })
      .where(eq(factionResources.id, resource.id))
      .run();
    getDb()
      .insert(factionResourceLedger)
      .values({
        id: crypto.randomUUID(),
        campaignId: operation.campaignId,
        factionId: operation.factionId,
        operationId: operation.id,
        resourceKey,
        delta: -cost,
        reason: operation.summary,
        baseWorldVersion: operation.baseWorldVersion,
        resultWorldVersion,
        createdWorldTimeMinutes: resultWorldTimeMinutes,
        createdAt: timestamp,
      })
      .run();
  }

  if (operation.requiredReportIds.length > 0) {
    getDb()
      .update(factionReports)
      .set({
        status: "consumed",
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(factionReports.campaignId, operation.campaignId),
          inArray(factionReports.id, operation.requiredReportIds),
        ),
      )
      .run();
  }

  if (input.surfaceSummary?.trim() && input.surfaceLocationRef) {
    recordLocationRecentEvent({
      campaignId: operation.campaignId,
      locationRef: input.surfaceLocationRef,
      tick: resultWorldTimeMinutes,
      eventType: "faction_operation_signal",
      summary: input.surfaceSummary.trim(),
      importance: 3,
      sourceEventId: operation.id,
      surfaceRoute: "faction_report",
      visibility: "local_signal",
      knowledgeRoute: "report_message",
    });
  }

  getDb()
    .update(factionOperations)
    .set({
      status: "committed",
      committedWorldVersion: resultWorldVersion,
      authorityTraceId: authority.toolResultId,
      updatedAt: timestamp,
    })
    .where(eq(factionOperations.id, operation.id))
    .run();

  return {
    status: "committed",
    operation: {
      ...operation,
      status: "committed",
      committedWorldVersion: resultWorldVersion,
      authorityTraceId: authority.toolResultId,
      updatedAt: timestamp,
    },
    authority,
  };
}

function reportToExternalFact(report: FactionReportRecord): ActorFrameExternalFactInput {
  return {
    id: `faction-report:${report.id}`,
    route: report.route === "direct_observation" ? "report_message" : report.route,
    text: report.summary,
    subjectRefs: [
      report.factionId,
      report.commandNodeId,
      report.sourceLocationId ?? "",
    ].filter(Boolean),
    confidence: report.route === "rumor" ? 0.45 : 0.75,
    reliability: report.route === "rumor" ? 0.35 : 0.75,
    sourceEventIds: report.sourceEventIds,
    sourceKnowledgeIds: [report.id, ...report.sourceKnowledgeIds],
    authorityTraceIds: [],
    deliveredAtWorldTimeMinutes: report.deliveredWorldTimeMinutes,
  };
}

export function buildFactionCommandNodeFrame(input: {
  campaignId: string;
  commandNodeId: string;
  worldVersion?: number | null;
}): CommandNodeFrame {
  const nodeRow = getDb()
    .select()
    .from(factionCommandNodes)
    .where(
      and(
        eq(factionCommandNodes.campaignId, input.campaignId),
        eq(factionCommandNodes.id, input.commandNodeId),
      ),
    )
    .get();
  if (!nodeRow) {
    throw new Error(`Command node not found: ${input.commandNodeId}.`);
  }
  const node = hydrateCommandNode(nodeRow);
  const reports = listAvailableFactionReports({
    campaignId: input.campaignId,
    commandNodeId: input.commandNodeId,
  });
  return buildCommandNodeFrame({
    campaignId: input.campaignId,
    commandNodeId: input.commandNodeId,
    label: node.label,
    worldVersion: input.worldVersion ?? readWorldClock(input.campaignId).worldVersion,
    reports: reports.map(reportToExternalFact),
    goals: node.standingOrders,
    legalTools: ["log_event"],
    constraints: [
      "Faction operations require a command node, source report or standing order, and validated resources before state can change.",
      "Do not act on rumors as verified truth unless a later report or authority trace confirms them.",
    ],
  });
}
